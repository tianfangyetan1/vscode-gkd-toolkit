import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const COMMAND_ID = 'gkd-toolkit.openAllSnapshotUrls';
const REQUIRED_PACKAGES = ['@gkd-kit/api', '@gkd-kit/define', '@gkd-kit/tools'];
const TARGET_IMPORTS = new Set(['defineGkdGlobalGroups', 'defineGkdApp']);

type SnapshotUrlsEntry = {
	propertyIndex: number;
	urls: string[];
};


/**
 * 为目标文档中的每个 snapshotUrls 属性生成 CodeLens。
 */
class SnapshotUrlsCodeLensProvider implements vscode.CodeLensProvider {
	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!isTargetDocument(document)) {
			return [];
		}

		const sourceText = document.getText();
		if (!hasTargetDefineImport(sourceText)) {
			return [];
		}

		// 只有存在合法 URL 的 snapshotUrls 才会生成“全部打开”按钮。
		const entries = findSnapshotUrlsEntries(sourceText);
		return entries
			.filter((entry) => entry.urls.length > 0)
			.map((entry) => {
				const position = document.positionAt(entry.propertyIndex);
				const range = new vscode.Range(position.line, 0, position.line, 0);
				return new vscode.CodeLens(range, {
					title: '全部打开',
					command: COMMAND_ID,
					arguments: [entry.urls],
				});
			});
	}
}

/**
 * 扩展激活：校验依赖并注册命令和 CodeLens Provider。
 */
export function activate(context: vscode.ExtensionContext): void {
	if (!hasRequiredPackagesInstalled()) {
		return;
	}

	const disposable = vscode.commands.registerCommand(COMMAND_ID, async (urls: unknown) => {
		const list = Array.isArray(urls) ? urls : [];
		const validUrls = list.filter((url): url is string => typeof url === 'string' && isValidHttpUrl(url));
		await Promise.all(validUrls.map((url) => vscode.env.openExternal(vscode.Uri.parse(url))));
	});

	const provider = vscode.languages.registerCodeLensProvider(
		{ language: 'typescript', scheme: 'file' },
		new SnapshotUrlsCodeLensProvider(),
	);

	context.subscriptions.push(disposable, provider);
}

/**
 * 扩展停用：当前无需额外清理逻辑。
 */
export function deactivate(): void {}

/**
 * 检查任一工作区是否同时安装了三个必需依赖包。
 */
function hasRequiredPackagesInstalled(): boolean {
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	return workspaceFolders.some((folder) => {
		return REQUIRED_PACKAGES.every((pkgName) => {
			const pkgPath = path.join(folder.uri.fsPath, 'node_modules', ...pkgName.split('/'));
			return existsSync(pkgPath);
		});
	});
}

/**
 * 判断文档是否属于工作区 src/ 下的 TypeScript 文件。
 */
function isTargetDocument(document: vscode.TextDocument): boolean {
	if (!document.fileName.endsWith('.ts')) {
		return false;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (!workspaceFolder) {
		return false;
	}

	const relativePath = path.relative(workspaceFolder.uri.fsPath, document.fileName).replace(/\\/g, '/');
	if (relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
		return false;
	}

	return relativePath.startsWith('src/');
}

/**
 * 判断文件是否从 @gkd-kit/define 导入了目标定义函数。
 */
function hasTargetDefineImport(sourceText: string): boolean {
	const importRegex = /import\s*\{([\s\S]*?)\}\s*from\s*['"]@gkd-kit\/define['"]/g;
	let match = importRegex.exec(sourceText);
	while (match) {
		const namedImports = match[1].split(',').map((segment) => segment.trim()).filter(Boolean);
		for (const namedImport of namedImports) {
			// 兼容 `import { type X, Y as Z }`：先去掉 type，再去掉 as 别名。
			const withoutType = namedImport.replace(/^type\s+/, '').trim();
			const baseName = withoutType.split(/\s+as\s+/i)[0]?.trim();
			if (baseName && TARGET_IMPORTS.has(baseName)) {
				return true;
			}
		}
		match = importRegex.exec(sourceText);
	}
	return false;
}

/**
 * 扫描文本中的 snapshotUrls 属性，并提取其中合法 URL。
 */
function findSnapshotUrlsEntries(sourceText: string): SnapshotUrlsEntry[] {
	const entries: SnapshotUrlsEntry[] = [];
	const keyRegex = /snapshotUrls\s*:\s*/g;
	let match = keyRegex.exec(sourceText);
	while (match) {
		const valueStart = skipWhitespace(sourceText, keyRegex.lastIndex);
		const parsed = parseSnapshotUrlsValue(sourceText, valueStart);
		if (parsed) {
			entries.push({
				propertyIndex: match.index,
				urls: parsed.urls.filter(isValidHttpUrl),
			});
			keyRegex.lastIndex = parsed.nextIndex;
		}
		match = keyRegex.exec(sourceText);
	}
	return entries;
}

/**
 * 解析 snapshotUrls 的值，支持字符串与数组两种字面量形式。
 */
function parseSnapshotUrlsValue(sourceText: string, startIndex: number): { urls: string[]; nextIndex: number } | null {
	const startChar = sourceText[startIndex];
	if (!startChar) {
		return null;
	}

	if (startChar === '\'' || startChar === '"') {
		const quoted = readQuotedString(sourceText, startIndex);
		if (!quoted) {
			return null;
		}
		return { urls: [quoted.value], nextIndex: quoted.nextIndex };
	}

	if (startChar === '[') {
		// 数组场景允许换行与嵌套，先截完整数组再提取字符串字面量。
		const arrayLiteral = readArrayLiteral(sourceText, startIndex);
		if (!arrayLiteral) {
			return null;
		}
		return { urls: extractStringLiterals(arrayLiteral.value), nextIndex: arrayLiteral.nextIndex };
	}

	return null;
}

/**
 * 从指定位置开始跳过空白字符，返回第一个非空白字符索引。
 */
function skipWhitespace(text: string, fromIndex: number): number {
	let cursor = fromIndex;
	while (cursor < text.length && /\s/.test(text[cursor])) {
		cursor += 1;
	}
	return cursor;
}

/**
 * 读取单/双引号包裹的字符串字面量，支持转义字符。
 */
function readQuotedString(text: string, startIndex: number): { value: string; nextIndex: number } | null {
	const quote = text[startIndex];
	let cursor = startIndex + 1;
	let result = '';
	while (cursor < text.length) {
		const char = text[cursor];

		// 处理转义字符
		if (char === '\\') {
			const next = text[cursor + 1];
			if (next) {
				result += next;
				cursor += 2;
				continue;
			}
			return null;
		}

		if (char === quote) {
			return { value: result, nextIndex: cursor + 1 };
		}

		result += char;
		cursor += 1;
	}
	return null;
}

/**
 * 读取单层数组字面量
 */
function readArrayLiteral(text: string, startIndex: number): { value: string; nextIndex: number } | null {
	let cursor = startIndex + 1;
	let quote: '\'' | '"' | null = null;
	let inLineComment = false;
	let inBlockComment = false;
	while (cursor < text.length) {
		const char = text[cursor];
		const next = text[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (quote) {
			if (char === '\\') {
				cursor += 2;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			cursor += 1;
			continue;
		}

		if (char === ']') {
			return { value: text.slice(startIndex, cursor + 1), nextIndex: cursor + 1 };
		}

		cursor += 1;
	}
	return null;
}

/**
 * 从数组文本中提取全部字符串字面量内容。
 */
function extractStringLiterals(input: string): string[] {
	const values: string[] = [];
	let cursor = 0;
	let inLineComment = false;
	let inBlockComment = false;

	while (cursor < input.length) {
		const char = input[cursor];
		const next = input[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			const quoted = readQuotedString(input, cursor);
			if (!quoted) {
				break;
			}
			const value = quoted.value.trim();
			if (value.length > 0) {
				values.push(value);
			}
			cursor = quoted.nextIndex;
			continue;
		}

		cursor += 1;
	}

	return values;
}

/**
 * 判断 URL 是否为可打开的 http/https 协议。
 */
function isValidHttpUrl(url: string): boolean {
	try {
		const value = new URL(url);
		return value.protocol === 'http:' || value.protocol === 'https:';
	} catch {
		return false;
	}
}

export const __test__ = {
	hasTargetDefineImport,
	findSnapshotUrlsEntries,
	parseSnapshotUrlsValue,
	skipWhitespace,
	readQuotedString,
	readArrayLiteral,
	extractStringLiterals,
	isValidHttpUrl,
};
