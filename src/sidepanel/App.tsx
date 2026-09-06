import { useEffect, useMemo, useState } from "react";
import { type DialogueMessage, type ProviderSummary, type Settings } from "../domain/types";
import { useAppState } from "../shared/use-app-state";
import { PersonaGlyph } from "../companion/Persona";

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span>A</span><i /><span>Q</span>
    </div>
  );
}

function SettingsPanel({
  settings,
  provider,
  onChange,
  onSaveProvider,
  onTestProvider,
  onClearProvider,
}: {
  settings: Settings;
  provider: ProviderSummary;
  onChange: (value: Partial<Settings>) => void;
  onSaveProvider: (value: { baseUrl: string; model: string; apiKey?: string; consentGranted: true }) => Promise<void>;
  onTestProvider: () => Promise<void>;
  onClearProvider: () => Promise<void>;
}) {
  const [intervalInput, setIntervalInput] = useState(String(settings.recheckIntervalMinutes));
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [model, setModel] = useState(provider.model);
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(provider.consentGranted);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState<string>();

  useEffect(() => {
    setIntervalInput(String(settings.recheckIntervalMinutes));
  }, [settings.recheckIntervalMinutes]);

  useEffect(() => {
    setBaseUrl(provider.baseUrl);
    setModel(provider.model);
    setConsent(provider.consentGranted);
  }, [provider.baseUrl, provider.model, provider.consentGranted]);

  const commitInterval = (raw: string) => {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed)
      ? Math.min(60, Math.max(5, Math.round(parsed)))
      : settings.recheckIntervalMinutes;
    setIntervalInput(String(next));
    if (next !== settings.recheckIntervalMinutes) onChange({ recheckIntervalMinutes: next });
  };

  return (
    <section className="settings-panel aq-card">
      <div className="section-kicker">伴学设置</div>
      <label className="switch-row">
        <span><strong>悬浮伴学</strong><small>在论文页显示角色提醒</small></span>
        <input
          type="checkbox"
          checked={settings.companionEnabled}
          onChange={(event) => onChange({ companionEnabled: event.target.checked })}
        />
      </label>

      <div className="field-label">伴学角色</div>
      <div className="persona-grid">
        {([
          ["whip", "鞭子", "严格"],
          ["lighthouse", "灯塔", "温柔"],
          ["prism", "棱镜", "理性"],
        ] as const).map(([id, name, tone]) => (
          <button
            key={id}
            className={`persona-choice ${settings.persona === id ? "selected" : ""}`}
            onClick={() => onChange({ persona: settings.persona === id ? null : id })}
          >
            <PersonaGlyph persona={id} />
            <strong>{name}</strong><small>{tone}</small>
          </button>
        ))}
      </div>
      {settings.persona && <button className="clear-persona" onClick={() => onChange({ persona: null })}>清空伴学角色</button>}

      <div className="field-label">再次提醒间隔</div>
      <div className="interval-stepper">
        <button
          type="button"
          aria-label="提醒间隔减 1 分钟"
          disabled={settings.recheckIntervalMinutes <= 5}
          onClick={() => commitInterval(String(settings.recheckIntervalMinutes - 1))}
        >−</button>
        <label>
          <input
            type="number"
            min="5"
            max="60"
            step="1"
            inputMode="numeric"
            aria-label="再次提醒间隔分钟数"
            value={intervalInput}
            onChange={(event) => {
              const value = event.target.value;
              setIntervalInput(value);
              if (/^\d+$/.test(value)) {
                const number = Number(value);
                if (number >= 5 && number <= 60) onChange({ recheckIntervalMinutes: number });
              }
            }}
            onBlur={() => commitInterval(intervalInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitInterval(intervalInput);
                event.currentTarget.blur();
              }
            }}
          />
          <span>分钟</span>
        </label>
        <button
          type="button"
          aria-label="提醒间隔加 1 分钟"
          disabled={settings.recheckIntervalMinutes >= 60}
          onClick={() => commitInterval(String(settings.recheckIntervalMinutes + 1))}
        >＋</button>
      </div>
      <small className="interval-hint">可输入 5–60 的自然数，默认 10 分钟</small>

      <div className="field-label">确认模式</div>
      <div className="segmented">
        <button
          className={settings.verificationMode === "standard" ? "active" : ""}
          onClick={() => onChange({ verificationMode: "standard" })}
        >普通确认</button>
        <button
          className={settings.verificationMode === "strict" ? "active" : ""}
          onClick={() => onChange({ verificationMode: "strict" })}
        >严格确认</button>
      </div>

      <div className="provider-divider" />
      <div className="field-label provider-heading">
        <span>模型连接</span>
        <i className={provider.configured && provider.consentGranted ? "ready" : ""}>
          {provider.configured && provider.consentGranted ? "本次浏览已就绪" : "尚未配置"}
        </i>
      </div>
      <label className="provider-field">
        <span>OpenAI 兼容接口地址</span>
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
      </label>
      <label className="provider-field">
        <span>模型名称</span>
        <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="provider/model-name" />
      </label>
      <label className="provider-field">
        <span>API Key</span>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={provider.configured ? "已配置；留空则保持不变" : "仅保留到本次浏览器关闭"}
        />
      </label>
      <label className="provider-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>我同意将学习目标、回答及必要的论文片段发送到上述模型服务。</span>
      </label>
      {providerMessage && <div className="provider-message">{providerMessage}</div>}
      <div className="provider-actions">
        <button
          type="button"
          className="provider-save"
          disabled={providerBusy || !consent || !baseUrl.trim() || !model.trim() || (!apiKey.trim() && !provider.configured)}
          onClick={async () => {
            setProviderBusy(true);
            setProviderMessage(undefined);
            try {
              await onSaveProvider({
                baseUrl: baseUrl.trim(),
                model: model.trim(),
                ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                consentGranted: true,
              });
              setApiKey("");
              await onTestProvider();
              setProviderMessage("连接成功，真实模型已就绪。 ");
            } catch (reason) {
              setProviderMessage(reason instanceof Error ? reason.message : "模型连接失败");
            } finally {
              setProviderBusy(false);
            }
          }}
        >{providerBusy ? "正在验证…" : "保存并测试"}</button>
        <button
          type="button"
          className="provider-clear"
          disabled={providerBusy || !provider.configured}
          onClick={async () => {
            setProviderBusy(true);
            try {
              await onClearProvider();
              setApiKey("");
              setProviderMessage("模型凭据已从本机清除。 ");
            } finally {
              setProviderBusy(false);
            }
          }}
        >清除凭据</button>
      </div>
      <small className="provider-note">Key 仅保存在浏览器会话中，不会写入扩展包；关闭 Edge 后需要重新填写。</small>
    </section>
  );
}

function ChallengeCard({
  site,
  scope,
  onReveal,
}: {
  site: string;
  scope: string;
  onReveal: () => Promise<string>;
}) {
  const [code, setCode] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <section className="challenge-card aq-card">
      <div className="eyebrow">重新确认学习锚点</div>
      <h2>{site}</h2>
      <p>申请范围：{scope}</p>
      {code ? (
        <div className="anchor-code" aria-label={`锚点码 ${code}`}>
          {code.slice(0, 3)} <span>{code.slice(3)}</span>
        </div>
      ) : (
        <button
          className="primary dark"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { setCode(await onReveal()); } finally { setBusy(false); }
          }}
        >
          {busy ? "正在生成…" : "显示锚点码"}
        </button>
      )}
      <small>仅可使用一次。返回论文、切换目标或结束会话后立即失效。</small>
    </section>
  );
}

function markContradiction(text: string, quote?: string) {
  if (!quote || !text.includes(quote)) return <>{text}</>;
  const [before, ...rest] = text.split(quote);
  return <>{before}<mark className="contradiction">{quote}</mark>{rest.join(quote)}</>;
}

function DialogueView({
  question,
  source,
  messages,
  busy,
  error,
  onSend,
  onGenerate,
  onEvidence,
  onEnd,
}: {
  question: string;
  source: "generated";
  messages: DialogueMessage[];
  busy: boolean;
  error?: string;
  onSend: (text: string) => Promise<void>;
  onGenerate: () => Promise<void>;
  onEvidence: (page: number) => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const questionReady = Boolean(question.trim());

  const diagnosisForUser = useMemo(() => {
    const map = new Map<string, DialogueMessage["diagnosis"]>();
    messages.forEach((message, index) => {
      if (message.role === "user") {
        const next = messages[index + 1];
        if (next?.role === "assistant" && next.diagnosis) map.set(message.id, next.diagnosis);
      }
    });
    return map;
  }, [messages]);

  return (
    <div className="dialogue-view">
      <div className="dialogue-heading">
        <div><span className="eyebrow">理解检查</span><h2>用自己的话说明</h2></div>
        <span className="source-pill">论文证据题</span>
      </div>
      <div className={`question-card ${questionReady ? "" : "question-loading"}`}>
        <span>{questionReady ? "Q" : "…"}</span>
        <p>{questionReady ? question : "正在回看论文证据，形成一个值得回答的问题…"}</p>
      </div>
      {questionReady && <button className="text-button" disabled={busy} onClick={() => void onGenerate()}>让 AI 换一道问题</button>}

      <div className="messages">
        {messages.map((message) => {
          const diagnosis = message.role === "user" ? diagnosisForUser.get(message.id) : message.diagnosis;
          return (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-label">{message.role === "user" ? "你的回答" : "AnchorQ"}</div>
              <p>{message.role === "user" ? markContradiction(message.text, diagnosis?.contradictionQuote) : message.text}</p>
              {message.role === "assistant" && message.diagnosis?.contradictionReason && (
                <div className="diagnosis-box">
                  <strong>{message.diagnosis.answerStatus === "incorrect" ? "回答与原文冲突" : "可能与原文冲突"}</strong>
                  <p>{message.diagnosis.contradictionReason}</p>
                  <button onClick={() => void onEvidence(message.diagnosis?.evidencePage || 1)}>查看论文证据 →</button>
                </div>
              )}
            </article>
          );
        })}
        {busy && <div className="thinking"><i /><i /><i /><span>正在核对论文证据</span></div>}
        {error && <div className="inline-error">{error}</div>}
      </div>

      {questionReady && <form
        className="composer"
        onSubmit={async (event) => {
          event.preventDefault();
          const value = input.trim();
          if (!value || busy) return;
          setInput("");
          await onSend(value);
        }}
      >
        <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入你的回答，或继续追问…" rows={3} />
        <button className="send-button" disabled={!input.trim() || busy} aria-label="发送">↑</button>
      </form>}
      <button className="end-link" onClick={() => void onEnd()}>结束问答并清除本次数据</button>
    </div>
  );
}

export function App() {
  const { state, error, setError, dispatch } = useAppState();
  const [goal, setGoal] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (state?.session?.learningGoal) setGoal(state.session.learningGoal);
  }, [state?.session?.learningGoal]);

  useEffect(() => {
    if (state?.session?.challenge || state?.dialogue) setSettingsOpen(false);
  }, [state?.dialogue, state?.session?.challenge]);

  if (!state) return <main className="loading-screen"><Logo /><p>正在连接 AnchorQ…</p></main>;

  const session = state.session;
  const challenge = session?.challenge;
  const visiblePermissions = session
    ? [
        ...session.sessionPermissions.map((item) => `${item.siteKey}（本次会话）`),
        ...session.timedPermissions
          .filter((item) => item.expiresAt > Date.now())
          .map((item) => `${item.siteKey}（约 ${Math.max(1, Math.ceil((item.expiresAt - Date.now()) / 60_000))} 分钟）`),
      ]
    : [];

  return (
    <main className={`app-shell persona-${state.settings.persona || "neutral"}`}>
      <header className="topbar">
        <div className="brand"><Logo /><div><strong>AnchorQ</strong><small>锚住注意，问出理解</small></div></div>
        <button className={`icon-button ${settingsOpen ? "active" : ""}`} onClick={() => setSettingsOpen(!settingsOpen)} aria-label="设置">⌁</button>
      </header>

      {settingsOpen && (
        <SettingsPanel
          settings={state.settings}
          provider={state.provider}
          onChange={(value) => void dispatch({ type: "SETTINGS_UPDATE", payload: value })}
          onSaveProvider={async (value) => { await dispatch({ type: "MODEL_CONFIG_SAVE", payload: value }); }}
          onTestProvider={async () => { await dispatch({ type: "MODEL_CONFIG_TEST" }); }}
          onClearProvider={async () => { await dispatch({ type: "MODEL_CONFIG_CLEAR" }); }}
        />
      )}

      {error && <div className="global-error"><span>{error}</span><button onClick={() => setError(undefined)}>×</button></div>}

      {!session ? (
        <section className="start-view">
          <div className="hero-pattern"><i /><i /><i /></div>
          <span className="eyebrow">论文学习会话</span>
          <h1>开始一次<br />有锚点的阅读</h1>
          <p className="intro">先在 Edge 中打开本地论文。AnchorQ 会把无意识切换变成一次明确选择。</p>
          <label className="goal-field">
            <span>这次想重点弄懂什么？（选填）</span>
            <textarea
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                if (error) setError(undefined);
              }}
              placeholder="例如：我想弄懂作者的核心论点与证据"
              rows={4}
            />
          </label>
          <button
            className="primary"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try { await dispatch({ type: "SESSION_START", payload: { learningGoal: goal } }); }
              finally { setStarting(false); }
            }}
          >{starting ? "正在建立锚点…" : "开始学习"}<span>→</span></button>
          <p className="permission-note">本地 PDF 需要在扩展详情中开启“允许访问文件网址”。</p>
          {!state.providerReady && <button className="model-setup-link" onClick={() => setSettingsOpen(true)}>开始前配置自己的模型 →</button>}
        </section>
      ) : state.dialogue ? (
        <DialogueView
          {...state.dialogue}
          onSend={async (text) => { await dispatch({ type: "AI_SEND", payload: { text } }); }}
          onGenerate={async () => { await dispatch({ type: "AI_GENERATE_QUESTION" }); }}
          onEvidence={async (pageNumber) => { await dispatch({ type: "SOURCE_RETURN", payload: { pageNumber } }); }}
          onEnd={async () => { await dispatch({ type: "AI_END" }); }}
        />
      ) : (
        <section className="active-view">
          <div className="status-line"><i /><span>学习中</span><small>{state.providerReady ? "模型就绪" : "模型未配置"}</small></div>
          <div className="paper-card aq-card">
            <span className="eyebrow">核心材料</span>
            <h1>{session.paperTitle}</h1>
            <div className="paper-meta">
              {session.paperIndex.status === "ready"
                ? `${session.paperIndex.textPages} 页文字可用于理解检查`
                : session.paperIndex.status === "unsupported"
                  ? "未检测到文本层，暂不支持扫描件"
                  : `正在建立本地文字索引 ${session.paperIndex.indexedPages}/${session.paperIndex.totalPages || "…"}`}
            </div>
          </div>
          {session.learningGoal && <div className="goal-summary"><span>本次目标</span><p>{session.learningGoal}</p></div>}

          {session.pendingTarget && (
            <div className="pending-strip"><i />正在确认访问 <strong>{session.pendingTarget.siteKey}</strong></div>
          )}

          {visiblePermissions.length > 0 && !session.pendingTarget && (
            <div className="permission-strip">
              <span>当前已放行</span>
              <strong>{visiblePermissions.join(" · ")}</strong>
            </div>
          )}

          {challenge && challenge.state !== "cancelled" && (
            <ChallengeCard
              key={challenge.id}
              site={challenge.siteKey}
              scope={challenge.permissionScope.type === "session" ? "本次会话内不再询问" : `继续使用 ${challenge.permissionScope.durationMinutes} 分钟`}
              onReveal={async () => {
                const result = await chrome.runtime.sendMessage({ type: "CHALLENGE_REVEAL" });
                if (!result?.ok) throw new Error(result?.error || "无法显示锚点码");
                return result.data.code as string;
              }}
            />
          )}

          <div className="active-actions">
            <button className="secondary" onClick={() => void dispatch({ type: "SESSION_RETURN_CORE" })}>返回核心材料</button>
            <button
              className="primary"
              disabled={!state.providerReady || session.paperIndex.textPages < 1 || session.paperIndex.status === "unsupported"}
              onClick={() => void dispatch({ type: "SESSION_END_WITH_AI" })}
            >结束并检查理解 <span>→</span></button>
            <button className="end-link" onClick={() => void dispatch({ type: "SESSION_END_DIRECT" })}>直接结束并清除数据</button>
          </div>
        </section>
      )}
    </main>
  );
}
