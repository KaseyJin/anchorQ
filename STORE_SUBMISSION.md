# AnchorQ Edge 商店提交清单

- 首次公开版本：`1.0.0`
- 正式支持范围：Windows 10/11 上的 Microsoft Edge 桌面版 114+

- 发布者类型：个人开发者
- 发布者显示名称：kasey
- 公开支持与隐私邮箱：jinxy3799@gmail.com
- 隐私政策静态页面：`docs/index.html`（已由 GitHub Pages 发布）
- 公开地址：`https://kaseyjin.github.io/anchorQ/`
- 中文商店资料：`STORE_LISTING_ZH_CN.md`
- 认证测试说明：`CERTIFICATION_NOTES_ZH_CN.md`
- 商店 Logo：`store-assets/logo/anchorq-store-logo-300x300.png`
- 商店截图：`store-assets/screenshots/`（3 张，均为 1280×800）
- 小型宣传图：`store-assets/promotional/anchorq-small-promo-440x280.png`

## 当前已满足

- Manifest V3，全部可执行代码随扩展打包，不加载远程脚本。
- 单一用途：PDF 阅读期间的注意力管理与理解检验。
- 模型凭据由用户提供，不包含开发者公共 Key。
- API Key 只保留在浏览器会话存储，并与网页内容脚本隔离。
- 在发送学习内容前取得明确同意。
- 普通网站访问权位于 `optional_host_permissions`，首次启用守护时通过 Edge 官方界面按需申请。
- 提供模型连接测试和一键清除凭据。
- 未配置模型时仍可完整测试阅读器与网页守护，理解检查会明确显示不可用原因。
- 支持结束会话时清除对话与临时许可。
- 隐私政策已发布到无需登录即可访问的 HTTPS 页面，并包含联系邮箱与生效日期。
- 已准备 300×300 商店 Logo、3 张真实产品截图、440×280 小型宣传图与中文商店描述。
- 已准备不含真实秘密的认证测试说明模板，并约定审核凭据仅通过 Partner Center 提供。
- 审核专用凭据有效期为提交日起 30 天，审核完成后立即撤销。
- 第一版不集成使用统计、行为分析、广告追踪或崩溃上报服务；代码扫描未发现相关 SDK。
- Manifest 使用 Chromium Edge 支持的 `minimum_chrome_version` 字段声明最低版本 114。

## 提交前仍需完成

- 用多种公开 PDF 验证正文提取、页码引用、容量上限与证据定位。
- 对所有声明权限完成最小化复核，并撰写 Partner Center 权限说明。
- 完成正常、断网、错误 Key、超长 PDF、扫描版 PDF、浏览器重启和受保护页面测试。
- 生成不含源码映射、测试文件、开发凭据或本地文件的发布 ZIP，并对 ZIP 再做一次秘密扫描。

## 建议认证测试路径

1. 安装扩展并允许访问文件网址。
2. 在侧栏配置测试人员自己的 OpenAI 兼容模型，阅读披露并连接测试。
3. 打开一篇 PDF，开始学习会话。
4. 切换到普通 HTTPS 页面，验证确认层在页面内容可见前显示。
5. 返回论文并结束阅读，完成一次基于论文证据的理解问答。
6. 在设置中清除模型凭据，并结束会话清除对话。
