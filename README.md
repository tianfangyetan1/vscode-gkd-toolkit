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

- `/append?app=<包名>&payload=<RawAppBase64>` —— 把规则组追加进该文件，文件不存在则自动新建。

  其中 `payload` 是新增规则组 **app 层**（`defineGkdApp(...)` 中的参数）的 Base64 url 文本，规则如下：

    - `+` 替换成 `-`
    - `/` 替换成 `_`
    - 移除 `=`

> [!IMPORTANT]
>
> 如果打开了 **多个 VS Code 窗口**，请确保最后一切换到 VS Code 的窗口是 GKD 订阅项目所在的窗口。
> 
> 如果打开了 **包含多个项目的工作区，并且存在至少两个 GKD 订阅项目**，扩展会询问使用哪个 GKD 订阅项目。

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
