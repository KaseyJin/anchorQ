import type {
  AnchorChallenge,
  AppState,
  LearningSession,
  PendingTarget,
  PermissionScope,
} from "./types";
import { DEFAULT_PAPER_INDEX } from "./types";

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function createSession(input: {
  coreTabId: number;
  coreFileUrl: string;
  readerUrl: string;
  paperTitle: string;
  learningGoal: string;
  now?: number;
}): LearningSession {
  return {
    id: makeId("session"),
    status: "active",
    startedAt: input.now ?? Date.now(),
    learningGoal: input.learningGoal,
    paperTitle: input.paperTitle,
    coreTabId: input.coreTabId,
    coreFileUrl: input.coreFileUrl,
    readerUrl: input.readerUrl,
    contextVersion: 0,
    currentPage: 1,
    readPages: [1],
    paperIndex: { ...DEFAULT_PAPER_INDEX },
    timedPermissions: [],
    sessionPermissions: [],
  };
}

export function requestDecision(
  session: LearningSession,
  target: PendingTarget,
): LearningSession {
  return {
    ...session,
    status: "decision_pending",
    contextVersion: session.contextVersion + 1,
    pendingTarget: target,
    challenge: undefined,
  };
}

export function hasPermission(
  session: LearningSession,
  target: PendingTarget,
  now = Date.now(),
): boolean {
  if (session.sessionPermissions.some((item) => item.siteKey === target.siteKey)) {
    return true;
  }
  return session.timedPermissions.some(
    (item) =>
      item.siteKey === target.siteKey &&
      item.tabId === target.tabId &&
      item.expiresAt > now,
  );
}

export function grantPermission(
  session: LearningSession,
  scope: PermissionScope,
  now = Date.now(),
): LearningSession {
  const target = session.pendingTarget;
  if (!target) throw new Error("没有待授权的目标标签页");

  const base = {
    ...session,
    status: "active" as const,
    pendingTarget: undefined,
    challenge: undefined,
  };

  if (scope.type === "session") {
    return {
      ...base,
      sessionPermissions: [
        ...session.sessionPermissions.filter((item) => item.siteKey !== target.siteKey),
        { id: makeId("session_permission"), siteKey: target.siteKey, createdAt: now },
      ],
    };
  }

  return {
    ...base,
    timedPermissions: [
      ...session.timedPermissions.filter(
        (item) => !(item.siteKey === target.siteKey && item.tabId === target.tabId),
      ),
      {
        id: makeId("timed_permission"),
        siteKey: target.siteKey,
        tabId: target.tabId,
        createdAt: now,
        expiresAt: now + scope.durationMinutes * 60_000,
      },
    ],
  };
}

export function returnToCore(session: LearningSession): LearningSession {
  return {
    ...session,
    status: "active",
    contextVersion: session.contextVersion + 1,
    pendingTarget: undefined,
    challenge: session.challenge
      ? { ...session.challenge, state: "cancelled" }
      : undefined,
    timedPermissions: [],
  };
}

export function createChallenge(
  session: LearningSession,
  scope: PermissionScope,
  now = Date.now(),
): LearningSession {
  const target = session.pendingTarget;
  if (!target) throw new Error("没有待验证的目标标签页");

  const challenge: AnchorChallenge = {
    id: makeId("challenge"),
    sessionId: session.id,
    siteKey: target.siteKey,
    tabId: target.tabId,
    permissionScope: scope,
    state: "awaiting_reveal",
    createdAt: now,
  };

  return { ...session, status: "challenge_pending", challenge };
}

export function completeSession(state: AppState): AppState {
  return {
    ...state,
    session: null,
    dialogue: null,
    lastError: undefined,
  };
}
