import { describe, expect, it } from "vitest";
import { completeSession, createSession } from "../src/domain/session-machine";
import { initialAppState } from "../src/domain/types";

describe("会话清理", () => {
  it("结束后删除会话与对话但保留设置", () => {
    const state = initialAppState(true);
    state.settings.persona = "whip";
    state.session = createSession({
      coreTabId: 1,
      coreFileUrl: "file:///paper.pdf",
      readerUrl: "chrome-extension://id/reader/index.html",
      paperTitle: "Paper",
      learningGoal: "Goal",
    });
    state.dialogue = {
      question: "Question",
      source: "generated",
      messages: [{ id: "1", role: "user", text: "Answer" }],
      busy: false,
    };

    const result = completeSession(state);
    expect(result.session).toBeNull();
    expect(result.dialogue).toBeNull();
    expect(result.settings.persona).toBe("whip");
    expect(result.providerReady).toBe(true);
  });
});
