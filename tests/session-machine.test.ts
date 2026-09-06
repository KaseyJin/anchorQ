import { describe, expect, it } from "vitest";
import {
  createSession,
  grantPermission,
  hasPermission,
  requestDecision,
  returnToCore,
} from "../src/domain/session-machine";

function session() {
  return createSession({
    coreTabId: 1,
    coreFileUrl: "file:///paper.pdf",
    readerUrl: "chrome-extension://id/reader/index.html",
    paperTitle: "Paper",
    learningGoal: "Understand the paper",
    now: 100,
  });
}

const target = {
  tabId: 2,
  url: "https://www.chatgpt.com/",
  siteKey: "chatgpt.com",
  title: "ChatGPT",
};

describe("许可状态", () => {
  it("定时许可只对绑定站点和标签生效", () => {
    const pending = requestDecision(session(), target);
    const granted = grantPermission(pending, { type: "timed", durationMinutes: 10 }, 1_000);
    expect(hasPermission(granted, target, 1_001)).toBe(true);
    expect(hasPermission(granted, { ...target, tabId: 3 }, 1_001)).toBe(false);
    expect(hasPermission(granted, target, 601_001)).toBe(false);
  });

  it("返回论文撤销定时许可并保留会话许可", () => {
    const timed = grantPermission(requestDecision(session(), target), { type: "timed", durationMinutes: 10 }, 1_000);
    const withSession = grantPermission(
      requestDecision(timed, { ...target, tabId: 3, siteKey: "bilibili.com" }),
      { type: "session" },
      2_000,
    );
    const returned = returnToCore(withSession);
    expect(returned.timedPermissions).toEqual([]);
    expect(returned.sessionPermissions).toHaveLength(1);
    expect(returned.sessionPermissions[0].siteKey).toBe("bilibili.com");
    expect(returned.contextVersion).toBeGreaterThan(withSession.contextVersion);
  });
});
