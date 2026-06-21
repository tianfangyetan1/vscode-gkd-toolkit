# GKD Toolkit

[![GitHub Release](https://img.shields.io/github/v/release/tianfangyetan1/vscode-gkd-toolkit)](https://github.com/tianfangyetan1/vscode-gkd-toolkit/releases/latest)
[![marketplace vscode](https://img.shields.io/badge/marketplace-vscode-23a8f2)](https://marketplace.visualstudio.com/items?itemName=tianfangyetan.gkd-toolkit)

[GKD 订阅项目](https://github.com/gkd-kit/subscription-template) 的 VS Code 辅助开发扩展。

## 功能

- [x] 显示“打开所有快照”按钮
  - [x] 同时查询选择器
- [x] 覆写文档符号行为（大纲）
- [x] 复制当前规则组（单组导入）
- [x] 注册 `vscode://` 协议，支持与浏览器联动
  - [x] 打开规则文件
  - [x] 追加规则

## VS Code 协议

扩展注册了 URI 协议 `vscode://tianfangyetan.gkd-toolkit/`，浏览器可借此打开或追加本地订阅项目的规则文件。

- `/open?app=<包名>` —— 打开规则文件 `src/apps/<包名>.ts`，不存在则报错。
- `/append?app=<包名>&groups=<RawAppBase64>` —— 把规则组追加进该文件，文件不存在则自动新建。
  
  `groups` 是新增规则组 **app 层**（`defineGkdApp(...)` 中的参数）base64 的安全文本（`+` 替换成 `-`，移除 `=`）。

> [!IMPORTANT]
> 仅在上一次打开（切换窗口）的工作区是 GKD 订阅项目时才会响应。

## 使用效果

![打开所有快照同时查询选择器](https://github.com/user-attachments/assets/be7f4ada-1627-44d2-a27c-10ef3f5096fd)

## 启用条件

1. 当前工作区项目安装了以下 npm 包

    - `@gkd-kit/api`
    - `@gkd-kit/define`
    - `@gkd-kit/tools`

2. 当前编辑器打开了 `src` 文件夹下的 `.ts` 文件

3. 当前编辑器文件导入了 `defineGkdApp` 或者 `defineGkdGlobalGroups` 函数

## 常见问题

### 1. 每次打开快照都会弹窗怎么办？

出于安全考虑，VS Code 在扩展打开外部链接时会弹窗确认。如果你不想看到这个弹窗，可以点击 “配置受信任的域”，然后将 https://i.gkd.li 设置为受信任的域。之后打开此域名的链接都不会弹窗。
