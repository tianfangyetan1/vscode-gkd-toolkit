---
name: gkd-define-api
description: "@gkd-kit/define API 参考，包含 defineGkdApp 和 defineGkdGlobalGroups 的完整类型定义和用法，用于编写 GKD 规则时查看"
user-invocable: true
---

# @gkd-kit/define API 参考

## 概述

`@gkd-kit/define` 提供两个核心函数，用于定义 GKD 规则：

- **`defineGkdApp(app: RawApp)`** — 定义单个应用的规则
- **`defineGkdGlobalGroups(groups: RawGlobalGroup[])`** — 定义全局规则组

两者均为恒等函数（identity function），仅提供类型校验，不做运行时转换。

---

## 通用类型

### IArray\<T\>

```typescript
type IArray<T> = T | T[];
```

单值或数组均可。例如 `matches: '[text="跳过"]'` 等价于 `matches: ['[text="跳过"]']`。

### Integer

非负整数。

### Position

自定义点击坐标，支持数学表达式（可引用 `width`、`height` 变量）：

```typescript
interface Position {
  left?: string | number;   // 如 'width/2'
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
}
```

### IntegerMatcher

整数匹配器，优先级：exclude > include > minimum/maximum：

```typescript
interface IntegerMatcher {
  exclude?: IArray<Integer>;
  include?: IArray<Integer>;
  minimum?: Integer;
  maximum?: Integer;
}
```

### StringMatcher

字符串匹配器，优先级：exclude > include > pattern：

```typescript
interface StringMatcher {
  exclude?: IArray<string>;
  include?: IArray<string>;
  pattern?: string; // 正则表达式
}
```

---

## defineGkdApp — 应用规则

### RawApp

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 应用包名，如 `'com.tencent.mm'` |
| `name` | `string` | 否 | 应用显示名称（未安装时展示） |
| `groups` | `RawAppGroup[]` | 是 | 规则组列表 |

### RawAppGroup

继承 `RawGroupProps` 和 `RawAppRuleProps`。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | `Integer` | — | 唯一标识符 |
| `name` | `string` | — | 规则组名称 |
| `desc` | `string` | — | 描述 |
| `enable` | `boolean` | `true` | 是否默认启用 |
| `order` | `number` | `0` | 匹配优先级（数值越小越先匹配） |
| `rules` | `IArray<string \| RawAppRule>` | — | 规则列表（字符串即选择器简写） |
| `activityIds` | `IArray<string>` | — | 目标 Activity ID |
| `excludeActivityIds` | `IArray<string>` | — | 排除的 Activity ID（优先级更高） |
| `actionCd` | `Integer` | `1000` | 动作冷却时间（毫秒） |
| `actionDelay` | `Integer` | — | 动作执行前延迟 |
| `matchDelay` | `Integer` | — | 规则开始查询前延迟 |
| `matchTime` | `Integer` | — | 规则保持活跃的持续时间 |
| `actionMaximum` | `Integer` | — | 最大执行次数（达到后休眠） |
| `matchRoot` | `boolean` | `false` | 是否从根节点匹配 |
| `fastQuery` | `boolean` | `false` | 快速查询优化 |
| `snapshotUrls` | `IArray<string>` | — | 快照链接（包含界面截图及所有无障碍节点信息） |
| `exampleUrls` | `IArray<string>` | — | 示例链接（GIF/图片） |

### RawAppRule

继承 `RawRuleProps` 和 `RawAppRuleProps`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `Integer` | 规则唯一标识 |
| `name` | `string` | 规则名称 |
| `matches` | `IArray<string>` | 必须全部匹配的选择器 |
| `anyMatches` | `IArray<string>` | 至少一个匹配的选择器 |
| `excludeMatches` | `IArray<string>` | 任一匹配则跳过 |
| `excludeAllMatches` | `IArray<string>` | 全部匹配则跳过 |
| `action` | `string` | 动作类型（见下方） |
| `position` | `Position` | 自定义点击坐标 |
| `activityIds` | `IArray<string>` | 目标 Activity |
| `excludeActivityIds` | `IArray<string>` | 排除 Activity |
| `versionCode` | `IntegerMatcher` | 版本号匹配 |
| `versionName` | `StringMatcher` | 版本名匹配 |
| `order` | `number` | 规则优先级 |
| `actionCd` | `Integer` | 冷却时间（默认 1000ms） |
| `actionDelay` | `Integer` | 执行延迟 |
| `matchDelay` | `Integer` | 查询延迟 |
| `matchTime` | `Integer` | 活跃持续时间 |
| `actionMaximum` | `Integer` | 最大执行次数 |
| `matchRoot` | `boolean` | 从根节点匹配 |
| `fastQuery` | `boolean` | 快速查询优化 |
| `snapshotUrls` | `IArray<string>` | 快照链接 |
| `exampleUrls` | `IArray<string>` | 示例链接 |

#### action 可选值

| 值 | 说明 |
|---|------|
| `'click'` | 点击节点（默认，自动选择使用无障碍点击还是模拟点击） |
| `'longClick'` | 长按节点（自动使用无障碍长按还是模拟长按） |
| `'back'` | 模拟返回键 |
| `'clickCenter'` | 模拟位置点击节点中心 |
| `'longClickCenter'` | 模拟位置长按节点中心 |
| `'clickNode'` | 使用无障碍点击节点 |
| `'longClickNode'` | 使用无障碍点击长按节点 |
| `'none'` | 不执行动作 |

---

## defineGkdGlobalGroups — 全局规则

### RawGlobalGroup

继承 `RawGroupProps` 和 `RawGlobalRuleProps`。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | `Integer` | — | 唯一标识符 |
| `name` | `string` | — | 规则组名称 |
| `desc` | `string` | — | 描述 |
| `enable` | `boolean` | `true` | 是否默认启用 |
| `order` | `number` | `0` | 匹配优先级 |
| `rules` | `RawGlobalRule[]` | — | 全局规则列表 |
| `apps` | `RawGlobalApp[]` | — | 按应用自定义配置 |
| `matchAnyApp` | `boolean` | `true` | 是否匹配任意应用 |
| `matchLauncher` | `boolean` | `false` | 是否匹配桌面启动器 |
| `matchSystemApp` | `boolean` | `false` | 是否匹配系统应用 |
| `actionCd` | `Integer` | `1000` | 冷却时间 |
| `actionDelay` | `Integer` | — | 执行延迟 |
| `matchRoot` | `boolean` | `false` | 从根节点匹配 |
| `fastQuery` | `boolean` | `false` | 快速查询优化 |
| `snapshotUrls` | `IArray<string>` | — | 快照链接 |
| `exampleUrls` | `IArray<string>` | — | 示例链接 |

### RawGlobalRule

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `Integer` | 规则唯一标识 |
| `name` | `string` | 规则名称 |
| `matches` | `IArray<string>` | 必须全部匹配的选择器 |
| `anyMatches` | `IArray<string>` | 至少一个匹配的选择器 |
| `excludeMatches` | `IArray<string>` | 任一匹配则跳过 |
| `excludeAllMatches` | `IArray<string>` | 全部匹配则跳过 |
| `action` | `string` | 动作类型 |
| `position` | `Position` | 自定义点击坐标 |
| `matchAnyApp` | `boolean` | 匹配任意应用 |
| `matchLauncher` | `boolean` | 匹配桌面启动器 |
| `matchSystemApp` | `boolean` | 匹配系统应用 |
| `apps` | `RawGlobalApp[]` | 按应用自定义 |
| `actionCd` | `Integer` | 冷却时间 |
| `actionDelay` | `Integer` | 执行延迟 |
| `matchDelay` | `Integer` | 查询延迟 |
| `matchTime` | `Integer` | 活跃持续时间 |
| `actionMaximum` | `Integer` | 最大执行次数 |
| `matchRoot` | `boolean` | 从根节点匹配 |
| `fastQuery` | `boolean` | 快速查询优化 |
| `snapshotUrls` | `IArray<string>` | 快照链接 |
| `exampleUrls` | `IArray<string>` | 示例链接 |

### RawGlobalApp

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 应用包名 |
| `enable` | `boolean` | 是否启用（默认 true） |
| `activityIds` | `IArray<string>` | 目标 Activity |
| `excludeActivityIds` | `IArray<string>` | 排除 Activity |
| `versionCode` | `IntegerMatcher` | 版本号匹配 |
| `versionName` | `StringMatcher` | 版本名匹配 |

---

## 代码示例

### 应用规则示例

```typescript
import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'cn.wps.moffice_eng',
  name: 'WPS Office',
  groups: [
    {
      key: 1,
      name: '开屏广告',
      matchTime: 10000,
      actionMaximum: 1,
      resetMatch: 'app',
      rules: [
        {
          fastQuery: true,
          matches: '[text*="跳过"][text.length<10]',
          snapshotUrls: 'https://i.gkd.li/i/12505365',
        },
      ],
    },
    {
      key: 2,
      name: '弹窗广告',
      activityIds: 'cn.wps.moffice.main.StartPublicActivity',
      rules: [
        {
          matches: '[id="cn.wps.moffice_eng:id/close_btn"]',
          snapshotUrls: 'https://i.gkd.li/i/12505350',
        },
      ],
    },
  ],
});
```

### 全局规则示例

```typescript
import { defineGkdGlobalGroups } from '@gkd-kit/define';

export default defineGkdGlobalGroups([
  {
    key: 1,
    name: '开屏广告',
    matchTime: 10000,
    actionMaximum: 1,
    rules: [
      {
        fastQuery: true,
        matches: '[text*="跳过"][text.length<10]',
      },
    ],
  },
]);
```

---

## RawSubscription — 订阅配置（顶层）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `Integer` | 是 | 订阅 ID |
| `name` | `string` | 是 | 订阅名称 |
| `version` | `Integer` | 是 | 版本号 |
| `author` | `string` | 否 | 作者 |
| `updateUrl` | `string` | 否 | 更新地址 |
| `checkUpdateUrl` | `string` | 否 | 轻量更新检查地址 |
| `supportUri` | `string` | 否 | 反馈地址 |
| `apps` | `RawApp[]` | 否 | 应用规则列表 |
| `globalGroups` | `RawGlobalGroup[]` | 否 | 全局规则组列表 |
| `categories` | `RawCategory[]` | 否 | 规则分类 |

### RawCategory

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `Integer` | 唯一标识 |
| `name` | `string` | 分类名称（匹配以此开头的应用规则组名称） |
| `enable` | `boolean` | 覆盖捕获的规则组启用状态 |
