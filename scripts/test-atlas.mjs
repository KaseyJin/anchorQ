const apiKey = process.env.ANCHORQ_ATLAS_API_KEY;

if (!apiKey) {
  console.error("未设置 ANCHORQ_ATLAS_API_KEY；未发送任何请求。");
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20_000);

try {
  const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-terra",
      messages: [
        { role: "system", content: "只回答合法 JSON 对象，不要代码块或解释。" },
        { role: "user", content: "返回一个对象，包含 status=ok 和 message=AnchorQ 模型连通正常。" },
      ],
      temperature: 0,
      max_tokens: 80,
      stream: false,
      response_format: { type: "json_object" },
    }),
    signal: controller.signal,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Atlas 请求失败：${message}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Atlas 返回成功，但响应中没有模型文本。");
  }
  let structured;
  try {
    structured = JSON.parse(content);
  } catch {
    throw new Error("Atlas 返回了文本，但没有遵守 JSON 对象格式。");
  }
  if (structured?.status !== "ok" || typeof structured?.message !== "string") {
    throw new Error("Atlas 返回 JSON，但字段结构与请求不一致。");
  }

  console.log(`Atlas 结构化响应成功（模型：${body.model || "openai/gpt-5.6-terra"}）`);
  console.log(structured.message);
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error("Atlas 连通检查超时（20 秒）。");
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
