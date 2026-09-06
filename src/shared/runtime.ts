import type { AnchorQRequest, ApiResponse } from "../domain/messages";
import type { AppState } from "../domain/types";

export async function send<T = AppState>(message: AnchorQRequest): Promise<T> {
  const result = (await chrome.runtime.sendMessage(message)) as ApiResponse<T>;
  if (!result?.ok) throw new Error(result?.error || "扩展后台没有响应");
  return result.data as T;
}

export const APP_STATE_STORAGE_KEY = "anchorq.appState";
