export function normalizeSiteKey(rawUrl: string): string {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

export function safeSiteKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeSiteKey(rawUrl);
  } catch {
    return null;
  }
}

export function isSupportedCoreUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return ["file:", "http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
