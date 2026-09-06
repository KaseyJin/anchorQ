import type { AppState, DiagnosticErrorCategory, DiagnosticEvent, DiagnosticReport } from "./types";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function classifyDiagnosticFailure(error: unknown, operation: string, now = new Date()): DiagnosticEvent {
  const message = messageFrom(error);
  const statusMatch = message.match(/(?:HTTP\s*)?(\d{3})/i);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
  let category: DiagnosticErrorCategory = "unknown";

  if (httpStatus === 401 || /认证失败|API Key|Key 尚未配置/i.test(message)) category = "model_auth";
  else if (httpStatus === 429 || /频率|限流|rate.?limit/i.test(message)) category = "model_rate_limit";
  else if (/30 秒|超时|timeout|AbortError/i.test(message)) category = "model_timeout";
  else if (/无法连接模型|network|fetch/i.test(message)) category = "model_network";
  else if (httpStatus) category = "model_http";
  else if (/权限|授权|permission/i.test(message)) category = "permission_denied";
  else if (/PDF|文本层|论文|索引/i.test(message)) category = "pdf_unavailable";
  else if (/目标标签页|返回|页面|导航/i.test(message)) category = "navigation";
  else if (/无效的扩展消息|invalid message/i.test(message)) category = "invalid_message";

  return {
    occurredAt: now.toISOString(),
    operation: operation.replace(/[^A-Z0-9_:.-]/gi, "_").slice(0, 80) || "unknown",
    category,
    ...(httpStatus ? { httpStatus } : {}),
  };
}

export function createDiagnosticReport(input: {
  state: AppState;
  extensionVersion: string;
  browser: string;
  platform: string;
  fileAccessAllowed: boolean;
  webAccessGranted: boolean;
  now?: Date;
}): DiagnosticReport {
  const { state } = input;
  return {
    schemaVersion: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    extensionVersion: input.extensionVersion,
    browser: input.browser,
    platform: input.platform,
    provider: {
      configured: state.provider.configured,
      consentGranted: state.provider.consentGranted,
    },
    featureState: {
      sessionStatus: state.session?.status ?? "none",
      paperIndexStatus: state.session?.paperIndex.status ?? "none",
      companionEnabled: state.settings.companionEnabled,
      persona: state.settings.persona ?? "none",
      verificationMode: state.settings.verificationMode,
    },
    permissions: {
      fileAccessAllowed: input.fileAccessAllowed,
      webAccessGranted: input.webAccessGranted,
    },
    ...(state.lastDiagnostic ? { lastError: { ...state.lastDiagnostic } } : {}),
  };
}
