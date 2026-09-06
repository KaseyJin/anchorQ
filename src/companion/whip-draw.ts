/**
 * 鞭身绘制。和 whip-rope.ts 一样不依赖框架，因为 Reader（React）和
 * 网页遮罩层（Shadow DOM 里的纯 DOM）共用同一份鞭子。
 *
 * 双道笔画的做法取自 VibeWhip/badclaude 的 overlay.html：先整条描边，
 * 再逐段画锥形芯线。区别是阅读器恒为深黑灰，所以这里反过来用亮银芯 + 暗描边。
 */
import { ORIGIN, STAGE_H, STAGE_W, type Rope, type RopeNode } from "./whip-rope";

const DRAW = {
  widthHandle: 5.2,
  widthTip: 2.4,
  outline: 1.3,
  handleExtra: 2.4,
  handleThickSegments: 2,
  crackFrames: 18,
};

function catmull(nodes: RopeNode[], i: number) {
  const n = nodes.length;
  if (i < 0) return { x: 2 * nodes[0].x - nodes[1].x, y: 2 * nodes[0].y - nodes[1].y };
  if (i >= n) {
    const a = nodes[n - 2];
    const b = nodes[n - 1];
    return { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
  }
  return nodes[i];
}

function bezierFor(nodes: RopeNode[], i: number) {
  const p0 = catmull(nodes, i - 1);
  const p1 = nodes[i];
  const p2 = nodes[i + 1];
  const p3 = catmull(nodes, i + 2);
  return {
    cp1x: p1.x + (p2.x - p0.x) / 6,
    cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6,
    cp2y: p2.y - (p3.y - p1.y) / 6,
    x2: p2.x,
    y2: p2.y,
  };
}

function tracePath(context: CanvasRenderingContext2D, nodes: RopeNode[], links: number): void {
  context.beginPath();
  context.moveTo(nodes[0].x, nodes[0].y);
  for (let i = 0; i < links; i++) {
    const b = bezierFor(nodes, i);
    context.bezierCurveTo(b.cp1x, b.cp1y, b.cp2x, b.cp2y, b.x2, b.y2);
  }
}

/** 黑白灰：鞭根亮银，向鞭梢转深灰。 */
function coreColor(t: number): string {
  const v = Math.round(226 - t * 118);
  return "rgb(" + v + "," + v + "," + Math.round(v * 1.03) + ")";
}

function strokeWhip(context: CanvasRenderingContext2D, nodes: RopeNode[]): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  context.strokeStyle = "rgba(6,6,8,.55)";
  tracePath(context, nodes, nodes.length - 1);
  context.lineWidth = DRAW.widthTip + DRAW.outline * 2;
  context.stroke();
  tracePath(context, nodes, DRAW.handleThickSegments);
  context.lineWidth = DRAW.widthHandle + DRAW.handleExtra + DRAW.outline * 2;
  context.stroke();

  for (let i = 0; i < nodes.length - 1; i++) {
    const t = i / Math.max(1, nodes.length - 2);
    const extra = i < DRAW.handleThickSegments ? DRAW.handleExtra : 0;
    context.strokeStyle = coreColor(t);
    context.lineWidth = DRAW.widthHandle + (DRAW.widthTip - DRAW.widthHandle) * t + extra;
    const b = bezierFor(nodes, i);
    context.beginPath();
    context.moveTo(nodes[i].x, nodes[i].y);
    context.bezierCurveTo(b.cp1x, b.cp1y, b.cp2x, b.cp2y, b.x2, b.y2);
    context.stroke();
  }
}

function paintCrack(context: CanvasRenderingContext2D, tip: RopeNode, strength: number): void {
  if (strength <= 0) return;
  context.save();
  context.translate(tip.x, tip.y);
  const radius = 7 + 22 * (1 - strength);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  glow.addColorStop(0, "rgba(255,255,255," + 0.9 * strength + ")");
  glow.addColorStop(0.45, "rgba(226,226,232," + 0.32 * strength + ")");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(252,252,255," + 0.9 * strength + ")";
  context.lineCap = "round";
  context.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const inner = 3 + radius * 0.36;
    const outer = inner + 8 + 11 * strength;
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.stroke();
  }
  context.restore();
}

/** 清屏并画出鞭身与炸响光晕。 */
export function drawWhip(context: CanvasRenderingContext2D, rope: Rope): void {
  context.clearRect(0, 0, STAGE_W, STAGE_H);
  strokeWhip(context, rope.nodes);
  if (rope.crackFrame < 0) return;
  const age = (rope.frame - rope.crackFrame) / DRAW.crackFrames;
  if (age <= 1) paintCrack(context, rope.nodes[rope.nodes.length - 1], 1 - age);
}

/** 按画布像素配置 2D 上下文，返回是否成功。 */
export function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = STAGE_W * ratio;
  canvas.height = STAGE_H * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

/** 鞭柄 DOM 跟着绳索根部走，保证 Canvas 和 DOM 永远对得上。 */
export function applyHandleTransform(el: HTMLElement | null, rope: Rope): void {
  if (!el) return;
  const head = rope.nodes[0];
  const aim = rope.nodes[2];
  const deg = (Math.atan2(aim.y - head.y, aim.x - head.x) * 180) / Math.PI;
  const clamped = deg < -40 ? -40 : deg > 20 ? 20 : deg;
  el.style.transform =
    "translate(" + (head.x - ORIGIN.x) + "px," + (head.y - ORIGIN.y) + "px) rotate(" + clamped + "deg)";
}

export { STAGE_H, STAGE_W };
