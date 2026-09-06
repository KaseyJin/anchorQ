import type { PaperEvidence } from "./types";

function terms(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g) ?? [];
  return [...new Set(words.flatMap((word) => {
    if (/^[\u3400-\u9fff]+$/.test(word) && word.length > 3) {
      return [word, ...Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))];
    }
    return [word];
  }))];
}

export function selectEvidence(input: {
  pages: PaperEvidence[];
  readPages: number[];
  currentPage: number;
  learningGoal: string;
  maxPages?: number;
  maxCharacters?: number;
}): PaperEvidence[] {
  const maxPages = input.maxPages ?? 6;
  const maxCharacters = input.maxCharacters ?? 14000;
  const read = new Set(input.readPages);
  if (!read.size) read.add(input.currentPage);
  const queryTerms = terms(input.learningGoal);
  const ranked = input.pages
    .filter((page) => page.text.trim() && read.has(page.pageNumber))
    .map((page) => {
      const lower = page.text.toLowerCase();
      const lexical = queryTerms.reduce((score, term) => score + (lower.includes(term) ? 5 : 0), 0);
      const distance = Math.abs(page.pageNumber - input.currentPage);
      return {
        page,
        score: lexical + 100 + (page.pageNumber === input.currentPage ? 40 : 0) - Math.min(distance, 30),
      };
    })
    .sort((a, b) => b.score - a.score || a.page.pageNumber - b.page.pageNumber);

  const selected: PaperEvidence[] = [];
  let used = 0;
  for (const { page } of ranked) {
    if (selected.length >= maxPages || used >= maxCharacters) break;
    const remaining = maxCharacters - used;
    const text = page.text.slice(0, remaining).trim();
    if (!text) continue;
    selected.push({ pageNumber: page.pageNumber, text });
    used += text.length;
  }
  return selected.sort((a, b) => a.pageNumber - b.pageNumber);
}
