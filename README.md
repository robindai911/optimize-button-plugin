# dsh-prompt-optimizer —— 打包与跨 Harness 安装

## 结论：**支持**，可以直接整包搬到另一台 Harness

不需要构建、不需要 pnpm、不需要联网、不需要发布到任何 registry。它是一个 **profile 本地插件包**：
拷目录 + 在目标 profile 的 `cordis.patch.yml` 里加一条 `insert` 行即可。

**可移植性的实测依据**（不是推断）：

| 检查项 | 结果 |
| --- | --- |
| 包内绝对路径（`C:\Users\…` / `/Users/…`） | **0 处**（代码里没有；只有插件 README 里作为文档提到 `$DSH_HOME`） |
| `DSH_HOME` 假设 | **无** |
| `peerDependencies` | **无**，因此不会撞上 app-boot 的版本兼容门禁（该门禁只对声明 `@deepseek-ai/dsh*` peer 的包生效，不满足会被静默禁用） |
| npm 依赖 / 构建步骤 | **无**。浏览器半边只 `require` 平台自带的 3 个模块 |
| 路径如何定位 | `cordis.patch.yml` 里写的是 `./plugins/dsh-prompt-optimizer/lib/index.js`，**相对 patch 文件**；app-boot 的 `anchorInsertedPluginNames` 会把它重写成 `file:` URL。目标机的 profile 放哪都行 |

---

## 这个包里有什么

```
dsh-prompt-optimizer-dist\
├── README.md            ← 本文件
├── install.ps1          ← 幂等安装脚本
└── dsh-prompt-optimizer\    ← 插件本体，整个目录就是产物
    ├── package.json         (manifest: exports + dsh.client.platform=web)
    ├── README.md            (功能与模式说明)
    ├── verify.mjs           (110 项离线自检，可在目标机跑)
    └── lib\
        ├── index.js         (宿主半边：两条 HTTP 路由 + 六模式提示词)
        └── client.js        (浏览器半边：手写 bundle，按钮 + 模式菜单)
```

---

## 前置条件

- 目标机装有 **DeepSeek Harness 桌面版**。源机版本：**0.1.7-rc.2 (win32-x64)**。
- 知道目标机的 **profile 目录**：
  默认 `%USERPROFILE%\.dsh\profiles\desktop`；若设了 `DSH_HOME`，则是 `%DSH_HOME%\profiles\desktop`。
- 目标机能正常调用模型（插件不自带凭据，用的是目标机自己的账号 / 模型设置）。

---

## 安装

### 方式 A：用脚本（推荐）

```powershell
# 在解压出来的目录里
cd <解压目录>
.\install.ps1
```

指定非默认 profile：

```powershell
.\install.ps1 -Profile 'D:\dsh\.dsh\profiles\desktop'
```

脚本做的事：校验目标像不像 profile 目录 → 把插件拷进 `<profile>\plugins\` →
**备份** `cordis.patch.yml` → 追加 loader 行（**幂等**，重复跑不会加第二条）→ 打印后续步骤。

### 方式 B：手动（等价，两条命令）

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"     # 或你的 DSH_HOME\profiles\desktop

# 1. 放入插件目录
New-Item -ItemType Directory -Force "$profile\plugins" | Out-Null
Copy-Item .\dsh-prompt-optimizer "$profile\plugins\dsh-prompt-optimizer" -Recurse -Force

# 2. 在 cordis.patch.yml 末尾追加（文件本身是一个顶层 YAML 数组）
Add-Content "$profile\cordis.patch.yml" -Encoding UTF8 -Value @'

- insert:
    - id: prompt-optimizer
      name: ./plugins/dsh-prompt-optimizer/lib/index.js
'@
```

> ⚠️ 两条注意：`cordis.patch.yml` 必须是**非空的顶层数组**（只有注释或空文件会导致启动失败，
> 空的话写 `[]`）；`name` 里**不要**写成绝对路径，相对路径才会被正确锚定。

### 然后：重启 Harness（或开启模块热重载省掉这步）

宿主半边（`lib/index.js`）是 Node 的 ESM 导入，模块缓存按 specifier 命中：
**新增或修改宿主字节后默认必须重启进程**。浏览器半边会在刷新页面后自动重新下发。

想避免重启，可让宿主自带的 `dsh-hmr` 监听本 profile 的模块树（它默认 `root: []`，只监听配置）：

```yaml
# 追加到同一个 cordis.patch.yml
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  disabled: false
  config:
    root: ["."]
```

改完保存 `lib/index.js`，约 1–3 秒后宿主半边会重新加载（保存动作才会触发）。验证方式见下。

---

## 验证

```powershell
# 1. 宿主半边起来了？（端口按你实际的改）
Invoke-RestMethod http://127.0.0.1:19387/prompt-optimizer/status
```

健康返回应包含 `hasModel`、六个 `modes`、`targetLanguages`，以及 **`asksForInformation: false`**。
若 `modes` 缺失 → 宿主还没重启；若 `asksForInformation` 缺失 → 跑的是 v0.4.0 之前的宿主。

```powershell
# 2. 浏览器半边进启动图了吗？（rev 由文件 mtime/ctime/size 派生，不必手算：
#    页面刷新后插件会自动加载；这里只做粗查）
Invoke-WebRequest "http://127.0.0.1:19387/plugins/??dsh-prompt-optimizer/client.js&rev=<rev>" -UseBasicParsing
```

3. **刷新 GUI 页面** —— 输入框右侧应出现：`[ 🚀 优化 ] [ ⌄ ]`。
   点火箭＝立刻改写（不弹菜单）；点 ⌄＝选模式（只记录，不触发）。

4.（可选）在目标机上跑插件自带自检：

```powershell
node verify.mjs      # 期望 ALL CHECKS PASSED（110 项，0 失败）
```

---

## 卸载

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
Remove-Item "$profile\plugins\dsh-prompt-optimizer" -Recurse -Force
# 再从 $profile\cordis.patch.yml 里删掉 prompt-optimizer 的那个 - insert: 块
```

然后重启。

> ⚠️ **必须同时删两样。** 只删 `lib/client.js` 却留着 patch 行，会让 DSH 在启动时抛
> `ClientPackageCompositionError` —— `modules` 是必需启动项，**整个应用会起不来**。

---

## 跨版本耦合（唯一真实的限制）

产物是「同版本 / 兼容版本可用」，不是「任意版本都能用」。它依赖下面这些 DSH 契约：

| 契约 | 插件用到的部分 | 不满足时的现象 |
| --- | --- | --- |
| 客户端平台 seed 表 | `react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` | bundle 物化时抛错，该插件行在浏览器里加载失败 |
| primitives 组件 | `Button`、`Menu`、`IconChevronDownOutlineRegular` | 同上（`Menu` 的 props 变了也会坏） |
| 插槽 | `conversation.input.right`（`kind:list, scope:session`），标准 props `useInput`、`inputActions.setDraft` | 插槽不存在 → `slots.inject` 永不触发 → **按钮静默消失**（不崩） |
| 宿主服务 | `webServer.register({kind:'exact',path,handler})`、`llm`（`stream`/`listProviders`/`listModels`）、可选 `agentDefaultModel.currentSelection()` | 服务缺失 → 路由不注册 → 按钮报 500 |
| LLM 分片协议 | `{type:'text-delta',text}`、`{type:'finish',reason:{kind}}` | 取不到文本 → 报「模型没有返回内容」 |

**失败面是隔离的**：除了上面那条「删了 client.js 会拖垮启动」之外，任何一条不满足都只影响
这个插件自己，不会带崩整个 Harness。

### 想让它变成「设置 → 插件」里可安装的组合包？

当前这是**普通包**（只声明了 `dsh.client`），所以 `dsh plugin install` / 插件页的
`installBundle` 会报 `not-a-bundle`。要变成组合包，加两样即可（本产物**没有**包含，
因为对本地路径安装来说它只会增加步骤，并且与现有的手写 patch 行**同时存在会产生重复 id**）：

```jsonc
// package.json 里追加
"dsh": {
  "client": { "platform": "web" },
  "bundle": { "patch": ["./cordis.patch.yml"] }
}
```

```yaml
# 新增 dsh-prompt-optimizer/cordis.patch.yml（与插件同目录）
- insert:
    - id: prompt-optimizer
      name: ./lib/index.js
```

改完之后，先删掉目标 profile 里手写的那条 insert 行（避免同 id 冲突），再重启。
