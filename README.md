# GKD Toolkit

`GKD Toolkit` 是一个面向 GKD 规则项目的 VS Code 扩展。

## 功能

- 在 `src/` 与 `src/apps/` 下的 `.ts` 文件中，当文件从 `@gkd-kit/define` 导入了 `defineGkdGlobalGroups` 或 `defineGkdApp` 时：
  - 为 `snapshotUrls` 属性提供 `全部打开` CodeLens 按钮。
  - 点击后会在默认浏览器中依次打开该属性中的所有合法 URL。
- 支持两种 `snapshotUrls` 写法：
  - `snapshotUrls: ['https://example.com/a', 'https://example.com/b']`
  - `snapshotUrls: 'https://example.com/a'`

## 启用条件

扩展仅在当前工作区同时安装以下依赖时启用功能：

- `@gkd-kit/api`
- `@gkd-kit/define`
- `@gkd-kit/tools`

若缺少任一依赖，扩展不会注册上述功能。
