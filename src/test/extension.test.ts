import * as assert from 'assert';
import * as vscode from 'vscode';
import { __test__ } from '../extension';

suite('GKD Toolkit Test Suite', () => {
	test('VS Code API is available', () => {
		assert.ok(vscode.workspace);
	});

	test('Workspace folders access does not throw', () => {
		assert.doesNotThrow(() => {
			void vscode.workspace.workspaceFolders;
		});
	});

	suite('hasTargetDefineImport', () => {
		test('识别 defineGkdApp 导入', () => {
			const source = `import { defineGkdApp } from '@gkd-kit/define';`;
			assert.strictEqual(__test__.hasTargetDefineImport(source), true);
		});

		test('识别 type 与 alias 混合导入', () => {
			const source = `import { type Foo, defineGkdGlobalGroups as dgg } from "@gkd-kit/define";`;
			assert.strictEqual(__test__.hasTargetDefineImport(source), true);
		});

		test('非目标导入返回 false', () => {
			const source = `import { defineRule } from '@gkd-kit/define';`;
			assert.strictEqual(__test__.hasTargetDefineImport(source), false);
		});
	});

	suite('skipWhitespace', () => {
		test('跳过空格、换行与制表符', () => {
			const text = ' \n\tabc';
			assert.strictEqual(__test__.skipWhitespace(text, 0), 3);
		});
	});

	suite('readQuotedString', () => {
		test('解析包含转义字符的字符串', () => {
			const text = `'a\\'b\\\\c'`;
			const result = __test__.readQuotedString(text, 0);
			assert.deepStrictEqual(result, { value: "a'b\\c", nextIndex: text.length });
		});

		test('未闭合字符串返回 null', () => {
			assert.strictEqual(__test__.readQuotedString(`'abc`, 0), null);
		});
	});

	suite('readArrayLiteral', () => {
		test('支持注释与字符串内容并定位到右中括号', () => {
			const text = `[
				'https://a.com', // comment with ]
				"https://b.com", /* block ] comment */
				'not ] end'
			] next`;
			const result = __test__.readArrayLiteral(text, 0);
			assert.ok(result);
			assert.strictEqual(result?.value.trim().startsWith('['), true);
			assert.strictEqual(result?.nextIndex, text.indexOf('] next') + 1);
		});

		test('数组未闭合返回 null', () => {
			assert.strictEqual(__test__.readArrayLiteral(`['a'`, 0), null);
		});
	});

	suite('extractStringLiterals', () => {
		test('提取字符串并忽略注释中的引号', () => {
			const input = `[
				"https://a.com",
				// "https://ignored.com"
				'https://b.com',
				/* 'https://ignored2.com' */
				'  https://c.com  '
			]`;
			assert.deepStrictEqual(__test__.extractStringLiterals(input), [
				'https://a.com',
				'https://b.com',
				'https://c.com',
			]);
		});
	});

	suite('parseSnapshotUrlsValue', () => {
		test('支持字符串字面量', () => {
			const source = `'https://i.gkd.li/i/1', next`;
			const result = __test__.parseSnapshotUrlsValue(source, 0);
			assert.deepStrictEqual(result, {
				urls: ['https://i.gkd.li/i/1'],
				nextIndex: source.indexOf(','),
			});
		});

		test('支持数组字面量', () => {
			const source = `[
				'https://i.gkd.li/i/1',
				'https://i.gkd.li/i/2',
			], next`;
			const result = __test__.parseSnapshotUrlsValue(source, 0);
			assert.deepStrictEqual(result?.urls, ['https://i.gkd.li/i/1', 'https://i.gkd.li/i/2']);
			assert.strictEqual(result?.nextIndex, source.indexOf('],') + 1);
		});

		test('非字符串/数组起始字符返回 null', () => {
			assert.strictEqual(__test__.parseSnapshotUrlsValue(`{ a: 1 }`, 0), null);
		});
	});

	suite('findSnapshotUrlsEntries', () => {
		test('解析复杂示例中的所有 snapshotUrls', () => {
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
			assert.deepStrictEqual(entries.map((entry) => entry.urls.length), [3, 1, 1, 6, 1]);
			assert.ok(entries.every((entry) => entry.urls.every((url) => url.startsWith('https://'))));
		});

		test('过滤非 http(s) 链接', () => {
			const source = `
				snapshotUrls: [
					'https://ok.com',
					'http://ok2.com',
					'ftp://bad.com',
					'not-a-url',
				],
			`;
			const entries = __test__.findSnapshotUrlsEntries(source);
			assert.deepStrictEqual(entries[0]?.urls, ['https://ok.com', 'http://ok2.com']);
		});
	});

	suite('isValidHttpUrl', () => {
		test('仅 http/https 返回 true', () => {
			assert.strictEqual(__test__.isValidHttpUrl('https://a.com'), true);
			assert.strictEqual(__test__.isValidHttpUrl('http://a.com'), true);
			assert.strictEqual(__test__.isValidHttpUrl('ftp://a.com'), false);
			assert.strictEqual(__test__.isValidHttpUrl('not-url'), false);
		});
	});
});
