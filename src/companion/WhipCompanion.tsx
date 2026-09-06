import { useEffect, useRef, type ReactNode } from "react";
import { applyHandleTransform, drawWhip, prepareCanvas } from "./whip-draw";
import { createRope, stepRope, type WhipPhase } from "./whip-rope";

export type WhipCompanionState =
  | "hidden"
  | "idle"
  | "prepare"
  | "snap"
  | "bubble_open"
  | "recheck"
  | "point_to_sidebar"
  | "feedback_mark"
  | "dismiss";

/** 甩出前的蓄力时长；供 CompanionOverlay 编排。 */
export const WIND_UP_MS = 200;
/** 兜底：物理若因故没跑起来，也要把气泡放出来。 */
export const SNAP_FALLBACK_MS = 700;

function phaseOf(state: WhipCompanionState): WhipPhase {
  if (state === "idle" || state === "prepare" || state === "dismiss") return "coiled";
  if (state === "snap") return "snap";
  if (state === "point_to_sidebar") return "pointing";
  return "extended";
}

function WhipCanvas({
  state,
  onCrack,
  handleRef,
}: {
  state: WhipCompanionState;
  onCrack: () => void;
  handleRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const crackRef = useRef(onCrack);
  crackRef.current = onCrack;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || state === "hidden") return;
    const context = prepareCanvas(canvas);
    if (!context) return;

    const phase = phaseOf(state);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // 不播放动画：直接落在该状态的停留姿态上
      const rope = createRope(phase === "snap" ? "extended" : phase);
      drawWhip(context, rope);
      applyHandleTransform(handleRef.current, rope);
      if (phase === "snap") crackRef.current();
      return;
    }

    const rope = createRope(phase);
    let raf = 0;
    const paint = (now: number) => {
      if (stepRope(rope, phase, now / 1000)) crackRef.current();
      drawWhip(context, rope);
      applyHandleTransform(handleRef.current, rope);
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [handleRef, state]);

  return <canvas ref={canvasRef} className="whip-canvas" aria-hidden="true" />;
}

export function WhipCompanion({
  state,
  bubble,
  onCrack,
}: {
  state: WhipCompanionState;
  bubble?: ReactNode;
  onCrack?: () => void;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const crackRef = useRef(onCrack);
  crackRef.current = onCrack;

  if (state === "hidden") return null;
  return (
    <div className={`anchorq-companion whip-state-${state}`} aria-label="鞭子伴学角色">
      <WhipCanvas state={state} handleRef={handleRef} onCrack={() => crackRef.current?.()} />
      <div className="whip-handle" ref={handleRef} aria-hidden="true">
        <span className="handle-grip" />
        <span className="handle-seal">AQ</span>
      </div>
      {bubble}
    </div>
  );
}
