import * as assert from "assert";
import * as vscode from "vscode";
import * as ts from "typescript";
import { __test__ } from "../extension";
import { setTypeScriptModule } from "../parser/utils";

suite("GKD Toolkit Test Suite", () => {
  suiteSetup(() => {
    setTypeScriptModule(ts);
  });
  test("VS Code API is available", () => {
    assert.ok(vscode.workspace);
  });

  test("Workspace folders access does not throw", () => {
    assert.doesNotThrow(() => {
      void vscode.workspace.workspaceFolders;
    });
  });

  suite("hasTargetDefineImport", () => {
    test("识别 defineGkdApp 导入", () => {
      const source = `import { defineGkdApp } from '@gkd-kit/define';`;
      assert.strictEqual(__test__.hasTargetDefineImport(source), true);
    });

    test("识别 type 与 alias 混合导入", () => {
      const source = `import { type Foo, defineGkdGlobalGroups as dgg } from "@gkd-kit/define";`;
      assert.strictEqual(__test__.hasTargetDefineImport(source), true);
    });

    test("非目标导入返回 false", () => {
      const source = `import { defineRule } from '@gkd-kit/define';`;
      assert.strictEqual(__test__.hasTargetDefineImport(source), false);
    });
  });

  suite("findSnapshotUrlsEntries", () => {
    test("解析复杂示例中的所有 snapshotUrls", () => {
      const source = `import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.klcxkj.zqxy_kaihe',
  groups: [
    {
      key: 1,
      rules: [
        {
          key: 0,
          snapshotUrls: [
            'https://i.gkd.li/i/12640303',
            'https://i.gkd.li/i/13362269',
            'https://i.gkd.li/i/13362272',
          ],
        },
      ],
    },
    {
      key: 2,
      rules: [
        {
          key: 0,
          snapshotUrls: 'https://i.gkd.li/i/25931841',
        },
        {
          key: 1,
          snapshotUrls: 'https://i.gkd.li/i/25929002',
        },
        {
          key: 2,
          snapshotUrls: [
            'https://i.gkd.li/i/12781461',
            'https://i.gkd.li/i/13488673', // 这是一段单行注释
            'https://i.gkd.li/i/13546464', /* 这是一段多行注释 */
            'https://i.gkd.li/i/16620586',
            'https://i.gkd.li/i/13071301', // 这是一段含有 {} 、 [] 、 "" 和 '' 的注释
            'https://i.gkd.li/i/13707849',
          ],
        },
        {
          key: 3,
          snapshotUrls: 'https://i.gkd.li/i/25929116',
        },
      ],
    },
  ],
});`;

      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 5);
      assert.deepStrictEqual(
        entries.map((entry) => entry.urls.length),
        [3, 1, 1, 6, 1],
      );
      assert.ok(
        entries.every((entry) =>
          entry.urls.every((url) => url.startsWith("https://")),
        ),
      );
      assert.ok(entries.every((entry) => entry.selector === undefined));
    });

    test("过滤非 http(s) 链接", () => {
      const source = `
				const rule = {
					snapshotUrls: [
						'https://ok.com',
						'http://ok2.com',
						'ftp://bad.com',
						'not-a-url',
					],
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.deepStrictEqual(entries[0]?.urls, [
        "https://ok.com",
        "http://ok2.com",
      ]);
    });

    test("当同对象 rules 为字符串时提取 selector", () => {
      const source = `
				const rule = {
					key: 1,
					rules: '@TextView > [text="跳过"]',
					snapshotUrls: 'https://i.gkd.li/i/25821346',
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0]?.selector, '@TextView > [text="跳过"]');
    });

    test("当同对象 matches 为字符串时提取 selector", () => {
      const source = `
				const rule = {
					key: 2,
					matches: '@TextView[text="关闭"]',
					snapshotUrls: ['https://i.gkd.li/i/25821346'],
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0]?.selector, '@TextView[text="关闭"]');
    });

    test("rules 非字符串时不提取 selector", () => {
      const source = `
				const rule = {
					rules: [{ matches: '@TextView' }],
					snapshotUrls: 'https://i.gkd.li/i/25821346',
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0]?.selector, undefined);
    });

    test("同对象中存在数组属性时仍可提取 matches", () => {
      const source = `
				const rule = {
					preKeys: [0],
					matches: '@[clickable=true] >3 [text="不感兴趣"]',
					snapshotUrls: 'https://i.gkd.li/i/14428912',
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(
        entries[0]?.selector,
        '@[clickable=true] >3 [text="不感兴趣"]',
      );
    });

    test("同对象中存在对象属性时仍可提取 matches", () => {
      const source = `
				const rule = {
					extra: { enabled: true },
					matches: '@TextView[text="关闭"]',
					snapshotUrls: ['https://i.gkd.li/i/25821346'],
				};
			`;
      const entries = __test__.findSnapshotUrlsEntries(source);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0]?.selector, '@TextView[text="关闭"]');
    });
  });

  suite("isValidHttpUrl", () => {
    test("仅 http/https 返回 true", () => {
      assert.strictEqual(__test__.isValidHttpUrl("https://a.com"), true);
      assert.strictEqual(__test__.isValidHttpUrl("http://a.com"), true);
      assert.strictEqual(__test__.isValidHttpUrl("ftp://a.com"), false);
      assert.strictEqual(__test__.isValidHttpUrl("not-url"), false);
    });
  });

  suite("gkd query helpers", () => {
    function toUrlSafeBase64(selector: string): string {
      return Buffer.from(selector, "utf8")
        .toString("base64")
        .replaceAll("+", "-")
        .replaceAll("=", "");
    }

    test("encodeSelectorToBase64 按 UTF-8 编码", () => {
      const encoded = __test__.encodeSelectorToBase64('@TextView[text="关闭"]');
      assert.strictEqual(
        encoded,
        Buffer.from('@TextView[text="关闭"]', "utf8").toString("base64"),
      );
    });

    test("appendGkdParam 追加 gkd 参数", () => {
      const selector = '@TextView[text="关闭"]';
      const result = __test__.appendGkdParam(
        "https://i.gkd.li/i/25821346",
        selector,
      );
      assert.ok(result);
      const parsed = new URL(result ?? "");
      assert.strictEqual(
        parsed.searchParams.get("gkd"),
        toUrlSafeBase64(selector),
      );
    });

    test("appendGkdParam 可覆盖已有 gkd 并保留其他参数", () => {
      const selector = '@TextView[text="跳过"]';
      const result = __test__.appendGkdParam(
        "https://i.gkd.li/i/25821346?a=1&gkd=old",
        selector,
      );
      assert.ok(result);
      const parsed = new URL(result ?? "");
      assert.strictEqual(parsed.searchParams.get("a"), "1");
      assert.strictEqual(
        parsed.searchParams.get("gkd"),
        toUrlSafeBase64(selector),
      );
    });

    test("appendGkdParam 遇到非法 URL 返回 null", () => {
      assert.strictEqual(
        __test__.appendGkdParam("not-a-url", "@TextView"),
        null,
      );
    });
  });

  suite("findDocumentSymbols", () => {
    test("解析 defineGkdApp 的 3 层大纲", () => {
      const source = `import { defineGkdApp } from '@gkd-kit/define';

export default defineGkdApp({
  id: 'com.example.app',
  groups: [
    {
      key: 1,
      name: '开屏广告',
      rules: [
        { key: 0, name: '跳过按钮', matches: '[text="跳过"]' },
        { key: 1, matches: '[text="关闭"]' },
      ],
    },
    {
      key: 2,
      name: '弹窗广告',
      rules: '@TextView > [text="跳过"]',
    },
  ],
});`;
      const symbols = __test__.findDocumentSymbols(source);
      assert.strictEqual(symbols.length, 1);

      const root = symbols[0];
      assert.strictEqual(root.name, "export default");
      assert.strictEqual(root.children.length, 2);

      const group1 = root.children[0];
      assert.strictEqual(group1.name, "开屏广告");
      assert.strictEqual(group1.children.length, 2);
      assert.strictEqual(group1.children[0].name, "跳过按钮");
      assert.strictEqual(group1.children[1].name, "key=1");

      const group2 = root.children[1];
      assert.strictEqual(group2.name, "弹窗广告");
      assert.strictEqual(group2.children.length, 0);
    });

    test("解析 defineGkdGlobalGroups 格式", () => {
      const source = `import { defineGkdGlobalGroups } from '@gkd-kit/define';

export default defineGkdGlobalGroups({
  groups: [
    {
      key: 1,
      name: '开屏广告',
      rules: [
        { key: 0, name: '通用跳过', fastQuery: true },
      ],
    },
  ],
});`;
      const symbols = __test__.findDocumentSymbols(source);
      assert.strictEqual(symbols.length, 1);
      assert.strictEqual(symbols[0].children.length, 1);
      assert.strictEqual(symbols[0].children[0].name, "开屏广告");
      assert.strictEqual(symbols[0].children[0].children.length, 1);
      assert.strictEqual(symbols[0].children[0].children[0].name, "通用跳过");
    });

    test("无 name 时回退到 key", () => {
      const source = `export default defineGkdApp({
  id: 'com.example',
  groups: [
    {
      key: 3,
      rules: [
        { key: 0 },
        { key: 5 },
      ],
    },
  ],
});`;
      const symbols = __test__.findDocumentSymbols(source);
      const group = symbols[0].children[0];
      assert.strictEqual(group.name, "key=3");
      assert.strictEqual(group.children[0].name, "key=0");
      assert.strictEqual(group.children[1].name, "key=5");
    });

    test("name 为空字符串时回退到 key", () => {
      const source = `export default defineGkdApp({
  id: 'com.example',
  groups: [
    {
      key: 1,
      name: '',
      rules: [{ key: 0, name: '' }],
    },
  ],
});`;
      const symbols = __test__.findDocumentSymbols(source);
      assert.strictEqual(symbols[0].children[0].name, "key=1");
      assert.strictEqual(symbols[0].children[0].children[0].name, "key=0");
    });

    test("既没有 name 也没有 key 时显示未命名", () => {
      const source = `export default defineGkdApp({
  id: 'com.example',
  groups: [
    {
      rules: [{ matches: '[text="跳过"]' }],
    },
  ],
});`;
      const symbols = __test__.findDocumentSymbols(source);
      assert.strictEqual(symbols[0].children[0].name, "[未命名规则组]");
      assert.strictEqual(
        symbols[0].children[0].children[0].name,
        "[未命名规则]",
      );
    });

    test("无 export default 时返回空", () => {
      const source = `const app = defineGkdApp({ id: 'com.example', groups: [] });`;
      const symbols = __test__.findDocumentSymbols(source);
      assert.strictEqual(symbols.length, 0);
    });
  });
});
