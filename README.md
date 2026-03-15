# GKD Toolkit

[![vscode marketplace version](https://img.shields.io/vscode-marketplace/v/tianfangyetan.gkd-toolkit.svg?label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=tianfangyetan.gkd-toolkit)

[GKD 订阅项目](https://github.com/gkd-kit/subscription-template) 的 VS Code 辅助开发扩展。

## 功能

- [x] 显示“打开所有快照”按钮
  - [x] 同时查询选择器
- [ ] 覆写文档符号行为

## 使用效果

![打开所有快照同时查询选择器](https://github.com/user-attachments/assets/be7f4ada-1627-44d2-a27c-10ef3f5096fd)

## 启用条件

1. 当前工作区安装以下 npm 包

    - `@gkd-kit/api`
    - `@gkd-kit/define`
    - `@gkd-kit/tools`

2. 当前编辑器打开了 `src` 或者 `src/apps` 文件夹下的 `.ts` 文件

3. 当前编辑器文件导入了 `defineGkdApp` 或者 `defineGkdGlobalGroups` 函数

## 常见问题

### 1. 每次打开快照都会弹窗怎么办？

出于安全考虑，VS Code 在扩展打开外部链接时会弹窗确认。如果你不想看到这个弹窗，可以点击 “配置受信任的域”，然后将 https://i.gkd.li 设置为受信任的域。之后打开此域名的链接都不会弹窗。
