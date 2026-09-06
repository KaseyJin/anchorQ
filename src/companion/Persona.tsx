import type { PersonaId } from "../domain/types";

export function WhipFigure() {
  return (
    <div className="whip-figure" aria-label="鞭子伴学角色">
      <svg viewBox="0 0 180 180" role="img">
        <defs>
          <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9c9ca3" />
            <stop offset=".5" stopColor="#4a4a4f" />
            <stop offset="1" stopColor="#131315" />
          </linearGradient>
        </defs>
        <g className="whip-arm">
          <path className="whip-shadow" d="M49 132 C65 87 84 44 132 30 C157 23 164 46 142 57 C109 73 87 91 72 137" />
          <path className="whip-cord" d="M47 128 C62 84 83 46 130 31 C154 23 163 43 143 54 C109 73 88 91 73 135" />
          <path className="whip-tip" d="M143 54 C158 64 159 76 149 87 C141 95 146 104 159 105" />
        </g>
        <g className="whip-handle">
          <path d="M41 116 L75 137" />
          <rect x="30" y="112" width="51" height="24" rx="11" transform="rotate(32 30 112)" />
          <path className="handle-wrap" d="M42 116 l-7 8 m17-2 l-7 9 m17-2 l-7 9" />
        </g>
        <circle className="whip-seal" cx="50" cy="145" r="21" />
        <path className="whip-letter" d="M40 143 Q50 132 60 143 Q50 153 40 143 M50 133 V154" />
      </svg>
    </div>
  );
}

function LighthouseFigure() {
  return (
    <div className="static-figure lighthouse-figure" aria-label="灯塔伴学角色">
      <svg viewBox="0 0 160 160">
        <defs>
          <linearGradient id="aqBeam" x1="68" y1="46" x2="0" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff6d8" stopOpacity=".9" />
            <stop offset=".45" stopColor="#ffe9a8" stopOpacity=".4" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="beam" d="M68 46 L4 6 L0 64 Z" />
        <path className="ray" d="M98 40 L132 22 M100 54 L140 50" />
        <path className="roof" d="M80 16 L97 34 H63 Z" />
        <path className="lantern" d="M67 58 V34 H93 V58 Z" />
        <path className="gallery" d="M59 58 H101 V66 H59 Z" />
        <path className="tower" d="M46 142 L63 66 H97 L114 142 Z" />
        <path className="lines" d="M55 112 H105" />
        <path className="ground" d="M26 142 Q53 132 80 142 Q107 132 134 142" />
      </svg>
    </div>
  );
}

function PrismFigure() {
  return (
    <div className="static-figure prism-figure" aria-label="棱镜伴学角色">
      <svg viewBox="0 0 160 160">
        <defs>
          <linearGradient id="aqGlass" x1="80" y1="20" x2="80" y2="124" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".42" />
            <stop offset="1" stopColor="#9dc2f2" stopOpacity=".2" />
          </linearGradient>
        </defs>
        <path className="prism" d="M80 20 L136 124 H24 Z" />
        <path className="ray in" d="M0 64 L52 70" />
        <path className="ray inner" d="M52 70 L114 86" />
        <path className="ray one" d="M116 82 L158 56" />
        <path className="ray two" d="M118 90 L160 88" />
        <path className="ray three" d="M120 98 L156 122" />
      </svg>
    </div>
  );
}

/** 角色选择卡上的小图标。24 格坐标系，落地约 26px，因此只保留少量粗描边元素。 */
export function PersonaGlyph({ persona }: { persona: PersonaId }) {
  if (persona === "whip") {
    return (
      <svg className="mini-symbol whip" viewBox="0 0 24 24" role="img" aria-label="鞭子">
        <path className="grip" d="M3.6 20.2 L6.2 19.1" />
        <path className="t1" d="M4.4 19.8 C7.4 18.7 8.9 16.8 9.7 14.7" />
        <path className="t2" d="M9.7 14.7 C10.7 12 11.5 9.4 14.1 8.1" />
        <path className="t3" d="M14.1 8.1 C16.8 6.8 19 8.4 19.2 10.4" />
        <path className="t4" d="M19.2 10.4 C19.4 12 20.8 12.7 22.4 12" />
      </svg>
    );
  }
  if (persona === "lighthouse") {
    return (
      <svg className="mini-symbol lighthouse" viewBox="0 0 24 24" role="img" aria-label="灯塔">
        <path className="beam" d="M9.4 8.2 L4.2 5.2 M9.2 10.2 L3.4 9.6 M14.6 8.2 L19.8 5.2 M14.8 10.2 L20.6 9.6" />
        <path className="cap" d="M12 4.8 L14.6 7.4 H9.4 Z" />
        <path className="lantern" d="M10 11 L10.6 7.4 H13.4 L14 11 Z" />
        <path className="tower" d="M8.8 20.6 L10 11 H14 L15.2 20.6 Z" />
        <path className="lines" d="M9.4 16 H14.6 M6 20.6 H18" />
      </svg>
    );
  }
  return (
    <svg className="mini-symbol prism" viewBox="0 0 24 24" role="img" aria-label="棱镜">
      <path className="body" d="M12 4.4 L19.6 17.8 H4.4 Z" />
      <path className="ray in" d="M0.6 11.1 L7.7 12.7" />
      <path className="ray one" d="M16.9 12 L22 8.8" />
      <path className="ray two" d="M17.5 13.4 L22.6 13.1" />
      <path className="ray three" d="M18.1 14.8 L22.2 16.7" />
    </svg>
  );
}

export function PersonaFigure({ persona }: { persona: PersonaId }) {
  if (persona === "whip") return <WhipFigure />;
  if (persona === "lighthouse") return <LighthouseFigure />;
  return <PrismFigure />;
}

export function personaCopy(persona: PersonaId | null, strict: boolean) {
  if (!persona) return {
    kicker: strict ? "严格确认" : "访问确认",
    title: strict ? "请输入锚点码以继续。" : "确认这次切换。",
  };
  if (persona === "whip") return {
    kicker: strict ? "严格确认" : "停一下",
    title: strict ? "先完成锚点验证。" : "确认这次切换。",
  };
  if (persona === "lighthouse") return {
    kicker: strict ? "重新确认方向" : "先确认一下方向",
    title: strict ? "用锚点码确认这次离开。" : "这个站点与本次学习有关吗？",
  };
  return {
    kicker: strict ? "严格上下文校验" : "上下文切换",
    title: strict ? "验证目标站点与许可范围。" : "确认即将进入的新来源。",
  };
}
