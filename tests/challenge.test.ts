import { describe, expect, it } from "vitest";
import { revealChallenge, verifyChallenge } from "../src/domain/challenge";
import { createChallenge, createSession, requestDecision } from "../src/domain/session-machine";

function challenged() {
  const base = createSession({
    coreTabId: 1,
    coreFileUrl: "file:///paper.pdf",
    readerUrl: "chrome-extension://id/reader/index.html",
    paperTitle: "Paper",
    learningGoal: "Goal",
  });
  const pending = requestDecision(base, {
    tabId: 8,
    url: "https://www.bilibili.com/",
    siteKey: "bilibili.com",
    title: "Bilibili",
  });
  return createChallenge(pending, { type: "session" });
}

describe("严格锚点挑战", () => {
  it("只接受完全一致的四项绑定", async () => {
    const session = challenged();
    const revealed = await revealChallenge(session.challenge!);
    const common = {
      challenge: revealed.challenge,
      code: revealed.code,
      sessionId: session.id,
      siteKey: "bilibili.com",
      tabId: 8,
      scope: { type: "session" as const },
    };
    await expect(verifyChallenge(common)).resolves.toBe(true);
    await expect(verifyChallenge({ ...common, tabId: 9 })).resolves.toBe(false);
    await expect(verifyChallenge({ ...common, siteKey: "example.com" })).resolves.toBe(false);
    await expect(verifyChallenge({ ...common, sessionId: "other" })).resolves.toBe(false);
    await expect(
      verifyChallenge({ ...common, scope: { type: "timed", durationMinutes: 10 } }),
    ).resolves.toBe(false);
  });

  it("重新显示会让旧码失效", async () => {
    const session = challenged();
    const first = await revealChallenge(session.challenge!);
    const second = await revealChallenge(first.challenge);
    await expect(
      verifyChallenge({
        challenge: second.challenge,
        code: first.code,
        sessionId: session.id,
        siteKey: "bilibili.com",
        tabId: 8,
        scope: { type: "session" },
      }),
    ).resolves.toBe(false);
  });
});
