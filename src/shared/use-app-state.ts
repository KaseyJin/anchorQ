import { useCallback, useEffect, useState } from "react";
import type { AnchorQRequest } from "../domain/messages";
import type { AppState } from "../domain/types";
import { APP_STATE_STORAGE_KEY, send } from "./runtime";

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setState(await send<AppState>({ type: "GET_STATE" }));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法连接扩展后台");
    }
  }, []);

  const dispatch = useCallback(async (message: AnchorQRequest) => {
    try {
      const next = await send<AppState>(message);
      setState(next);
      setError(undefined);
      return next;
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "操作失败";
      setError(text);
      throw reason;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session" && changes[APP_STATE_STORAGE_KEY]?.newValue) {
        setState(changes[APP_STATE_STORAGE_KEY].newValue as AppState);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  return { state, error, setError, dispatch, refresh };
}
