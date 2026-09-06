export type PersonaId = "whip" | "lighthouse" | "prism";
export type VerificationMode = "standard" | "strict";
export type SessionStatus =
  | "active"
  | "decision_pending"
  | "challenge_pending"
  | "dialogue"
  | "completed";

export interface Settings {
  companionEnabled: boolean;
  persona: PersonaId | null;
  verificationMode: VerificationMode;
  recheckIntervalMinutes: number;
}

export interface ProviderSummary {
  baseUrl: string;
  model: string;
  configured: boolean;
  consentGranted: boolean;
}

export interface TimedPermission {
  id: string;
  siteKey: string;
  tabId: number;
  expiresAt: number;
  createdAt: number;
}

export interface SessionPermission {
  id: string;
  siteKey: string;
  createdAt: number;
}

export type PermissionScope =
  | { type: "timed"; durationMinutes: number }
  | { type: "session" };

export interface PendingTarget {
  tabId: number;
  url: string;
  siteKey: string;
  title: string;
}

export interface AnchorChallenge {
  id: string;
  sessionId: string;
  siteKey: string;
  tabId: number;
  permissionScope: PermissionScope;
  codeHash?: string;
  state: "awaiting_reveal" | "revealed" | "verified" | "cancelled";
  createdAt: number;
  revealedAt?: number;
}

export interface LearningSession {
  id: string;
  status: SessionStatus;
  startedAt: number;
  learningGoal: string;
  paperTitle: string;
  coreTabId: number;
  coreFileUrl: string;
  readerUrl: string;
  contextVersion: number;
  currentPage: number;
  readPages: number[];
  paperIndex: {
    status: "pending" | "indexing" | "ready" | "unsupported" | "error";
    indexedPages: number;
    textPages: number;
    totalPages: number;
    capped: boolean;
  };
  pendingTarget?: PendingTarget;
  timedPermissions: TimedPermission[];
  sessionPermissions: SessionPermission[];
  challenge?: AnchorChallenge;
  readerFocus?: {
    pageNumber: number;
    kind: "evidence" | "table-one";
    nonce: string;
  };
}

export interface PaperEvidence {
  pageNumber: number;
  text: string;
}

export interface DiagnosisResult {
  answerStatus: "correct" | "partial" | "incorrect";
  replyMarkdown: string;
  contradictionQuote?: string;
  contradictionReason?: string;
  evidencePage?: number;
  evidenceSummary?: string;
}

export interface DialogueMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  diagnosis?: DiagnosisResult;
}

export interface DialogueState {
  question: string;
  source: "generated";
  evidence?: PaperEvidence[];
  messages: DialogueMessage[];
  busy: boolean;
  error?: string;
}

export interface AppState {
  settings: Settings;
  session: LearningSession | null;
  dialogue: DialogueState | null;
  providerReady: boolean;
  provider: ProviderSummary;
  lastError?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  companionEnabled: false,
  persona: "lighthouse",
  verificationMode: "standard",
  recheckIntervalMinutes: 10,
};

export const DEFAULT_PROVIDER: ProviderSummary = {
  baseUrl: "https://api.atlascloud.ai/v1",
  model: "openai/gpt-5.6-terra",
  configured: false,
  consentGranted: false,
};

export const DEFAULT_PAPER_INDEX: LearningSession["paperIndex"] = {
  status: "pending",
  indexedPages: 0,
  textPages: 0,
  totalPages: 0,
  capped: false,
};

export function initialAppState(providerReady = false): AppState {
  return {
    settings: DEFAULT_SETTINGS,
    session: null,
    dialogue: null,
    providerReady,
    provider: { ...DEFAULT_PROVIDER, configured: providerReady, consentGranted: providerReady },
  };
}
