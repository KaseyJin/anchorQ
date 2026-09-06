/**
 * 鞭身绳索模拟。参数与解算顺序移植自 VibeWhip/badclaude 的 overlay.html
 * （Verlet 质点 + 距离约束 + 逐关节弯曲上限），按本画布尺寸等比缩小：
 * 原实现面向整屏画布、段长 25px，这里画布只有 345×195，段长取 10.5px。
 *
 * 与参考实现的差异：这里没有鼠标，鞭柄由脚本轨迹驱动；炸响之后用一个软约束
 * 把鞭身收束到停留姿态，好让伴学角色停在指向气泡的位置，而不是垂到画布外。
 */

export const STAGE_W = 345;
export const STAGE_H = 195;
/** 鞭柄根部在画布坐标系中的位置，与 .whip-handle 的 DOM 位置对齐。 */
export const ORIGIN = { x: 58, y: 140 };

export const P = {
  segments: 26,
  segmentLength: 10.5,
  taper: 0.6,
  gravity: 0.26,
  damping: 0.96,
  constraintIters: 16,
  maxStretchRatio: 1.2,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  handleMaxBendDeg: 16,
  tipMaxBendDeg: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,
  /** 鞭梢速度超过这个值就算炸响（自参考实现的 340 等比缩小）。 */
  crackSpeed: 13,
  crackGraceFrames: 5,
  crackMinExtension: 0.72,
  /** 从这一帧起开始把鞭身往停留姿态收，避免鞭卷松开时甩到画布外。 */
  settleFrom: 9,
  settleRate: 0.05,
  settleMax: 0.5,
};

/** 甩动轨迹：先后撤蓄力，再以 ease-out 甩出。 */
export const FLICK_FRAMES = 13;
const WIND_BACK = { x: -16, y: 7 };
const FLICK_TO = { x: 30, y: -12 };

export type WhipPhase = "coiled" | "snap" | "extended" | "pointing";

export type Point = { x: number; y: number };
export type RopeNode = Point & { px: number; py: number };

export interface Rope {
  nodes: RopeNode[];
  frame: number;
  /** 炸响发生的帧号，未炸响为 -1。 */
  crackFrame: number;
  handleAngle: number;
  handleAngVel: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrapPi = (a: number) => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

export function segLen(i: number): number {
  const t = i / (P.segments - 1);
  return P.segmentLength * (1 - t * (1 - P.taper));
}

/**
 * 每个质点在鞭身上的弧长占比。段长是锥形递减的，所以不能拿 i/(n-1) 当参数——
 * 否则目标姿态的点距和距离约束要求的点距永远对不上，鞭身会一直松垮着直不起来。
 */
export const ARC: number[] = (() => {
  const acc = [0];
  for (let i = 0; i < P.segments - 1; i++) acc.push(acc[i] + segLen(i));
  const total = acc[acc.length - 1];
  return acc.map((v) => v / total);
})();

/** 鞭身完全展开时的总长。 */
export function ropeLength(): number {
  let total = 0;
  for (let i = 0; i < P.segments - 1; i++) total += segLen(i);
  return total;
}

/** 常态：鞭身盘成一卷，鞭梢收在卷心。 */
export function coilPose(s: number, spin: number): Point {
  const lead = 0.15;
  if (s < lead) {
    const k = s / lead;
    return { x: lerp(ORIGIN.x, 73.5, k), y: lerp(ORIGIN.y, 126.8, k) };
  }
  const u = (s - lead) / (1 - lead);
  const angle = Math.PI * 0.86 + u * 2.15 * Math.PI * 2 + spin;
  const radius = 29 - u * 20;
  return { x: 100 + Math.cos(angle) * radius * 1.05, y: 114 + Math.sin(angle) * radius };
}

/** 抽出后的停留姿态。 */
export function lashPose(s: number, reach: number, rise: number): Point {
  return { x: ORIGIN.x + reach * s, y: ORIGIN.y - rise * Math.sin(Math.PI * s * 0.72) };
}

export function poseFor(phase: WhipPhase, time: number): (s: number) => Point {
  if (phase === "coiled") {
    const spin = Math.sin(time * 1.1) * 0.09;
    return (s) => coilPose(s, spin);
  }
  if (phase === "pointing") return (s) => lashPose(s, 209, 44);
  return (s) => lashPose(s, 206, 30);
}

export function createRope(phase: WhipPhase, time = 0): Rope {
  // 甩打从卷起的形态开始，好看到鞭卷被抽开的过程
  const pose = poseFor(phase === "snap" ? "coiled" : phase, time);
  const nodes: RopeNode[] = [];
  for (let i = 0; i < P.segments; i++) {
    const p = pose(ARC[i]);
    nodes.push({ x: p.x, y: p.y, px: p.x, py: p.y });
  }
  return { nodes, frame: 0, crackFrame: -1, handleAngle: -0.35, handleAngVel: 0 };
}

const RECOVER_FRAMES = 18;

function handleAt(frame: number): Point {
  if (frame <= 0) return { x: ORIGIN.x + WIND_BACK.x, y: ORIGIN.y + WIND_BACK.y };
  if (frame <= FLICK_FRAMES) {
    const ease = 1 - Math.pow(1 - frame / FLICK_FRAMES, 3);
    return {
      x: ORIGIN.x + lerp(WIND_BACK.x, FLICK_TO.x, ease),
      y: ORIGIN.y + lerp(WIND_BACK.y, FLICK_TO.y, ease),
    };
  }
  // 甩出之后手腕收回原位，否则整根鞭子会被永久钉在前伸的位置上
  const back = Math.min(1, (frame - FLICK_FRAMES) / RECOVER_FRAMES);
  const ease = 1 - Math.pow(1 - back, 2);
  return {
    x: ORIGIN.x + FLICK_TO.x * (1 - ease),
    y: ORIGIN.y + FLICK_TO.y * (1 - ease),
  };
}

function applyBasePose(nodes: RopeNode[], handleAngle: number): void {
  const dx = Math.cos(handleAngle);
  const dy = Math.sin(handleAngle);
  const guided = Math.min(P.basePoseSegments, nodes.length - 1);
  for (let i = 1; i <= guided; i++) {
    const t = (i - 1) / Math.max(guided - 1, 1);
    const stiff = lerp(P.basePoseStiffStart, P.basePoseStiffEnd, t);
    const prev = nodes[i - 1];
    const p = nodes[i];
    const target = segLen(i - 1);
    p.x = lerp(p.x, prev.x + dx * target, stiff);
    p.y = lerp(p.y, prev.y + dy * target, stiff);
  }
}

function applyBendLimits(nodes: RopeNode[]): void {
  for (let i = 1; i < nodes.length - 1; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const c = nodes[i + 1];
    const l1 = Math.hypot(a.x - b.x, a.y - b.y) || 1e-4;
    const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1e-4;
    const n1x = (a.x - b.x) / l1;
    const n1y = (a.y - b.y) / l1;
    const n2x = (c.x - b.x) / l2;
    const n2y = (c.y - b.y) / l2;
    const angle = Math.acos(clamp(n1x * n2x + n1y * n2y, -1, 1));
    const t = i / (nodes.length - 2);
    const maxBend = (lerp(P.handleMaxBendDeg, P.tipMaxBendDeg, t) * Math.PI) / 180;
    if (Math.PI - angle <= maxBend) continue;
    const sign = n1x * n2y - n1y * n2x >= 0 ? 1 : -1;
    const targetA = Math.atan2(n1y, n1x) + sign * (Math.PI - maxBend);
    const rigidity = lerp(P.bendRigidityStart, P.bendRigidityEnd, t);
    c.x = lerp(c.x, b.x + Math.cos(targetA) * l2, rigidity);
    c.y = lerp(c.y, b.y + Math.sin(targetA) * l2, rigidity);
  }
}

function capStretch(nodes: RopeNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1e-4;
    const maxLen = segLen(i) * P.maxStretchRatio;
    if (dist <= maxLen) continue;
    const k = maxLen / dist;
    b.x = a.x + (b.x - a.x) * k;
    b.y = a.y + (b.y - a.y) * k;
  }
}

/** 推进一帧。返回本帧是否发生炸响。 */
export function stepRope(rope: Rope, phase: WhipPhase, time: number): boolean {
  rope.frame += 1;
  const { nodes } = rope;

  if (phase === "coiled") {
    const pose = poseFor(phase, time);
    for (let i = 0; i < nodes.length; i++) {
      const p = pose(ARC[i]);
      nodes[i].px = nodes[i].x;
      nodes[i].py = nodes[i].y;
      nodes[i].x = p.x;
      nodes[i].y = p.y;
    }
    return false;
  }

  const snapping = phase === "snap";
  const settle = snapping
    ? Math.min(P.settleMax, Math.max(0, rope.frame - P.settleFrom) * P.settleRate)
    : P.settleMax;
  const gravity = P.gravity * Math.max(0, 1 - settle * 2);
  const pose = poseFor(snapping ? "extended" : phase, time);

  for (let i = 1; i < nodes.length; i++) {
    const p = nodes[i];
    const vx = (p.x - p.px) * P.damping;
    const vy = (p.y - p.py) * P.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + gravity;
  }

  const head = snapping ? handleAt(rope.frame) : ORIGIN;
  nodes[0].px = nodes[0].x;
  nodes[0].py = nodes[0].y;
  nodes[0].x = head.x;
  nodes[0].y = head.y;

  const targetAngle = snapping && rope.frame < FLICK_FRAMES ? 0.15 : -0.35;
  rope.handleAngVel += wrapPi(targetAngle - rope.handleAngle) * P.handleSpring;
  rope.handleAngVel *= P.handleAngularDamping;
  rope.handleAngle = wrapPi(rope.handleAngle + rope.handleAngVel);

  capStretch(nodes);
  applyBasePose(nodes, rope.handleAngle);
  for (let iter = 0; iter < P.constraintIters; iter++) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-4;
      const diff = ((dist - segLen(i)) / dist) * 0.5;
      const ox = dx * diff;
      const oy = dy * diff;
      if (i === 0) { b.x -= ox * 2; b.y -= oy * 2; }
      else { a.x += ox; a.y += oy; b.x -= ox; b.y -= oy; }
    }
    applyBendLimits(nodes);
    applyBasePose(nodes, rope.handleAngle);
    capStretch(nodes);
  }

  if (settle > 0) {
    // 软约束：位置和上一帧位置一起平移，避免给 Verlet 注入假速度
    for (let i = 1; i < nodes.length; i++) {
      const s = ARC[i];
      const p = pose(s);
      const sway = Math.sin(time * 1.5 + s * 1.2) * 2.6 * s * s;
      const k = settle * s;
      const dx = (p.x - nodes[i].x) * k;
      const dy = (p.y + sway - nodes[i].y) * k;
      nodes[i].x += dx;
      nodes[i].y += dy;
      nodes[i].px += dx;
      nodes[i].py += dy;
    }
  }

  if (!snapping || rope.crackFrame >= 0) return false;

  const tip = nodes[nodes.length - 1];
  const tipSpeed = Math.hypot(tip.x - tip.px, tip.y - tip.py);
  // 只有鞭身基本抽直了才算炸响，否则鞭卷刚松开的那几帧就会误判
  const extended = Math.hypot(tip.x - nodes[0].x, tip.y - nodes[0].y) > ropeLength() * P.crackMinExtension;
  if (rope.frame > P.crackGraceFrames && tipSpeed > P.crackSpeed && extended) {
    rope.crackFrame = rope.frame;
    return true;
  }
  if (rope.frame === FLICK_FRAMES + 1) {
    // 与参考实现的 onAutoWhip 一致：脚本甩动不保证甩得够快，
    // 到这一帧直接给鞭梢注入速度，保证每次都炸响。
    tip.px = tip.x - 34;
    tip.py = tip.y + 7;
    rope.crackFrame = rope.frame;
    return true;
  }
  return false;
}
