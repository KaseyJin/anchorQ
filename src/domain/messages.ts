import { z } from "zod";

const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("timed"), durationMinutes: z.number().int().min(5).max(60) }),
  z.object({ type: z.literal("session") }),
]);

export const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_STATE") }),
  z.object({
    type: z.literal("PAPER_INDEX_BATCH"),
    payload: z.object({
      sessionId: z.string().min(1),
      totalPages: z.number().int().min(1),
      capped: z.boolean(),
      done: z.boolean(),
      pages: z.array(z.object({
        pageNumber: z.number().int().min(1),
        text: z.string().max(12000),
      })).max(10),
    }),
  }),
  z.object({
    type: z.literal("READER_PROGRESS"),
    payload: z.object({ pageNumber: z.number().int().min(1) }),
  }),
  z.object({
    type: z.literal("MODEL_CONFIG_SAVE"),
    payload: z.object({
      baseUrl: z.string().trim().url().refine((value) => value.startsWith("https://"), "接口必须使用 HTTPS"),
      model: z.string().trim().min(1).max(200),
      apiKey: z.string().max(1000).optional(),
      consentGranted: z.literal(true),
    }),
  }),
  z.object({ type: z.literal("MODEL_CONFIG_TEST") }),
  z.object({ type: z.literal("MODEL_CONFIG_CLEAR") }),
  z.object({ type: z.literal("DIAGNOSTICS_GET") }),
  z.object({
    type: z.literal("SETTINGS_UPDATE"),
    payload: z.object({
      companionEnabled: z.boolean().optional(),
      persona: z.enum(["whip", "lighthouse", "prism"]).nullable().optional(),
      verificationMode: z.enum(["standard", "strict"]).optional(),
      recheckIntervalMinutes: z.number().int().min(5).max(60).optional(),
    }),
  }),
  z.object({
    type: z.literal("SESSION_START"),
    payload: z.object({ learningGoal: z.string().trim().max(300) }),
  }),
  z.object({ type: z.literal("SESSION_RETURN_CORE") }),
  z.object({ type: z.literal("SESSION_END_DIRECT") }),
  z.object({ type: z.literal("SESSION_END_WITH_AI") }),
  z.object({ type: z.literal("PERMISSION_CHOOSE"), payload: z.object({ scope: scopeSchema }) }),
  z.object({ type: z.literal("PERMISSION_RETURN") }),
  z.object({ type: z.literal("CHALLENGE_REVEAL") }),
  z.object({
    type: z.literal("CHALLENGE_VERIFY"),
    payload: z.object({ code: z.string().regex(/^\d{6}$/) }),
  }),
  z.object({ type: z.literal("AI_GENERATE_QUESTION") }),
  z.object({
    type: z.literal("AI_SEND"),
    payload: z.object({ text: z.string().trim().min(1).max(4000) }),
  }),
  z.object({ type: z.literal("AI_END") }),
  z.object({ type: z.literal("SOURCE_RETURN"), payload: z.object({ pageNumber: z.number().int().min(1) }) }),
]);

export type AnchorQRequest = z.infer<typeof requestSchema>;

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
