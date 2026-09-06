import { describe, expect, it } from "vitest";
import { selectEvidence } from "../src/domain/evidence";

const pages = [
  { pageNumber: 1, text: "Abstract and introduction about industrial development." },
  { pageNumber: 2, text: "The paper explains contextual classification with language models." },
  { pageNumber: 3, text: "A table reports keyword coverage and manual verification cost." },
  { pageNumber: 4, text: "Unrelated appendix material." },
];

describe("论文证据选择", () => {
  it("优先选取实际读过且接近当前页的文字", () => {
    const result = selectEvidence({
      pages,
      readPages: [2, 3],
      currentPage: 3,
      learningGoal: "",
      maxPages: 2,
    });
    expect(result.map((item) => item.pageNumber)).toEqual([2, 3]);
  });

  it("学习目标可提升直接相关页面，但严格限制发送字符数", () => {
    const result = selectEvidence({
      pages,
      readPages: [1, 3],
      currentPage: 1,
      learningGoal: "keyword coverage",
      maxPages: 3,
      maxCharacters: 70,
    });
    expect(result.some((item) => item.pageNumber === 3)).toBe(true);
    expect(result.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(70);
  });
});
