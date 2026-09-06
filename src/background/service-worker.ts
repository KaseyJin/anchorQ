import { continueDialogue, diagnoseAnswer, generateQuestion, testProviderConnection } from "../agent/atlas-client";
import { selectEvidence } from "../domain/evidence";
import { revealChallenge, verifyChallenge } from "../domain/challenge";
import { requestSchema, type AnchorQRequest, type ApiResponse } from "../domain/messages";
import {
  completeSession,
  createChallenge,
  createSession,
  grantPermission,
  hasPermission,
  requestDecision,
  returnToCore,
} from "../domain/session-machine";
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROVIDER,
  DEFAULT_PAPER_INDEX,
  initialAppState,
  type AppState,
  type DialogueMessage,
  type PendingTarget,
  type PermissionScope,
} from "../domain/types";
import { safeSiteKey, isSupportedCoreUrl } from "../domain/url";
import { classifyDiagnosticFailure, createDiagnosticReport } from "../domain/diagnostics";
import {
  clearSessionState,
  loadSessionState,
  loadSettings,
  loadProviderSummary,
  saveProviderConfig,
  clearProviderConfig,
  savePaperPages,
  loadPaperPages,
  clearPaperPages,
  saveSessionState,
  saveSettings,
} from "../shared/storage";

let statePromise: Promise<AppState> | null = null;
const SHIELD_SCRIPT_ID = "anchorq-session-shield";

// Keep provider secrets inaccessible to content scripts, including the shield
// injected into ordinary webpages.
void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

async function enableSessionShielding(): Promise<void> {
  const origins = ["http://*/*", "https://*/*"];
  const hasAccess = await chrome.permissions.contains({ origins });
  if (!hasAccess) {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      throw new Error("未获得网页守护权限，无法保证在目标页面显示前进行确认。 ");
    }
  }
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SHIELD_SCRIPT_ID] });
  if (!registered.length) {
    await chrome.scripting.registerContentScripts([{
      id: SHIELD_SCRIPT_ID,
      matches: origins,
      js: ["assets/shield.js"],
      runAt: "document_start",
      allFrames: false,
      persistAcrossSessions: false,
    }]);
  }
}

async function disableSessionShielding(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SHIELD_SCRIPT_ID] });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [SHIELD_SCRIPT_ID] });
}

async function getState(): Promise<AppState> {
  if (!statePromise) {
    statePromise = (async () => {
      const [saved, settings, provider] = await Promise.all([
        loadSessionState(),
        loadSettings(),
        loadProviderSummary(),
      ]);
      const base = saved ?? initialAppState(provider.configured && provider.consentGranted);
      return {
        ...base,
        session: base.session
          ? {
              ...base.session,
              currentPage: base.session.currentPage ?? 1,
              readPages: base.session.readPages ?? [1],
              paperIndex: base.session.paperIndex ?? { ...DEFAULT_PAPER_INDEX },
            }
          : null,
        providerReady: provider.configured && provider.consentGranted,
        provider: { ...DEFAULT_PROVIDER, ...provider },
        settings: { ...DEFAULT_SETTINGS, ...settings },
      };
    })();
  }
  return statePromise;
}

async function commit(next: AppState): Promise<AppState> {
  statePromise = Promise.resolve(next);
  await saveSessionState(next);
  return next;
}

async function update(mutator: (state: AppState) => AppState): Promise<AppState> {
  return commit(mutator(await getState()));
}

async function evidenceForState(state: AppState) {
  const session = state.session;
  if (!session) throw new Error("当前没有学习会话");
  if (session.paperIndex.status === "unsupported") {
    throw new Error("这份 PDF 没有可读取的文本层；首版暂不支持扫描件 OCR。 ");
  }
  const pages = await loadPaperPages(session.id);
  const evidence = selectEvidence({
    pages,
    readPages: session.readPages,
    currentPage: session.currentPage,
    learningGoal: session.learningGoal,
  });
  if (!evidence.length) {
    throw new Error(session.paperIndex.status === "indexing" || session.paperIndex.status === "pending"
      ? "当前已读页面的文字仍在本地建立索引，请稍候再试。 "
      : "没有从已阅读页面取得可用文字，请先阅读包含正文的页面。 ");
  }
  return evidence;
}

function response<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function errorResponse(error: unknown): ApiResponse {
  return { ok: false, error: error instanceof Error ? error.message : "未知错误" };
}

async function recordDiagnosticFailure(error: unknown, operation: string): Promise<void> {
  const diagnostic = classifyDiagnosticFailure(error, operation);
  try {
    await update((state) => ({ ...state, lastDiagnostic: diagnostic }));
  } catch {
    // Diagnostics must never interfere with the original operation or response.
  }
}

function browserSummary(): string {
  const match = navigator.userAgent.match(/Edg\/([\d.]+)/);
  return match ? `Microsoft Edge ${match[1]}` : "Chromium-compatible browser";
}

function platformSummary(): string {
  const userAgent = navigator.userAgent;
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

function fileAccessAllowed(): Promise<boolean> {
  return new Promise((resolve) => chrome.extension.isAllowedFileSchemeAccess(resolve));
}

async function activateTarget(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true, highlighted: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shouldShieldTab(
  state: AppState,
  tabId: number,
  url: string,
): boolean {
  const session = state.session;
  if (!session || session.status === "dialogue" || session.status === "completed") return false;
  if (tabId === session.coreTabId) return false;
  const siteKey = safeSiteKey(url);
  if (!siteKey) return false;
  return !hasPermission(session, {
    tabId,
    url,
    siteKey,
    title: siteKey,
  });
}

function shieldView(state: AppState, tabId: number, url: string) {
  const session = state.session;
  const siteKey = safeSiteKey(url);
  if (!session || !siteKey) return undefined;
  const challenge = session.pendingTarget?.tabId === tabId ? session.challenge : undefined;
  return {
    paperTitle: session.paperTitle,
    siteKey,
    persona: state.settings.persona,
    companionEnabled: state.settings.companionEnabled,
    verificationMode: state.settings.verificationMode,
    durationMinutes: state.settings.recheckIntervalMinutes,
    challenge: challenge
      ? {
          state: challenge.state,
          scope: challenge.permissionScope,
        }
      : undefined,
  };
}

async function setTabShield(
  tabId: number,
  shield: boolean,
  view?: ReturnType<typeof shieldView>,
): Promise<void> {
  const send = () => chrome.tabs.sendMessage(tabId, {
    type: "ANCHORQ_SET_SHIELD",
    shield,
    view,
  });
  try {
    await send();
  } catch {
    if (!shield) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["assets/shield.js"],
      });
      await send();
    } catch {
      // Browser-owned and protected pages cannot be shielded.
    }
  }
}

async function syncTabShields(state: AppState): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!tab.id || !tab.url || !safeSiteKey(tab.url)) return;
    await setTabShield(
      tab.id,
      shouldShieldTab(state, tab.id, tab.url),
      shieldView(state, tab.id, tab.url),
    );
  }));
}

async function grantAndOpen(scope: PermissionScope): Promise<AppState> {
  const current = await getState();
  if (!current.session?.pendingTarget) throw new Error("目标标签页已经失效");
  const targetTabId = current.session.pendingTarget.tabId;
  const next = await update((state) => ({
    ...state,
    session: state.session ? grantPermission(state.session, scope) : null,
  }));
  await setTabShield(targetTabId, false);
  await activateTarget(targetTabId);
  return next;
}

async function handleRequest(message: AnchorQRequest): Promise<ApiResponse> {
  switch (message.type) {
    case "GET_STATE":
      return response(await getState());

    case "PAPER_INDEX_BATCH": {
      const current = await getState();
      if (!current.session || current.session.id !== message.payload.sessionId) {
        throw new Error("论文索引会话已经失效");
      }
      await savePaperPages(message.payload.sessionId, message.payload.pages);
      const storedPages = await loadPaperPages(message.payload.sessionId);
      const textPages = storedPages.filter((page) => page.text.trim()).length;
      const next = await update((state) => ({
        ...state,
        session: state.session
          ? {
              ...state.session,
              paperIndex: {
                status: message.payload.done
                  ? (textPages > 0 ? "ready" : "unsupported")
                  : "indexing",
                indexedPages: storedPages.length,
                textPages,
                totalPages: message.payload.totalPages,
                capped: message.payload.capped,
              },
            }
          : null,
      }));
      return response(next);
    }

    case "READER_PROGRESS": {
      const next = await update((state) => {
        if (!state.session) return state;
        const readPages = [...new Set([...state.session.readPages, message.payload.pageNumber])]
          .sort((a, b) => a - b)
          .slice(-200);
        return {
          ...state,
          session: { ...state.session, currentPage: message.payload.pageNumber, readPages },
        };
      });
      return response(next);
    }

    case "MODEL_CONFIG_SAVE": {
      const provider = await saveProviderConfig(message.payload);
      const next = await update((state) => ({
        ...state,
        provider,
        providerReady: provider.configured && provider.consentGranted,
      }));
      return response(next);
    }

    case "MODEL_CONFIG_TEST": {
      await testProviderConnection();
      const provider = await loadProviderSummary();
      const next = await update((state) => ({
        ...state,
        provider,
        providerReady: true,
        lastError: undefined,
      }));
      return response(next);
    }

    case "MODEL_CONFIG_CLEAR": {
      const provider = await clearProviderConfig();
      const next = await update((state) => ({
        ...state,
        provider,
        providerReady: false,
      }));
      return response(next);
    }

    case "DIAGNOSTICS_GET": {
      const [state, fileAllowed, webAllowed] = await Promise.all([
        getState(),
        fileAccessAllowed(),
        chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] }),
      ]);
      return response(createDiagnosticReport({
        state,
        extensionVersion: chrome.runtime.getManifest().version,
        browser: browserSummary(),
        platform: platformSummary(),
        fileAccessAllowed: fileAllowed,
        webAccessGranted: webAllowed,
      }));
    }

    case "SETTINGS_UPDATE": {
      const next = await update((state) => ({
        ...state,
        settings: { ...state.settings, ...message.payload },
      }));
      await saveSettings(next.settings);
      await syncTabShields(next);
      return response(next);
    }

    case "SESSION_START": {
      await enableSessionShielding();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !isSupportedCoreUrl(tab.url)) {
        await disableSessionShielding();
        throw new Error("请先在 Edge 中打开本地或公开 PDF。 ");
      }
      const sessionId = crypto.randomUUID();
      const readerUrl = chrome.runtime.getURL(
        `reader/index.html?source=${encodeURIComponent(tab.url)}&sessionId=${sessionId}`,
      );
      const session = createSession({
        coreTabId: tab.id,
        coreFileUrl: tab.url,
        readerUrl,
        paperTitle: tab.title || "PDF 论文",
        learningGoal: message.payload.learningGoal.trim(),
      });
      session.id = sessionId;
      const next = await commit({
        ...(await getState()),
        session,
        dialogue: null,
        lastError: undefined,
      });
      await Promise.all([
        chrome.tabs.update(tab.id, { url: readerUrl }),
        syncTabShields(next),
      ]);
      return response(next);
    }

    case "SESSION_RETURN_CORE": {
      const current = await getState();
      if (!current.session) return response(current);
      const coreTabId = current.session.coreTabId;
      const next = await update((state) => ({
        ...state,
        session: state.session ? returnToCore(state.session) : null,
      }));
      await activateTarget(coreTabId);
      void syncTabShields(next).catch(() => undefined);
      return response(next);
    }

    case "SESSION_END_DIRECT": {
      const current = await getState();
      if (current.session) await clearPaperPages(current.session.id);
      const next = completeSession(current);
      statePromise = Promise.resolve(next);
      await clearSessionState();
      await saveSessionState(next);
      await syncTabShields(next);
      await disableSessionShielding();
      return response(next);
    }

    case "SESSION_END_WITH_AI": {
      const current = await getState();
      const evidence = await evidenceForState(current);
      const dialogueState = await update((state) => ({
        ...state,
        session: state.session ? { ...state.session, status: "dialogue" } : null,
        dialogue: {
          question: "",
          source: "generated",
          evidence,
          messages: [],
          busy: true,
        },
      }));
      await syncTabShields(dialogueState);
      await disableSessionShielding();
      try {
        const question = await generateQuestion(current.session!.learningGoal, current.settings.persona, evidence);
        const next = await update((state) => ({
          ...state,
          dialogue: state.dialogue
            ? { ...state.dialogue, question, source: "generated", evidence, busy: false }
            : null,
        }));
        return response(next);
      } catch (error) {
        await update((state) => ({
          ...state,
          dialogue: state.dialogue
            ? { ...state.dialogue, busy: false, error: error instanceof Error ? error.message : "模型出题失败" }
            : null,
        }));
        throw error;
      }
    }

    case "PERMISSION_RETURN": {
      const current = await getState();
      if (!current.session) return response(current);
      const next = await update((state) => ({
        ...state,
        session: state.session ? returnToCore(state.session) : null,
      }));
      await activateTarget(current.session.coreTabId);
      void syncTabShields(next).catch(() => undefined);
      return response(next);
    }

    case "PERMISSION_CHOOSE": {
      const current = await getState();
      if (!current.session) throw new Error("当前没有学习会话");
      if (current.settings.verificationMode === "strict") {
        const next = await update((state) => ({
          ...state,
          session: state.session
            ? createChallenge(state.session, message.payload.scope)
            : null,
        }));
        await syncTabShields(next);
        return response(next);
      }
      return response(await grantAndOpen(message.payload.scope));
    }

    case "CHALLENGE_REVEAL": {
      const current = await getState();
      const challenge = current.session?.challenge;
      if (!challenge) throw new Error("没有等待显示的锚点码");
      const revealed = await revealChallenge(challenge);
      const next = await update((state) => ({
        ...state,
        session: state.session
          ? { ...state.session, challenge: revealed.challenge }
          : null,
      }));
      return response({ state: next, code: revealed.code });
    }

    case "CHALLENGE_VERIFY": {
      const current = await getState();
      const session = current.session;
      const challenge = session?.challenge;
      const target = session?.pendingTarget;
      if (!session || !challenge || !target) throw new Error("锚点挑战已经失效");
      const valid = await verifyChallenge({
        challenge,
        code: message.payload.code,
        sessionId: session.id,
        siteKey: target.siteKey,
        tabId: target.tabId,
        scope: challenge.permissionScope,
      });
      if (!valid) throw new Error("锚点码错误或已失效");
      return response(await grantAndOpen(challenge.permissionScope));
    }

    case "AI_GENERATE_QUESTION": {
      const current = await getState();
      if (!current.session) throw new Error("当前没有学习会话");
      const startedAt = Date.now();
      await update((state) => ({
        ...state,
        dialogue: {
          question: state.dialogue?.question || "",
          source: "generated",
          evidence: state.dialogue?.evidence,
          messages: state.dialogue?.messages || [],
          busy: true,
        },
      }));
      try {
        const evidence = await evidenceForState(current);
        const question = await generateQuestion(current.session.learningGoal, current.settings.persona, evidence);
        await wait(Math.max(0, 1_200 - (Date.now() - startedAt)));
        const next = await update((state) => ({
          ...state,
          session: state.session ? { ...state.session, status: "dialogue" } : null,
          dialogue: { question, source: "generated", evidence, messages: [], busy: false },
        }));
        return response(next);
      } catch (error) {
        await update((state) => ({
          ...state,
          dialogue: state.dialogue
            ? { ...state.dialogue, busy: false, error: error instanceof Error ? error.message : "模型失败" }
            : null,
        }));
        throw error;
      }
    }

    case "AI_SEND": {
      const current = await getState();
      if (!current.dialogue) throw new Error("请先开始理解检查");
      const userMessage: DialogueMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: message.payload.text,
      };
      const previousMessages = current.dialogue.messages;
      const evidence = current.dialogue.evidence?.length
        ? current.dialogue.evidence
        : await evidenceForState(current);
      await update((state) => ({
        ...state,
        dialogue: state.dialogue
          ? { ...state.dialogue, messages: [...state.dialogue.messages, userMessage], busy: true, error: undefined }
          : null,
      }));

      try {
        const diagnosis = previousMessages.some((item) => item.role === "user")
          ? await continueDialogue(current.dialogue.question, previousMessages, message.payload.text, current.settings.persona, evidence)
          : await diagnoseAnswer(message.payload.text, current.settings.persona, current.dialogue.question, evidence);
        const assistantMessage: DialogueMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: diagnosis.replyMarkdown,
          diagnosis,
        };

        const next = await update((state) => ({
          ...state,
          dialogue: state.dialogue
            ? { ...state.dialogue, messages: [...state.dialogue.messages, assistantMessage], busy: false }
            : null,
        }));
        return response(next);
      } catch (error) {
        await update((state) => ({
          ...state,
          dialogue: state.dialogue
            ? { ...state.dialogue, busy: false, error: error instanceof Error ? error.message : "模型调用失败" }
            : null,
        }));
        throw error;
      }
    }

    case "SOURCE_RETURN": {
      const current = await getState();
      if (!current.session) throw new Error("学习会话已结束");
      const coreTabId = current.session.coreTabId;
      const next = await update((state) => ({
        ...state,
        session: state.session
          ? {
              ...state.session,
              readerFocus: {
                pageNumber: message.payload.pageNumber,
                kind: "evidence",
                nonce: crypto.randomUUID(),
              },
            }
          : null,
      }));
      await activateTarget(coreTabId);
      return response(next);
    }

    case "AI_END": {
      const current = await getState();
      if (current.session) await clearPaperPages(current.session.id);
      const next = completeSession(current);
      statePromise = Promise.resolve(next);
      await clearSessionState();
      await saveSessionState(next);
      await syncTabShields(next);
      await disableSessionShielding();
      return response(next);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function handleShieldAction(
  raw: { action: string; code?: string },
  sender: chrome.runtime.MessageSender,
): Promise<ApiResponse> {
  const tab = sender.tab;
  if (!tab?.id || !tab.url) throw new Error("无法确认当前目标标签页");

  if (raw.action === "return") {
    return handleRequest({ type: "PERMISSION_RETURN" });
  }

  const siteKey = safeSiteKey(tab.url);
  if (!siteKey) throw new Error("当前页面不能在学习会话中放行");
  let current = await getState();
  if (!current.session) throw new Error("当前没有学习会话");
  if (current.session.pendingTarget?.tabId !== tab.id) {
    current = await update((state) => ({
      ...state,
      session: state.session
        ? requestDecision(state.session, {
            tabId: tab.id!,
            url: tab.url!,
            siteKey,
            title: tab.title || siteKey,
          })
        : null,
    }));
  }

  if (raw.action === "timed") {
    return handleRequest({
      type: "PERMISSION_CHOOSE",
      payload: {
        scope: {
          type: "timed",
          durationMinutes: current.settings.recheckIntervalMinutes,
        },
      },
    });
  }
  if (raw.action === "session") {
    return handleRequest({
      type: "PERMISSION_CHOOSE",
      payload: { scope: { type: "session" } },
    });
  }
  if (raw.action === "verify" && /^\d{6}$/.test(raw.code || "")) {
    return handleRequest({
      type: "CHALLENGE_VERIFY",
      payload: { code: raw.code! },
    });
  }
  throw new Error("无效的防护层操作");
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "type" in raw &&
    raw.type === "ANCHORQ_SHIELD_STATUS"
  ) {
    void (async () => {
      const tabId = sender.tab?.id;
      const url = sender.tab?.url || sender.url;
      const state = await getState();
      const shield = Boolean(tabId && url && shouldShieldTab(state, tabId, url));
      sendResponse({
        shield,
        view: tabId && url ? shieldView(state, tabId, url) : undefined,
      });
    })();
    return true;
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "type" in raw &&
    raw.type === "ANCHORQ_SHIELD_ACTION" &&
    "action" in raw &&
    typeof raw.action === "string"
  ) {
    void handleShieldAction(
      {
        action: raw.action,
        code: "code" in raw && typeof raw.code === "string" ? raw.code : undefined,
      },
      sender,
    )
      .then(sendResponse)
      .catch(async (error) => {
        await recordDiagnosticFailure(error, `SHIELD_ACTION:${raw.action}`);
        sendResponse(errorResponse(error));
      });
    return true;
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    sendResponse(errorResponse(new Error("无效的扩展消息")));
    return false;
  }
  void handleRequest(parsed.data)
    .then(sendResponse)
    .catch(async (error) => {
      await recordDiagnosticFailure(error, parsed.data.type);
      sendResponse(errorResponse(error));
    });
  return true;
});

async function interceptTargetTab(
  tabId: number,
  knownTab?: chrome.tabs.Tab,
): Promise<void> {
  const current = await getState();
  const session = current.session;
  if (!session || session.status === "dialogue" || session.status === "completed") return;
  if (tabId === session.coreTabId) return;

  const tab = knownTab ?? await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || !tab.active || tab.url.startsWith(chrome.runtime.getURL(""))) return;

  const siteKey = safeSiteKey(tab.url);
  if (!siteKey) return;
  const target: PendingTarget = {
    tabId,
    url: tab.url,
    siteKey,
    title: tab.title || siteKey,
  };
  if (hasPermission(session, target)) return;
  if (
    session.pendingTarget?.tabId === target.tabId &&
    session.pendingTarget.url === target.url
  ) {
    await setTabShield(tabId, true, shieldView(current, tabId, target.url));
    return;
  }

  const next = await update((state) => ({
    ...state,
    session: state.session ? requestDecision(state.session, target) : null,
  }));
  await setTabShield(tabId, true, shieldView(next, tabId, target.url));
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    const current = await getState();
    const session = current.session;
    if (!session || session.status === "dialogue" || session.status === "completed") return;

    if (tabId === session.coreTabId) {
      if (session.status === "active" && session.timedPermissions.length > 0) {
        const next = await update((state) => ({
          ...state,
          session: state.session ? returnToCore(state.session) : null,
        }));
        await syncTabShields(next);
      }
      return;
    }
    await interceptTargetTab(tabId);
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || (!changeInfo.url && changeInfo.status !== "complete")) return;
  void interceptTargetTab(tabId, tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const current = await getState();
    if (!current.session) return;
    if (tabId === current.session.coreTabId) {
      await clearPaperPages(current.session.id);
      const next = await commit(completeSession(current));
      await syncTabShields(next);
      await disableSessionShielding();
      return;
    }
    if (current.session.pendingTarget?.tabId === tabId) {
      await update((state) => ({
        ...state,
        session: state.session ? returnToCore(state.session) : null,
      }));
    }
  })();
});
