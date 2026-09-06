import { describe, expect, it } from "vitest";
import {
  extractJson,
  normalizeDiagnosis,
  normalizeDiagnosisShape,
  systemPromptForPersona,
} from "../src/agent/atlas-client";
import { diagnosisSchema } from "../src/agent/schemas";

describe("模型 JSON 兼容解析", () => {
  it("可从代码块和前后说明中提取完整 JSON", () => {
    expect(extractJson('以下是结果：\n```json\n{"question":"为什么？"}\n```\n谢谢')).toEqual({
      question: "为什么？",
    });
    expect(extractJson('诊断如下： {"replyMarkdown":"含有 { 括号 } 的文本","answerStatus":"partial"} 完毕')).toEqual({
      replyMarkdown: "含有 { 括号 } 的文本",
      answerStatus: "partial",
    });
  });

  it("兼容中文状态、常见反馈字段与中文页码", () => {
    const parsed = diagnosisSchema.parse(normalizeDiagnosisShape({
      status: "部分正确",
      feedback: "核心方向成立，还缺少语境判断。",
      page: "第16页",
    }));
    expect(parsed).toEqual({
      answerStatus: "partial",
      replyMarkdown: "核心方向成立，还缺少语境判断。",
      evidencePage: 16,
    });
  });
});

describe("模型诊断本地防线", () => {
  it("只保留用户回答中逐字存在的冲突引文", () => {
    const answer = "LLM 能理解上下文，但关键词法覆盖更多。";
    expect(
      normalizeDiagnosis(answer, {
        answerStatus: "partial",
        replyMarkdown: "存在冲突。",
        contradictionQuote: "关键词法覆盖更少",
        contradictionReason: "与论文相反。",
        evidencePage: 64,
      }),
    ).toEqual({ answerStatus: "partial", replyMarkdown: "存在冲突。", evidencePage: 64 });

    expect(
      normalizeDiagnosis(answer, {
        answerStatus: "partial",
        replyMarkdown: "存在冲突。",
        contradictionQuote: "关键词法覆盖更多",
        contradictionReason: "需要核对口径。",
      }).contradictionQuote,
    ).toBe("关键词法覆盖更多");
  });

  it("没有冲突引文时不单独保留冲突理由", () => {
    expect(
      normalizeDiagnosis("回答", {
        answerStatus: "partial",
        replyMarkdown: "部分正确。",
        contradictionReason: "模型擅自给出的理由。",
      }),
    ).toEqual({ answerStatus: "partial", replyMarkdown: "部分正确。" });
  });

  it("整体错误时即使模型未给出精确引文也能高亮并返回证据", () => {
    const answer = "关键词法覆盖更多，人工成本也更低。";
    expect(normalizeDiagnosis(answer, {
      answerStatus: "incorrect",
      replyMarkdown: "这个判断与论文相反。",
    }, 16)).toMatchObject({
      answerStatus: "incorrect",
      contradictionQuote: answer,
      evidencePage: 16,
    });
  });
});

describe("伴学角色提示词", () => {
  it("三种角色共享事实边界，但具有不同表达策略", () => {
    const whip = systemPromptForPersona("whip");
    const lighthouse = systemPromptForPersona("lighthouse");
    const prism = systemPromptForPersona("prism");

    for (const prompt of [whip, lighthouse, prism]) {
      expect(prompt).toContain("角色风格只能改变表达方式");
      expect(prompt).toContain("应用提供的有效论文证据");
    }
    expect(whip).toContain("短促、直接");
    expect(lighthouse).toContain("温和、稳定");
    expect(prism).toContain("概念、证据与推论");
    expect(new Set([whip, lighthouse, prism]).size).toBe(3);
  });
});
