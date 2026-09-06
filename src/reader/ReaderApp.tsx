import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useAppState } from "../shared/use-app-state";
import { CompanionOverlay } from "./CompanionOverlay";

GlobalWorkerOptions.workerSrc = workerUrl;

export function ReaderApp() {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const source = query.get("source") || "";
  const { state, error: stateError, dispatch } = useAppState();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1.15);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [focusFlash, setFocusFlash] = useState(false);
  const [indexError, setIndexError] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const lastWheelFlipRef = useRef(0);

  useEffect(() => {
    if (!source) {
      setError("没有找到 PDF 来源地址");
      setLoading(false);
      return;
    }
    const task = getDocument({ url: source });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total) setLoadProgress(Math.round((loaded / total) * 100));
    };
    void task.promise
      .then((document) => {
        setPdf(document);
        setLoading(false);
      })
      .catch(() => {
        setError("无法读取本地 PDF。请确认已在扩展详情中开启“允许访问文件网址”。");
        setLoading(false);
      });
    return () => { void task.destroy(); };
  }, [source]);

  useEffect(() => {
    const session = state?.session;
    if (!pdf || !session || session.paperIndex.status === "ready" || session.paperIndex.status === "unsupported") return;
    let cancelled = false;
    const maxPages = Math.min(pdf.numPages, 400);
    const maxCharacters = 1_500_000;
    void (async () => {
      try {
        let batch: Array<{ pageNumber: number; text: string }> = [];
        let totalCharacters = 0;
        for (let pageNumber = 1; pageNumber <= maxPages && !cancelled; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const extracted = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const remaining = Math.max(0, maxCharacters - totalCharacters);
          const text = extracted.slice(0, Math.min(12000, remaining));
          totalCharacters += text.length;
          const characterCapReached = totalCharacters >= maxCharacters;
          batch.push({ pageNumber, text });
          if (batch.length === 8 || pageNumber === maxPages || characterCapReached) {
            const result = await chrome.runtime.sendMessage({
              type: "PAPER_INDEX_BATCH",
              payload: {
                sessionId: session.id,
                totalPages: pdf.numPages,
                capped: pdf.numPages > maxPages || characterCapReached,
                done: pageNumber === maxPages || characterCapReached,
                pages: batch,
              },
            });
            if (!result?.ok) throw new Error(result?.error || "无法保存论文索引");
            batch = [];
          }
          if (characterCapReached) break;
        }
      } catch (reason) {
        if (!cancelled) setIndexError(reason instanceof Error ? reason.message : "论文文字提取失败");
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, state?.session?.id]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      await renderTaskRef.current?.cancel();
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: zoom * devicePixelRatio });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / devicePixelRatio}px`;
      canvas.style.height = `${viewport.height / devicePixelRatio}px`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      const task = page.render({ canvas, canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise.catch((reason) => {
        if (reason?.name !== "RenderingCancelledException") throw reason;
      });
    })();
    setPageInput(String(pageNumber));
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [pdf, pageNumber, zoom]);

  useEffect(() => {
    const focus = state?.session?.readerFocus;
    if (!focus) return;
    setPageNumber(focus.pageNumber);
    setFocusFlash(false);
    const frame = requestAnimationFrame(() => setFocusFlash(true));
    const timer = setTimeout(() => setFocusFlash(false), 4200);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [state?.session?.readerFocus?.nonce]);

  useEffect(() => {
    if (!state?.session) return;
    void chrome.runtime.sendMessage({ type: "READER_PROGRESS", payload: { pageNumber } });
  }, [pageNumber, state?.session?.id]);

  const goPage = (next: number) => {
    if (!pdf) return;
    const normalized = Math.min(pdf.numPages, Math.max(1, next));
    if (normalized === pageNumber) return;
    stageRef.current?.scrollTo({ top: 0 });
    setPageNumber(normalized);
  };

  const handlePageWheel = (event: React.WheelEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage || !pdf || Math.abs(event.deltaY) < 18) return;
    const atTop = stage.scrollTop <= 2;
    const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
    const now = performance.now();
    if (now - lastWheelFlipRef.current < 650) return;

    if (event.deltaY > 0 && atBottom && pageNumber < pdf.numPages) {
      event.preventDefault();
      lastWheelFlipRef.current = now;
      goPage(pageNumber + 1);
    } else if (event.deltaY < 0 && atTop && pageNumber > 1) {
      event.preventDefault();
      lastWheelFlipRef.current = now;
      goPage(pageNumber - 1);
    }
  };

  return (
    <main className={`reader-shell persona-${state?.settings.persona || "neutral"}`}>
      <header className="reader-toolbar">
        <div className="reader-brand"><span>AQ</span><div><strong>AnchorQ Reader</strong><small>{state?.session?.paperTitle || "PDF 论文"}</small></div></div>
        <div className="page-controls">
          <button className="page-button" onClick={() => goPage(pageNumber - 1)} disabled={!pdf || pageNumber <= 1} aria-label="上一页">← <span>上一页</span></button>
          <form onSubmit={(event) => { event.preventDefault(); goPage(Number(pageInput) || 1); }}>
            <input value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))} aria-label="页码" />
            <span>/ {pdf?.numPages || "—"}</span>
          </form>
          <button className="page-button" onClick={() => goPage(pageNumber + 1)} disabled={!pdf || pageNumber >= pdf.numPages} aria-label="下一页"><span>下一页</span> →</button>
        </div>
        <div className="zoom-controls">
          <button onClick={() => setZoom(Math.max(.65, zoom - .15))} aria-label="缩小">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(2.2, zoom + .15))} aria-label="放大">＋</button>
          <button className="original-button" onClick={() => { location.href = source; }}>原始 PDF</button>
        </div>
      </header>

      <section className="reader-stage" ref={stageRef} onWheel={handlePageWheel}>
        {loading && (
          <div className="reader-loading"><div className="loading-ring" /><strong>正在展开论文</strong><span>{loadProgress || 0}%</span></div>
        )}
        {(error || stateError) && (
          <div className="reader-error"><strong>PDF 未能打开</strong><p>{error || stateError}</p><button onClick={() => { location.href = source; }}>使用 Edge 打开原始 PDF</button></div>
        )}
        {indexError && <div className="reader-index-warning">文字索引失败：{indexError}</div>}
        {!loading && !error && (
          <div className="paper-wrap">
            <canvas ref={canvasRef} />
            {state?.session?.readerFocus?.pageNumber === pageNumber && (
              <div className={`table-focus ${focusFlash ? "visible" : ""}`}>
                <span>{state.session.readerFocus.kind === "table-one" ? "论文证据 · Table 1" : "论文证据 · 对应原文"}</span>
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="reader-footer">
        <span>{state?.session?.paperIndex.status === "unsupported"
          ? "未检测到文本层 · 扫描版 PDF 暂不支持理解问答"
          : state?.session?.paperIndex.status === "ready"
            ? `文字索引就绪 · ${state.session.paperIndex.textPages} 页可用`
            : "正在本地建立文字索引…"}</span>
        <span>当前页 {pageNumber}</span>
      </footer>

      {state && <CompanionOverlay state={state} dispatch={dispatch} />}
    </main>
  );
}
