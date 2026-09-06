import { useEffect, useState } from "react";
import type { AppState, PermissionScope } from "../domain/types";
import { PersonaFigure, personaCopy } from "../companion/Persona";
import {
  WhipCompanion,
  WIND_UP_MS,
  SNAP_FALLBACK_MS,
  type WhipCompanionState,
} from "../companion/WhipCompanion";
import type { AnchorQRequest } from "../domain/messages";

export function CompanionOverlay({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (message: AnchorQRequest) => Promise<AppState>;
}) {
  const session = state.session;
  const target = session?.pendingTarget;
  const challenge = session?.challenge;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [companionState, setCompanionState] = useState<WhipCompanionState>("hidden");
  const [cracked, setCracked] = useState(false);
  const [cracking, setCracking] = useState(false);

  useEffect(() => {
    setCode("");
    setError(undefined);
  }, [challenge?.id, target?.tabId]);

  useEffect(() => {
    if (!session || !state.settings.companionEnabled || !state.settings.persona) {
      setCompanionState("hidden");
      return;
    }
    if (!target) {
      setCompanionState("idle");
      return;
    }
    if (state.settings.persona !== "whip") {
      setCompanionState("bubble_open");
      return;
    }
    if (challenge) {
      setCompanionState("point_to_sidebar");
      return;
    }

    // 鞭子先蓄力再甩出；气泡等鞭梢真的炸响了才落位，兜底计时器防止物理没触发。
    setCracked(false);
    setCompanionState("prepare");
    const snapTimer = window.setTimeout(() => setCompanionState("snap"), WIND_UP_MS);
    const fallbackTimer = window.setTimeout(() => setCracked(true), WIND_UP_MS + SNAP_FALLBACK_MS);
    return () => {
      clearTimeout(snapTimer);
      clearTimeout(fallbackTimer);
    };
  }, [challenge?.id, session?.id, state.settings.companionEnabled, state.settings.persona, target?.tabId]);

  if (!session) return null;
  const hasDecision = Boolean(
    target && ["decision_pending", "challenge_pending"].includes(session.status),
  );
  if ((!state.settings.companionEnabled || !state.settings.persona) && !hasDecision) return null;

  const strict = state.settings.verificationMode === "strict";
  const copy = personaCopy(state.settings.persona, strict);
  const scopeLabel = challenge?.permissionScope.type === "session"
    ? "本次会话内不再询问"
    : challenge?.permissionScope.type === "timed"
      ? `继续使用 ${challenge.permissionScope.durationMinutes} 分钟`
      : "";

  const choose = async (scope: PermissionScope) => {
    setBusy(true);
    setError(undefined);
    try { await dispatch({ type: "PERMISSION_CHOOSE", payload: { scope } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  };

  const bubbleBody = target ? (
    <>
      <span className="bubble-kicker">{copy.kicker}</span>
      <h2>{challenge ? "输入 Side Panel 中的六位锚点码" : copy.title}</h2>
      <div className="context-facts">
        <span>你正在学习</span><strong>{state.session?.paperTitle || "PDF 论文"}</strong>
        <span>准备访问</span><strong>{target.siteKey}</strong>
        {challenge && <><span>申请范围</span><strong>{scopeLabel}</strong></>}
      </div>

      {challenge ? (
        <form
          className="verify-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const normalized = code.replace(/\s/g, "");
            if (!/^\d{6}$/.test(normalized)) {
              setError("请输入六位数字锚点码");
              return;
            }
            setBusy(true);
            setError(undefined);
            try { await dispatch({ type: "CHALLENGE_VERIFY", payload: { code: normalized } }); }
            catch (reason) { setError(reason instanceof Error ? reason.message : "验证失败"); }
            finally { setBusy(false); }
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000 000"
            aria-label="六位锚点码"
          />
          <button disabled={busy || code.length !== 6}>{busy ? "验证中…" : "验证并继续"}</button>
        </form>
      ) : (
        <div className="decision-actions">
          <button className="return-action" disabled={busy} onClick={() => void dispatch({ type: "PERMISSION_RETURN" })}>返回论文</button>
          <button disabled={busy} onClick={() => void choose({ type: "timed", durationMinutes: state.settings.recheckIntervalMinutes })}>
            {strict ? "验证后" : ""}继续使用 {state.settings.recheckIntervalMinutes} 分钟
          </button>
          <button className="session-action" disabled={busy} onClick={() => void choose({ type: "session" })}>
            {strict ? "验证后" : ""}本次会话内不再询问
          </button>
        </div>
      )}
      {error && <p className="bubble-error">{error}</p>}
    </>
  ) : null;

  const bubbleVisible = hasDecision && (
    state.settings.persona !== "whip" ||
    cracked ||
    ["recheck", "point_to_sidebar", "feedback_mark"].includes(companionState)
  );

  const anchoredBubble = bubbleVisible ? (
    <div className="companion-bubble decision-bubble anchored">{bubbleBody}</div>
  ) : undefined;

  if (!state.settings.companionEnabled || !state.settings.persona) {
    return (
      <div className={`decision-layer persona-${state.settings.persona || "neutral"} without-companion`}>
        <div className="page-dim" />
        <div className="decision-bubble modal">{bubbleBody}</div>
      </div>
    );
  }

  return (
    <div
      className={`decision-layer persona-${state.settings.persona} with-companion ${
        hasDecision ? "has-decision" : "is-idle"
      } ${cracking ? "is-cracking" : ""}`}
    >
      {hasDecision && <div className="page-dim" />}
      {state.settings.persona === "whip" ? (
        <WhipCompanion
          state={companionState}
          bubble={anchoredBubble}
          onCrack={() => {
            setCracked(true);
            setCracking(true);
            window.setTimeout(() => setCracking(false), 300);
          }}
        />
      ) : (
        <div className={`anchorq-companion static-companion ${hasDecision ? "bubble-open" : "idle"}`}>
          <PersonaFigure persona={state.settings.persona} />
          {anchoredBubble}
        </div>
      )}
    </div>
  );
}
