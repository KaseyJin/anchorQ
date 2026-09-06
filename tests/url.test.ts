import { describe, expect, it } from "vitest";
import { normalizeSiteKey, safeSiteKey } from "../src/domain/url";

describe("siteKey 规范化", () => {
  it("移除 www 并统一小写", () => {
    expect(normalizeSiteKey("https://WWW.GitHub.com/a/b")).toBe("github.com");
  });

  it("保留任意子域名", () => {
    expect(normalizeSiteKey("https://docs.github.com/zh")).toBe("docs.github.com");
  });

  it("拒绝非 HTTP 页面", () => {
    expect(safeSiteKey("edge://newtab/")).toBeNull();
    expect(safeSiteKey("file:///C:/paper.pdf")).toBeNull();
  });
});
