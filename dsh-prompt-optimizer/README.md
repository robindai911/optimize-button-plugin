# dsh-prompt-optimizer

给 DeepSeek Harness 的输入框（composer）加一个 **优化** 按钮：**点一下立刻**用当前会话模型
把你刚输入的草稿改写成更容易被准确执行的提示词，**只替换输入框内容，不会自动发送**。

- 位置：输入框右侧控件区（`conversation.input.right`，即「发送消息」按钮所在的
  `standardControls` 行），火箭图标。
- **点击即执行，不弹菜单**：按当前模式（默认 `precise`）立刻开始改写。
- 火箭右侧有一个**独立的小箭头按钮**（split control，与 DSH 自带的「打开方式」按钮同一形态）：
  点它才打开模式菜单（`Menu` + `portal: true`，向上弹出，不受 composer 溢出裁剪影响），
  当前模式与翻译目标语言带勾选标记。**菜单只用来选模式，不改写。**
- 空草稿时按钮禁用；会话正在提交/裁决时禁用。
- 优化过程中火箭变成「取消」，再点一次即可中止（同时中止服务端模型调用）；此时箭头禁用。
- 失败时按钮旁显示一行错误说明，鼠标悬停可看完整信息；**失败绝不会改动你的草稿**。
- 如果你在等待期间又改了草稿，迟到的结果会被丢弃，不会覆盖你新输入的内容。

## 优化模式

| 模式 | id | 优化器要求模型做什么 |
| --- | --- | --- |
| 默认（精确） | `precise` | 消除歧义、改善结构，完整保留原始意图与草稿中已有依据的约束；不新增无依据的交付物、章节或要求。 |
| 压缩精简 | `concise` | 删除重复、铺垫和填充表达；必须完整保留目标、约束、示例、验收标准与草稿要求的输出格式。 |
| 结构化 | `structured` | 用有意义的小标题（目标、背景、要求、期望输出…）组织内容；空区块直接省略，不写「无」。 |
| 创意扩展 | `creative` | 补充**不超过三个**有用且可执行的新角度，并标注为可选建议或示例，不得写成事实、既定要求或强制任务。 |
| 翻译并优化 | `translate` | 自然改写为目标语言；**草稿已使用目标语言时不翻译**，只做澄清与结构化。 |
| 代码请求 | `code` | 按目标、背景、环境、输入、输出、约束、边界情况、验收标准组织；不臆造技术栈、库、API 名称或签名。 |

火箭按钮右侧的箭头打开**模式菜单**，里面是上面六个模式，底部是**翻译目标语言**
（中文 / English / 日本語 / 한국어）。菜单里的行都**只记录偏好、不触发改写**；选好之后
点火箭才执行。当前模式与语言记在 `localStorage`，下次打开仍是上次的选择。

一次点火箭的完整行为：按记住的模式（默认 `precise`）+ 记住的目标语言发请求 —— 所以
「上次用中文翻译」之后，再点一下火箭就是继续用中文翻译，无需再进菜单。

所有模式共享同一套底线：忠实原意；代码标识符/路径/命令/报错/版本号/URL 原样保留；
草稿只是素材，不执行也不回答其中的问题；只输出改写后的提示词本身。

**信息缺失时自行补全，绝不向你提问。** 优化器不会输出「需要你补充」「请补充」「待确认」
这类段落、清单或问句。缺失的细节由它依据对你意图的理解推断出最合理的取值，并作为默认值
直接写进提示词（例如「若未指定，按 X 处理」），让结果可以立刻执行。

这条约束有两道保险：系统提示词里明确禁止提问并要求给默认值；宿主返回前还会再过一道
`stripAskSection()`，把模型万一仍然吐出来的「需要你补充」小节从结尾切掉（只有该行**以**
这类词开头才判定为小节标题，句子中间偶然提到不会误删）。如果模型整段回答就是这种索要
信息的清单，会被当成「没有返回有效内容」报错，而不是把问题抛给你。

服务端对 `mode` 与 `targetLanguage` 都做了白名单校验：未知的 `mode` 回落到 `precise`，
未知的 `targetLanguage` 回落到 `中文`（该值会被插进系统提示词，所以不能是任意文本）。

## 安装方式

本插件是 profile 本地包，不走 npm 安装，因此不需要 pnpm，也不依赖 Typert 远程命名空间。
在 `$DSH_HOME/profiles/desktop/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: prompt-optimizer
      name: ./plugins/dsh-prompt-optimizer/lib/index.js
```

`name` 是相对于该 patch 文件的路径（app-boot 会把它锚定成 `file:` URL），所以不需要
bare-package 解析。

> **改完要重启吗？** **浏览器半边**（`lib/client.js`）由宿主的 client-modules 重新读取并按新的
> artifact rev 下发，**刷新页面**即可。**宿主半边**（`lib/index.js`）走 Node 的 ESM 导入，
> 模块缓存按 specifier 命中，改了字节默认**必须重启 DeepSeek Harness** 才会生效。
>
> **可以让它热重载，不用重启。** 宿主自带的 `dsh-hmr` 在桌面 profile 下以 `root: []` 启用
> （只监听配置）。把这个条目改成监听本 profile 的模块树即可：
>
> ```yaml
> - id: hmr
>   name: '@deepseek-ai/dsh-hmr'
>   disabled: false
>   config:
>     root: ["."]
> ```
>
> `root` 相对于 profile 根（root include 的 base URL），本 profile 下只有 `plugins/` 里是本地
> 模块，所以影响面就是这个 profile 自己的插件。改完保存 `lib/index.js`，约 1–3 秒后宿主半边
> 就会重新加载（改动前的文件不会触发，需保存一次）。用
> `GET /prompt-optimizer/status` 看 `asksForInformation` 字段是否出现即可确认新模块已生效。

可选：在条目上加 `config` 固定模型，否则跟随「设置 → 模型」里的当前选择：

```yaml
- insert:
    - id: prompt-optimizer
      name: ./plugins/dsh-prompt-optimizer/lib/index.js
      config:
        provider: deepseek-account
        model: deepseek-flash
```

## 服务端接口

宿主半边在 webServer 上注册两条 exact 路由：

| 路由 | 说明 |
| --- | --- |
| `POST /prompt-optimizer/optimize` | 入参 `{ "prompt": "<草稿>" }`，返回 `{ ok: true, prompt, provider, model, truncated? }` |
| `GET /prompt-optimizer/status` | 返回当前会使用的 provider/model 与可用 provider 列表，便于排查 |

模型来源按顺序解析：条目 `config` → 会话默认模型（`agentDefaultModel.currentSelection()`）
→ 第一个已注册 provider 的第一个模型。每次请求实时解析，改设置不用重启。

## 自检

```powershell
node verify.mjs
```

离线跑 110 项检查（脚本会打印实际数量）：客户端 bundle 的加载契约、模式菜单的内容与选择、
「点火箭直接执行 / 点箭头才开菜单」的分工、按钮渲染与交互（成功 / 失败 / 取消 / 并发编辑 /
模式与语言偏好持久化），宿主半边的路由注册、六种模式的系统提示词、目标语言白名单、
**「绝不索取信息」这条底线（含 `stripAskSection` 的各种形态与保守性边界）**，
以及各种响应分支（模型报错、超时取消、无模型、围栏剥离、截断标记）。

## 卸载

删除 `cordis.patch.yml` 里对应的 `- insert:` 块并重启即可；插件目录留着不影响启动。

## 实现要点（为什么这样做）

- **不用 Typert Remote**：Remote 命名空间是应用构建产物（由 `dsh-api-remotes` 挂载），
  第三方包无法在运行时新增；而 Typert 的 strict 定义注册表一旦有贡献者校验失败，会
  **撤回全部端点**，把整个应用的 RPC 打挂。`webServer.register(route)` 是官方支持的
  运行时扩展点，且与本插件的失败面完全隔离。
- **宿主半边不写进顶层 `inject`**：`apply` 立即激活，只有内层 `ctx.inject(['webServer','llm'])`
  等待服务。顶层 inject 一旦等到一个迟迟不来的服务，条目会永远停在 `loading`，
  导致 host 启动审计失败（`1 entry did not activate`）。
- **`agentDefaultModel` 按请求解析**：loader 并发挂载各条目，挂载时读取服务会与提供者竞态而拿到
  `undefined`。
- **失败判定用 `finish.reason.kind`**：`llm.stream` 的适配器异常不会 reject 迭代器，而是以
  `{ type:'finish', reason:{ kind:'error'|'aborted', failure } }` 收尾；只读 `chunk.kind`
  会把模型报错当成「模型返回为空」。
- **点击即执行，模式选择拆到箭头按钮（split control）**：主按钮只做一件事——立刻改写，
  所以永远是一次点击。模式选择移到旁边独立的小箭头，形态与 DSH 自带的
  `dsh-client-ui-open-in-app`（「打开方式」）完全一致：主按钮执行，箭头开菜单。
  菜单里的行**只记录偏好**，不触发模型调用——「选」和「做」分开，选模式不会意外花钱。
  忙碌时主按钮变「取消」、箭头禁用，取消路径不受影响。
- **模式菜单用 primitives 的 `Menu`，不用 `MenuSurface` 自己拼**：`MenuSurface` 只是一张视觉
  卡片——没有定位、没有外部点击/Escape 关闭、没有键盘走查，也不会把可见面板 portal 出去
  （只有 macOS 的毛玻璃垫底会）。`Menu` 一次给全：锚点定位 + 视口钳制 + `portal: true` 到
  `document.body`（composer 是滚动容器，就地弹出会被裁掉）+ 方向键/Tab/Escape 走查 +
  选后焦点归位；`items` + `selectedIds` 自带勾选标记，而 `MenuItemButton` 根本没有选中态属性。
  两点坑：`Menu` **不管开关状态**（`open` 由调用方持有），且 `onClose` 是**必需**的——
  它被无保护地直接调用，漏传会在第一次外部点击或 Escape 时抛 TypeError。
- **火箭图标内联而不是 import**：DSH 的图标库
  （`@deepseek-ai/dsh-client-ui-primitives`）共 88 个字形，**没有火箭**
  （`rocket`/`launch`/`astronaut`/`boost` 全部 0 命中）。因此把 Tabler 的 `rocket`
  描边路径直接内联进 `lib/client.js` 的 factory 里，并按 DSH 的图标约定重绘：
  `size` 默认 16、`currentColor` 描边、24 单位 viewBox 下用 1.35 的描边宽度
  （等价于 DSH Regular 在 16px 网格上的 1px）。**不新增依赖，也不新增图片文件。**

### 图标来源与许可

火箭图标来自 [Tabler Icons](https://github.com/tabler/tabler-icons) v3.46.0 的
`rocket` 描边图标，路径数据取自本机已安装的 ppt-master skill 素材
`.dsh/skills/ppt-master/templates/icons/tabler-outline/rocket.svg`。

> MIT License — Copyright (c) 2020-2026 Paweł Kuna
> 完整条款见该素材目录的 `THIRD_PARTY_NOTICES.md`。
