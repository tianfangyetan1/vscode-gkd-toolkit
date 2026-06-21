# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 VS Code 扩展，为 [GKD 订阅项目](https://github.com/gkd-kit/subscription-template) 提供辅助开发功能：在规则文件上显示「全部打开（并查询）快照」按钮、覆写文档大纲（groups → rules 两层结构）、复制当前规则组（单组导入）、实验性的「折叠所有规则」。

代码与用户提示均使用简体中文。

## 常用命令

- `pnpm run compile` — webpack 打包到 `dist/extension.js`（开发用，mode=none 保留源码）
- `pnpm run watch` — 监听模式编译
- `pnpm run package` — 生产打包（mode=production）
- `pnpm run lint` — 对 `src` 运行 ESLint
- `pnpm run build` — `vsce package` 生成 `.vsix`
- `pnpm test` — 运行测试（会先 `pretest`：compile-tests → compile → lint）
- 调试：在 VS Code 中按 F5 启动扩展开发宿主

测试运行机制：`pretest` 用 `tsc` 将 `src` 编译到 `out/`，`.vscode-test.mjs` 再运行 `out/test/**/*.test.js`（基于 `@vscode/test-cli` + Electron）。单独跑测试前必须先 `pnpm run compile-tests`，否则 `out/` 是旧的。包管理器是 pnpm。

## 架构要点

**激活与门控（`src/extension.ts`）**
扩展在 `onLanguage:typescript` 时激活，但所有功能都经过三重门控，缺一即不生效：
1. 工作区某个 folder 的 `node_modules` 同时装有 `@gkd-kit/api`、`@gkd-kit/define`、`@gkd-kit/tools`（`findWorkspaceWithRequiredPackages`）
2. 文件是工作区 `src/` 目录下的 `.ts`（`isTargetDocument`）
3. 文件 import 了 `defineGkdApp` 或 `defineGkdGlobalGroups`（`hasTargetDefineImport`，能处理 `type`/`as` 别名）

**TypeScript 模块的动态加载（关键陷阱）**
扩展不打包 `typescript`。激活时用 `__non_webpack_require__` 从**工作区的** `node_modules/typescript` 加载 TS 模块，并通过 `setTypeScriptModule()`（`src/parser/utils.ts`）注入到一个模块级单例。所有 parser 通过 `getTs()` 取用这个实例。
因此：**任何调用 parser 的代码（包括测试）必须先调用 `setTypeScriptModule()`**，否则 `getTs()` 返回 undefined。测试在 `suiteSetup` 中注入本仓库自带的 `typescript`。

**Parser 层（`src/parser/`）**
每个 parser 都用 `ts.createSourceFile` 把源码解析成 AST，再遍历提取信息，纯函数、不依赖 VS Code API：
- `snapshotUrls.ts` — 找 `snapshotUrls` 属性，提取合法 http(s) URL 及同对象内的 `rules`/`matches` 选择器
- `documentSymbols.ts` — 从 `export default defineGkdXxx({ groups: [...] })` 提取两层大纲；`hideSingleRule` 时单规则组不展开
- `rulesRanges.ts` — 找每个 group 的 `rules` 数组范围，供折叠用
- `copyGroup.ts` — 仅 `defineGkdApp`，按光标偏移量定位所在 group，重组成只含该组的参数对象文本（保留原始格式）
- `utils.ts` — TS 单例 + AST 取值辅助（`getPropertyName`/`getStringProperty`/`getPropertyValue`/`extractStringValues`）

**URL 层（`src/url/gkdQuery.ts`）**
选择器编码为 base64（`+`→`-`、去掉 `=`），写入 URL 的 `gkd` 查询参数。

**测试导出约定**
`extension.ts` 末尾导出 `__test__` 对象，把内部函数和各 parser 聚合给测试用。新增需要被测试的内部函数时，加进 `__test__`。

**命令与 Provider 注册**
四个命令 ID 和对应的 CodeLens/DocumentSymbol Provider 都在 `activate()` 内注册。「折叠所有规则」相关逻辑仅在配置 `gkd-toolkit.collapseAllRules.show` 开启时才注册（含 open/close 文档监听，使折叠不持久化）。命令、配置项声明在 `package.json` 的 `contributes` 中——新增命令需同时改 `package.json` 与 `extension.ts`。
