# AnchorQ 产品架构

## 目标

AnchorQ 面向可公开分发的 Edge Manifest V3 扩展：从 PDF 开始学习、管理分心站点访问、通过用户自行配置的模型完成基于证据的理解辅导，并回到 PDF 原文。

## 模块边界

```text
Edge tabs events
      |
      v
Service Worker --------> 用户选择的 OpenAI 兼容模型
      |                       |
      +---- state ------------+
      |          |
      v          v
Side Panel   PDF Reader + Companion
```

- `src/domain`：纯业务规则，不依赖浏览器或 React。
- `src/background`：唯一状态真相源，监听 Edge、发放许可、验证挑战和调用模型。
- `src/sidepanel`：会话控制、设置、挑战码和 AI 对话。
- `src/reader`：本地 PDF 渲染、确认气泡和证据页高亮。
- `src/content`：在学习会话开始时预先遮蔽未获许可的网页，不读取页面正文。
- `src/companion`：鞭子、灯塔、棱镜视觉；不改变业务判断。绳索物理与画笔（`whip-rope.ts` / `whip-draw.ts`）不依赖框架，Reader 与网页遮罩层共用同一份。
- `src/agent`：OpenAI 兼容 Chat Completions 协议、Prompt、结构化输出校验与容错。
- `src/shared`：存储、消息请求和 React 状态订阅。

## 状态原则

1. Service Worker 是唯一可修改会话、许可和挑战状态的模块。
2. Side Panel 与 Reader 通过 `chrome.storage.session` 观察状态，不保留另一份业务真相。
3. 后台重新计算目标标签页的站点键，不信任 UI 提交的站点信息。
4. 返回核心论文时清除全部定时许可；会话许可继续保留。
5. 严格挑战绑定 `sessionId + siteKey + tabId + scope`，明文码只在 Reveal 响应中出现一次。
6. Content Script 不接触 API Key，也不采集普通网页正文、表单或密码。
7. 网页防护层在标签被点击前预先安装；确认、许可和严格验证码均在遮罩内完成，获准后才撤下并显示目标网页。
8. 悬浮伴学角色在整个阅读会话中常驻；鞭身由 Canvas 绘制，鞭柄和功能气泡由稳定的 DOM 节点承载。
9. 鞭子、灯塔、棱镜不仅切换视觉与界面措辞，也会向模型注入不同表达策略；事实判断和证据门槛保持一致。
10. Agent 以苏格拉底式伴学和自适应回忆准则为共同教学价值函数；角色提示词位于其下层，只调节反馈节奏与措辞，不覆盖主动学习、认知负荷和实证边界。

## 鞭子交互状态

`hidden → idle → prepare → snap → bubble_open` 是普通确认主路径；严格确认进入 `point_to_sidebar`。`recheck`、`feedback_mark` 与 `dismiss` 已保留为后续行为语义，功能按钮和文本标记不依赖 Canvas 命中区域。

鞭身是一条 Verlet 绳索（`src/companion/whip-rope.ts`），参数与解算顺序移植自 VibeWhip/badclaude 的 `overlay.html`，按画布尺寸等比缩小：26 个质点、锥形段长、16 次距离约束迭代、逐关节弯曲上限从鞭根 16° 放宽到鞭梢 130°，绘制用 Catmull-Rom 转贝塞尔加描边／芯线两道笔画。

这里没有鼠标，所以 `snap` 由脚本轨迹驱动鞭柄：后撤蓄力、ease-out 甩出、再收回原位；参考实现的自动甩鞭同样不指望脚本甩得够快，到第 14 帧直接给鞭梢注入速度保证炸响。炸响之后一个软约束把鞭身收束到停留姿态，避免绳索垂到画布外。姿态一律按**弧长占比**取样，不能用序号占比——段长是锥形递减的，两者对不上时鞭身永远松垮着直不起来。

气泡等鞭梢真的炸响了才落位（`onCrack` 回调），另有兜底计时器。`tests/whip-rope.test.ts` 锁住这套行为：必定炸响、炸响时已抽直、最终收束到停留姿态、全程不出画布。

网页遮罩层（`src/content/shield.ts`）在 Shadow DOM 里自己拼 HTML，不走 React，但角色造型、配色、气泡位置和鞭子动画都必须和 Reader 保持一致——它是第二块要一起改的界面，别只改 `reader.css`。

## 伴学角色配色

PDF 阅读器和遮罩恒为深黑灰，不随角色变色；角色只体现在气泡和角色本身。四套气泡配色由 CSS 变量承载，Side Panel 与 Reader 共用同一组语义名：清空角色为米白／近黑／暖灰，鞭子为黑白灰，灯塔为浅粉加黄，棱镜为蓝加蓝灰。角色只改视觉与措辞，不改事实判断与证据门槛。

气泡一律浮在角色上方、尾巴朝下指向角色。鞭子指向鞭柄，灯塔／棱镜指向角色本体——早先静态角色沿用了默认的「气泡在左」定位，会压住角色左半身。

## 当前迁移限制

- 定时许可使用墙钟过期时间；不会在用户持续停留时主动弹出到期提醒。
- PDF Reader 为单页模式，只提供翻页、跳页、缩放和原始 PDF 回退。
- PDF 证据定位只保证第 64 页表 1。
- 出题、诊断与连续对话均使用从当前 PDF 中选取的真实证据，并调用用户配置的模型。
- 诊断与后续自由对话使用真实模型；失败时显示错误，不使用伪造备用结果。
- 不支持浏览器重启后的活动会话恢复。

## 模型与凭据信任边界

- 用户自行提供 HTTPS 接口地址、模型名称和 API Key；扩展包不包含开发者 Key。
- 接口地址和模型名称写入 `chrome.storage.local`；Key 仅写入 `chrome.storage.session`，关闭浏览器后清除。
- `chrome.storage.session` 被限制为 `TRUSTED_CONTEXTS`，Content Script 无法读取凭据。
- Key 不进入 AppState、页面 DOM、日志或错误文本。
- 模型请求只由 Service Worker 发起；用户明确同意后才发送学习目标、问答和必要论文片段。
