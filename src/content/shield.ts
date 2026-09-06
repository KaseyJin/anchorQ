const SHIELD_ID = "anchorq-pre-navigation-shield";
const STAGE_W = 345;
const STAGE_H = 195;

type Persona = "whip" | "lighthouse" | "prism";
type ShieldView = {
  paperTitle: string;
  siteKey: string;
  persona: Persona | null;
  companionEnabled: boolean;
  verificationMode: "standard" | "strict";
  durationMinutes: number;
  challenge?: {
    state: string;
    scope: { type: "session" } | { type: "timed"; durationMinutes: number };
  };
};
type ShieldStatus = { shield: boolean; view?: ShieldView };
type ShieldMessage = {
  type: "ANCHORQ_SET_SHIELD";
  shield: boolean;
  view?: ShieldView;
};

let host: HTMLDivElement | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

/** 与 Reader 的 PersonaFigure 保持同一版造型；鞭子改由 Canvas 绘制，不在这里出图。 */
function personaGraphic(persona: Persona | null): string {
  if (persona === "lighthouse") {
    return `<svg viewBox="0 0 160 160" aria-hidden="true"><defs><linearGradient id="aq-beam" x1="68" y1="46" x2="0" y2="34" gradientUnits="userSpaceOnUse"><stop stop-color="#fff6d8" stop-opacity=".9"/><stop offset=".45" stop-color="#ffe9a8" stop-opacity=".4"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient></defs><path fill="url(#aq-beam)" d="M68 46 4 6 0 64z"/><path fill="none" stroke="#f5cf6b" stroke-width="3" stroke-linecap="round" d="M98 40l34-18M100 54l40-4"/><path fill="#e08aa4" stroke="#e08aa4" stroke-width="3" stroke-linejoin="round" d="M80 16l17 18H63z"/><path fill="#f5cc5f" stroke="#e08aa4" stroke-width="3" stroke-linejoin="round" d="M67 58V34h26v24z"/><path fill="#e08aa4" stroke="#e08aa4" stroke-width="3" stroke-linejoin="round" d="M59 58h42v8H59z"/><path fill="#fdeef3" stroke="#e08aa4" stroke-width="3" stroke-linejoin="round" d="M46 142l17-76h34l17 76z"/><path fill="none" stroke="#e08aa4" stroke-width="3" stroke-linecap="round" d="M55 112h50M26 142q27-10 54 0 27-10 54 0"/></svg>`;
  }
  if (persona === "prism") {
    return `<svg viewBox="0 0 160 160" aria-hidden="true"><defs><linearGradient id="aq-glass" x1="80" y1="20" x2="80" y2="124" gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff" stop-opacity=".42"/><stop offset="1" stop-color="#9dc2f2" stop-opacity=".2"/></linearGradient></defs><path fill="url(#aq-glass)" stroke="#8fb4e6" stroke-width="3.4" stroke-linejoin="round" d="M80 20l56 104H24z"/><path fill="none" stroke="#aebccd" stroke-width="3" stroke-linecap="round" d="M0 64l52 6"/><path fill="none" stroke="#d6e4f5" stroke-width="2" stroke-linecap="round" d="M52 70l62 16"/><path fill="none" stroke="#9dc2f2" stroke-width="3" stroke-linecap="round" d="M116 82l42-26"/><path fill="none" stroke="#6f9ad8" stroke-width="3" stroke-linecap="round" d="M118 90l42-2"/><path fill="none" stroke="#93a6bd" stroke-width="3" stroke-linecap="round" d="M120 98l36 24"/></svg>`;
  }
  return "";
}

function personaCopy(persona: Persona | null, strict: boolean) {
  if (!persona) return {
    name: "AnchorQ",
    kicker: strict ? "严格确认" : "访问确认",
    title: strict ? "请输入锚点码以继续。" : "确认这次切换。",
  };
  if (persona === "whip") return {
    name: "鞭子",
    kicker: strict ? "严格确认" : "停一下",
    title: strict ? "先验证锚点，再进入这个网站。" : "确认这次切换。",
  };
  if (persona === "lighthouse") return {
    name: "灯塔",
    kicker: strict ? "重新确认方向" : "先确认一下方向",
    title: strict ? "用锚点码确认这次离开。" : "这个网站与本次学习有关吗？",
  };
  return {
    name: "棱镜",
    kicker: strict ? "严格上下文校验" : "上下文切换",
    title: strict ? "验证目标网站与许可范围。" : "确认即将进入的新来源。",
  };
}

function shell(): ShadowRoot {
  if (host?.shadowRoot) return host.shadowRoot;
  host = document.createElement("div");
  host.id = SHIELD_ID;
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;display:block;pointer-events:auto";
  const root = host.attachShadow({ mode: "open" });
  (document.documentElement || document).appendChild(host);
  root.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) return;
    void runAction(button.dataset.action || "");
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = root.querySelector<HTMLInputElement>("#aq-anchor-code");
    const code = input?.value.replace(/\D/g, "") || "";
    if (code.length !== 6) {
      showError("请输入 Side Panel 中的六位锚点码");
      return;
    }
    void runAction("verify", code);
  });
  return root;
}

function removeShield(): void {
  cancelAnimationFrame(whipRaf);
  whipRaf = 0;
  host?.remove();
  host = null;
}

function showError(message: string): void {
  const error = host?.shadowRoot?.querySelector<HTMLElement>(".error");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function render(view: ShieldView): void {
  const strict = view.verificationMode === "strict";
  const copy = personaCopy(view.persona, strict);
  const challenge = view.challenge;
  const scope = challenge?.scope.type === "session"
    ? "本次会话内不再询问"
    : challenge?.scope.type === "timed"
      ? `继续使用 ${challenge.scope.durationMinutes} 分钟`
      : "";
  const controls = challenge ? `
    <div class="scope">申请范围：<strong>${scope}</strong></div>
    <form class="verify"><input id="aq-anchor-code" inputmode="numeric" maxlength="6" placeholder="000 000" aria-label="六位锚点码"/><button>验证并进入</button></form>
    <p class="hint">在 Edge Side Panel 点击“显示锚点码”，然后在这里输入。</p>` : `
    <div class="actions">
      <button class="ghost" data-action="return">返回论文</button>
      <button data-action="timed">${strict ? "验证后" : ""}继续使用 ${view.durationMinutes} 分钟</button>
      <button class="link" data-action="session">${strict ? "验证后" : ""}本次会话内不再询问</button>
    </div>`;

  const root = shell();
  root.innerHTML = `
    <style>
      :host{all:initial}*{box-sizing:border-box}.screen{position:fixed;inset:0;overflow:hidden;background:radial-gradient(circle at 45% 32%,#2a2a2e 0,#1b1b1e 46%,#0e0e10 100%);color:#e6e6ea;font-family:"Segoe UI Variable","Microsoft YaHei UI",sans-serif}.paper{position:absolute;left:50%;top:50%;width:min(54vw,680px);height:82vh;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);box-shadow:0 24px 90px rgba(0,0,0,.32)}.paper:before{content:"";position:absolute;inset:12% 14%;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.08) 0 2px,transparent 2px 24px);opacity:.22}.brand{position:absolute;left:24px;top:20px;display:flex;align-items:center;gap:9px;color:#b9b9c1;font:500 13px Georgia,serif}.brand i{display:grid;place-items:center;width:30px;height:30px;border:1px solid #7d7d86;border-radius:50%;font-style:normal;font-size:10px}.anchorq-companion{position:absolute;right:34px;bottom:42px;width:440px}.figure{position:absolute;right:0;bottom:0;width:165px;height:165px;filter:drop-shadow(0 18px 18px rgba(0,0,0,.38));animation:breathe 2.8s ease-in-out infinite}.figure svg{width:100%;height:100%;overflow:visible}.bubble{position:absolute;right:0;bottom:182px;width:440px;padding:22px;border:1px solid rgba(255,255,255,.14);border-radius:22px 22px 5px 22px;background:#fbfbfc;color:#222226;box-shadow:0 25px 80px rgba(0,0,0,.42)}.bubble:after{content:"";position:absolute;right:58px;bottom:-15px;border:8px solid transparent;border-top-color:#fbfbfc}.anchorq-companion.persona-whip{width:345px}.persona-whip .figure{right:0;bottom:0;width:345px;height:210px;filter:none;animation:none}.persona-whip .whip-canvas{position:absolute;left:0;bottom:0;width:345px;height:195px}.persona-whip .whip-handle{position:absolute;left:12px;bottom:35px;width:66px;height:39px;transform-origin:22% 50%}.persona-whip .handle-grip{position:absolute;left:0;top:11px;width:55px;height:18px;border:2px solid #0f0f11;border-radius:10px;background:repeating-linear-gradient(90deg,#141416 0 5px,#5d5d64 5px 9px);box-shadow:inset 0 2px 2px rgba(255,255,255,.18)}.persona-whip .handle-seal{position:absolute;left:-5px;top:3px;display:grid;place-items:center;width:30px;height:30px;border:2px solid #3b3b41;border-radius:50%;background:#eeeef1;color:#26262a;font:600 8px Georgia,serif;transform:rotate(8deg)}.persona-whip .bubble{bottom:226px;border-radius:22px 22px 22px 5px}.persona-whip .bubble:after{left:34px;right:auto}.kicker{font-size:10px;font-weight:800;letter-spacing:.14em}.bubble h1{margin:6px 0 15px;font:500 26px/1.18 Georgia,"Microsoft YaHei UI",serif}.facts{display:grid;grid-template-columns:76px 1fr;gap:6px 10px;margin-bottom:14px;padding:12px;border-radius:12px}.facts span{font-size:10px}.facts strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.actions{display:grid;grid-template-columns:1fr 1.45fr;gap:8px}.actions button,.verify button{min-height:40px;border-radius:10px;font:700 11px inherit;cursor:pointer}.actions .link{grid-column:1/-1;min-height:28px;border:0;background:transparent;text-decoration:underline;text-underline-offset:3px}.actions button:disabled,.verify button:disabled{background:#a5a09a;border-color:#a5a09a;color:#fdfdfc;cursor:default}.scope{margin:-2px 0 12px;font-size:10px}.verify{display:flex;gap:8px}.verify input{min-width:0;flex:1;height:44px;border-radius:10px;background:#fffdf9;text-align:center;letter-spacing:.34em;font:500 19px Georgia,serif;outline:none}.verify button{width:128px}.hint{margin:8px 0 0;font-size:9px}.error{margin:10px 0 0;padding:8px 10px;border-radius:8px;background:#f6deda;color:#983b35;font-size:10px}.persona-label{position:absolute;right:12px;bottom:-4px;padding:4px 8px;border-radius:999px;font-size:9px}@keyframes breathe{50%{transform:translateY(-3px)}}@media(max-width:760px){.anchorq-companion{right:12px;left:12px;width:auto}.figure{width:115px;height:115px}.bubble{width:auto;left:0;right:0;bottom:150px;padding:16px}.bubble h1{font-size:20px}.actions{grid-template-columns:1fr}.actions .link{grid-column:auto}}
    </style>
    <style>
      .screen{--accent:#9a8e7c;--ink:#171512;--soft:#ece5d5;--surface:#f7f2e7;--muted:#95897a;--line:rgba(45,39,30,.14);--btn:#2b2721;--btn-ink:#fbf7ef}.screen.persona-whip{--accent:#57575c;--ink:#101012;--soft:#eaeaed;--surface:#fbfbfc;--muted:#86868d;--line:rgba(16,16,18,.14);--btn:#131315;--btn-ink:#fafafb}.screen.persona-lighthouse{--accent:#d9738f;--ink:#4a2a35;--soft:#fde8ef;--surface:#fffaf2;--muted:#a8798a;--line:rgba(180,110,132,.22);--btn:#8d4257;--btn-ink:#fff6f8}.screen.persona-prism{--accent:#3d6cb5;--ink:#1c2a3d;--soft:#e5ecf7;--surface:#f9fbfe;--muted:#7d8fa8;--line:rgba(28,42,61,.16);--btn:#22334c;--btn-ink:#f6f9fd}.screen .bubble{background:var(--surface);color:var(--ink);border-color:var(--line)}.screen .bubble:after{border-top-color:var(--surface)}.screen .kicker{color:var(--accent)}.screen .facts{background:var(--soft)}.screen .facts span{color:var(--muted)}.screen .facts strong{color:var(--ink)}.screen .scope,.screen .hint{color:var(--muted)}.screen .actions button,.screen .verify button{border:1px solid var(--btn);background:var(--btn);color:var(--btn-ink)}.screen .actions .ghost{background:transparent;color:var(--ink);border-color:var(--line)}.screen .actions .link{color:var(--accent);border:0;background:transparent}.screen .verify input{border:1px solid var(--line);color:var(--ink)}.screen .persona-label{background:var(--btn);color:var(--btn-ink)}.persona-neutral .figure{display:none}.persona-neutral .bubble{bottom:0}
    </style>
    <main class="screen persona-${view.persona || "neutral"}">
      <div class="brand"><i>AQ</i> AnchorQ · 学习访问确认</div>
      <div class="paper" aria-hidden="true"></div>
      <div class="anchorq-companion persona-${view.persona || "neutral"}">
        <div class="figure">${view.persona === "whip"
          ? `<canvas class="whip-canvas" width="${STAGE_W}" height="${STAGE_H}" aria-hidden="true"></canvas><div class="whip-handle" aria-hidden="true"><span class="handle-grip"></span><span class="handle-seal">AQ</span></div>`
          : personaGraphic(view.persona)}</div>
        <section class="bubble">
          <div class="kicker">${copy.kicker}</div>
          <h1>${challenge ? "输入 Side Panel 中的六位锚点码" : copy.title}</h1>
          <div class="facts"><span>正在学习</span><strong>${escapeHtml(view.paperTitle)}</strong><span>准备访问</span><strong>${escapeHtml(view.siteKey)}</strong></div>
          ${controls}
          <p class="error" hidden></p>
        </section>
        <span class="persona-label">${copy.name}</span>
      </div>
    </main>`;

  mountWhip(root, view.persona === "whip");
}

let whipRaf = 0;

/**
 * 遮罩里的鞭子和 Reader 共用同一套绳索物理与画笔，
 * 这里只负责挂载和在每次重绘时收掉上一轮的动画帧。
 */
function mountWhip(root: ShadowRoot, active: boolean): void {
  cancelAnimationFrame(whipRaf);
  whipRaf = 0;
  if (!active) return;
  const canvas = root.querySelector<HTMLCanvasElement>(".whip-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = STAGE_W * ratio;
  canvas.height = STAGE_H * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const handle = root.querySelector<HTMLElement>(".whip-handle");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startedAt = performance.now();

  const paint = (progress: number) => {
    const eased = 1 - Math.pow(1 - progress, 3);
    const recoil = Math.sin(Math.min(1, progress / .72) * Math.PI) * (1 - progress) * 30;
    context.clearRect(0, 0, STAGE_W, STAGE_H);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(58, 140);
    for (let index = 1; index <= 28; index++) {
      const along = index / 28;
      const extension = 72 + 210 * eased;
      const x = 58 + extension * along;
      const wave = Math.sin(along * Math.PI * 3.2 - eased * 5.4) * (32 * (1 - eased) + recoil) * along;
      const arc = -34 * Math.sin(along * Math.PI) * eased;
      context.lineTo(x, 140 + wave + arc);
    }
    context.strokeStyle = "rgba(5,5,7,.72)";
    context.lineWidth = 6;
    context.stroke();
    context.strokeStyle = "#d5d5da";
    context.lineWidth = 3;
    context.stroke();
    if (handle) handle.style.transform = `translate(${eased * 28 - 10 * (1 - eased)}px,${-eased * 7}px) rotate(${eased * 8 - 17 * (1 - eased)}deg)`;
  };

  if (reduced) {
    paint(1);
    return;
  }
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / 520);
    paint(progress);
    if (progress < 1) whipRaf = requestAnimationFrame(tick);
    else whipRaf = 0;
  };
  whipRaf = requestAnimationFrame(tick);
}

async function refreshStatus(): Promise<void> {
  const status = await chrome.runtime.sendMessage({
    type: "ANCHORQ_SHIELD_STATUS",
    url: location.href,
  }) as ShieldStatus;
  if (!status?.shield) removeShield();
  else if (status.view) render(status.view);
}

async function runAction(action: string, code?: string): Promise<void> {
  const buttons = host?.shadowRoot?.querySelectorAll<HTMLButtonElement>("button");
  buttons?.forEach((button) => { button.disabled = true; });
  try {
    const result = await chrome.runtime.sendMessage({
      type: "ANCHORQ_SHIELD_ACTION",
      action,
      code,
    });
    if (!result?.ok) throw new Error(result?.error || "操作失败");
    await refreshStatus();
  } catch (error) {
    showError(error instanceof Error ? error.message : "操作失败");
    buttons?.forEach((button) => { button.disabled = false; });
  }
}

chrome.runtime.onMessage.addListener((message: ShieldMessage) => {
  if (message?.type !== "ANCHORQ_SET_SHIELD") return;
  if (!message.shield) removeShield();
  else if (message.view) render(message.view);
});

void refreshStatus().catch(() => removeShield());
