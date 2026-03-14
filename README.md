# GKD Toolkit

[GKD 订阅项目](https://github.com/gkd-kit/subscription-template) 的 VS Code 扩展。

## 功能

- 打开所有快照

  - 同时查询选择器

## 启用条件

1. 当前工作区安装以下 npm 包

  - `@gkd-kit/api`
  - `@gkd-kit/define`
  - `@gkd-kit/tools`

2. 当前编辑器打开了 `src` 或者 `src/apps` 文件夹下的 `.ts` 文件

3. 当前编辑器文件导入了 `defineGkdApp` 或者 `defineGkdGlobalGroups` 函数
