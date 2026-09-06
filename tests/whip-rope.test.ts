import { describe, expect, it } from "vitest";
import {
  ORIGIN,
  P,
  STAGE_H,
  STAGE_W,
  createRope,
  lashPose,
  ropeLength,
  stepRope,
  type Rope,
} from "../src/companion/whip-rope";

function run(rope: Rope, phase: Parameters<typeof stepRope>[1], frames: number) {
  let crackedAt = -1;
  for (let i = 0; i < frames; i++) {
    if (stepRope(rope, phase, i / 60) && crackedAt < 0) crackedAt = rope.frame;
  }
  return crackedAt;
}

const tipOf = (rope: Rope) => rope.nodes[rope.nodes.length - 1];
const span = (rope: Rope) => Math.hypot(tipOf(rope).x - rope.nodes[0].x, tipOf(rope).y - rope.nodes[0].y);

describe("鞭身绳索", () => {
  it("卷起时鞭梢收在卷心，展开长度远小于绳长", () => {
    const rope = createRope("coiled");
    run(rope, "coiled", 30);
    expect(span(rope)).toBeLessThan(ropeLength() * 0.35);
  });

  it("一次甩打必定炸响，且炸响发生在甩出阶段", () => {
    const rope = createRope("snap");
    const crackedAt = run(rope, "snap", 30);
    expect(crackedAt).toBeGreaterThan(P.crackGraceFrames);
    expect(crackedAt).toBeLessThanOrEqual(14);
    // 炸响时鞭身必须已经基本抽直
    expect(span(rope)).toBeGreaterThan(ropeLength() * 0.7);
  });

  it("炸响之后鞭身抽直，停在指向气泡的位置", () => {
    const rope = createRope("snap");
    run(rope, "snap", 150);
    const target = lashPose(1, 206, 30);
    expect(span(rope)).toBeGreaterThan(ropeLength() * 0.9);
    expect(Math.abs(tipOf(rope).x - target.x)).toBeLessThan(12);
    expect(Math.abs(tipOf(rope).y - target.y)).toBeLessThan(12);
  });

  it("整根鞭身始终留在画布内", () => {
    const rope = createRope("snap");
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 150; i++) {
      stepRope(rope, "snap", i / 60);
      for (const node of rope.nodes) {
        minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
      }
    }
    // 鞭梢炸响时还要留出光晕的余量
    expect(minX).toBeGreaterThan(0);
    expect(maxX).toBeLessThan(STAGE_W - 30);
    expect(minY).toBeGreaterThan(0);
    expect(maxY).toBeLessThan(STAGE_H);
  });

  it("鞭柄端点被钉在原点，不会被绳身拖走", () => {
    const rope = createRope("extended");
    run(rope, "extended", 90);
    expect(rope.nodes[0].x).toBeCloseTo(ORIGIN.x, 5);
    expect(rope.nodes[0].y).toBeCloseTo(ORIGIN.y, 5);
  });
});
