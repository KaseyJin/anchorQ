import { DEFAULT_PROVIDER, type AppState, type ProviderSummary, type Settings } from "../domain/types";

const STATE_KEY = "anchorq.appState";
const SETTINGS_KEY = "anchorq.settings";
const PROVIDER_KEY = "anchorq.provider";
const PROVIDER_SECRET_KEY = "anchorq.providerSecret";
const PAPER_PAGE_PREFIX = "anchorq.paperPage.";

export interface ProviderRuntime {
  baseUrl: string;
  model: string;
  apiKey: string;
  consentGranted: boolean;
}

export async function loadSessionState(): Promise<AppState | null> {
  const result = await chrome.storage.session.get(STATE_KEY);
  return (result[STATE_KEY] as AppState | undefined) ?? null;
}

export async function saveSessionState(state: AppState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

export async function clearSessionState(): Promise<void> {
  await chrome.storage.session.remove(STATE_KEY);
}

export async function loadSettings(): Promise<Partial<Settings>> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return (result[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {};
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadProviderSummary(): Promise<ProviderSummary> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(PROVIDER_KEY),
    chrome.storage.session.get(PROVIDER_SECRET_KEY),
  ]);
  const saved = (local[PROVIDER_KEY] as Partial<ProviderSummary> | undefined) ?? {};
  const apiKey = session[PROVIDER_SECRET_KEY];
  return {
    ...DEFAULT_PROVIDER,
    ...saved,
    configured: typeof apiKey === "string" && Boolean(apiKey.trim()),
  };
}

export async function saveProviderConfig(input: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  consentGranted: boolean;
}): Promise<ProviderSummary> {
  const summary: ProviderSummary = {
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    model: input.model.trim(),
    configured: Boolean(input.apiKey?.trim()) || (await loadProviderSummary()).configured,
    consentGranted: input.consentGranted,
  };
  await chrome.storage.local.set({ [PROVIDER_KEY]: { ...summary, configured: false } });
  if (input.apiKey?.trim()) {
    await chrome.storage.session.set({ [PROVIDER_SECRET_KEY]: input.apiKey.trim() });
  }
  return loadProviderSummary();
}

export async function clearProviderConfig(): Promise<ProviderSummary> {
  await Promise.all([
    chrome.storage.local.remove(PROVIDER_KEY),
    chrome.storage.session.remove(PROVIDER_SECRET_KEY),
  ]);
  return { ...DEFAULT_PROVIDER };
}

export async function loadProviderRuntime(): Promise<ProviderRuntime> {
  const [summary, session] = await Promise.all([
    loadProviderSummary(),
    chrome.storage.session.get(PROVIDER_SECRET_KEY),
  ]);
  const apiKey = typeof session[PROVIDER_SECRET_KEY] === "string"
    ? session[PROVIDER_SECRET_KEY].trim()
    : "";
  if (!summary.consentGranted) throw new Error("请先在模型设置中同意发送学习内容。 ");
  if (!apiKey) throw new Error("模型 Key 尚未配置，或已随浏览器关闭而清除。 ");
  return { baseUrl: summary.baseUrl, model: summary.model, apiKey, consentGranted: true };
}

export async function savePaperPages(
  sessionId: string,
  pages: Array<{ pageNumber: number; text: string }>,
): Promise<void> {
  const values = Object.fromEntries(pages.map((page) => [
    `${PAPER_PAGE_PREFIX}${sessionId}.${page.pageNumber}`,
    { pageNumber: page.pageNumber, text: page.text.slice(0, 12000) },
  ]));
  if (Object.keys(values).length) await chrome.storage.session.set(values);
}

export async function loadPaperPages(sessionId: string): Promise<Array<{ pageNumber: number; text: string }>> {
  const all = await chrome.storage.session.get(null);
  const prefix = `${PAPER_PAGE_PREFIX}${sessionId}.`;
  return Object.entries(all)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value as { pageNumber: number; text: string })
    .filter((page) => Number.isInteger(page.pageNumber) && typeof page.text === "string")
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export async function clearPaperPages(sessionId: string): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const prefix = `${PAPER_PAGE_PREFIX}${sessionId}.`;
  const keys = Object.keys(all).filter((key) => key.startsWith(prefix));
  if (keys.length) await chrome.storage.session.remove(keys);
}
