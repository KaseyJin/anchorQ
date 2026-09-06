import { z } from "zod";

export const diagnosisSchema = z.object({
  answerStatus: z.enum(["correct", "partial", "incorrect"]),
  replyMarkdown: z.string().min(1).max(5000),
  contradictionQuote: z.string().min(1).max(500).optional(),
  contradictionReason: z.string().min(1).max(1500).optional(),
  evidencePage: z.number().int().min(1).max(10000).optional(),
  evidenceSummary: z.string().min(1).max(1500).optional(),
});

export const generatedQuestionSchema = z.object({
  question: z.string().min(1).max(600),
});

export const followupSchema = z.object({
  replyMarkdown: z.string().min(1).max(5000),
  evidencePage: z.number().int().min(1).max(10000).optional(),
});

export type DiagnosisPayload = z.infer<typeof diagnosisSchema>;
