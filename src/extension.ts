import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
	extractStringLiterals,
	findSnapshotUrlsEntries,
	isValidHttpUrl,
	parseSnapshotUrlsValue,
	readArrayLiteral,
	readQuotedString,
	skipWhitespace,
} from './parser/snapshotUrls';
import { appendGkdParam, encodeSelectorToBase64 } from './url/gkdQuery';

const OPEN_ALL_COMMAND_ID = 'gkd-toolkit.openAllSnapshotUrls';
const OPEN_ALL_WITH_QUERY_COMMAND_ID = 'gkd-toolkit.openAllSnapshotUrlsWithQuery';
const REQUIRED_PACKAGES = ['@gkd-kit/api', '@gkd-kit/define', '@gkd-kit/tools'];
const TARGET_IMPORTS = new Set(['defineGkdGlobalGroups', 'defineGkdApp']);


/**
 * 为目标文档中的每个 snapshotUrls 属性生成 CodeLens。
 *
 * @param document 当前需要分析的文本文档。
 * @returns 生成的 CodeLens 列表；当文档不符合条件时返回空数组。
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

		// 只有存在合法 URL 的 snapshotUrls 才会生成按钮。
		const entries = findSnapshotUrlsEntries(sourceText);
		return entries.flatMap((entry) => {
			if (entry.urls.length === 0) {
				return [];
			}

			const position = document.positionAt(entry.propertyIndex);
			const range = new vscode.Range(position.line, 0, position.line, 0);
			const codeLenses: vscode.CodeLens[] = [new vscode.CodeLens(range, {
				title: '全部打开',
				command: OPEN_ALL_COMMAND_ID,
				arguments: [entry.urls],
			})];

			if (entry.selector !== undefined) {
				codeLenses.push(new vscode.CodeLens(range, {
					title: '全部打开并查询',
					command: OPEN_ALL_WITH_QUERY_COMMAND_ID,
					arguments: [entry.urls, entry.selector],
				}));
			}

			return codeLenses;
		});
	}
}

/**
 * 扩展激活：校验依赖并注册命令和 CodeLens Provider。
 *
 * @param context VS Code 提供的扩展上下文，用于注册可释放资源。
 * @returns 无返回值。
 */
export function activate(context: vscode.ExtensionContext): void {
	if (!hasRequiredPackagesInstalled()) {
		return;
	}

	const openAllDisposable = vscode.commands.registerCommand(OPEN_ALL_COMMAND_ID, async (urls: unknown) => {
		const list = Array.isArray(urls) ? urls : [];
		const validUrls = list.filter((url): url is string => typeof url === 'string' && isValidHttpUrl(url));
		await Promise.all(validUrls.map((url) => vscode.env.openExternal(vscode.Uri.parse(url))));
	});

	const openAllWithQueryDisposable = vscode.commands.registerCommand(
		OPEN_ALL_WITH_QUERY_COMMAND_ID,
		async (urls: unknown, selector: unknown) => {
			if (typeof selector !== 'string') {
				return;
			}
			const list = Array.isArray(urls) ? urls : [];
			const validUrls = list.filter((url): url is string => typeof url === 'string' && isValidHttpUrl(url));
			const queryUrls = validUrls
				.map((url) => appendGkdParam(url, selector))
				.filter((url): url is string => typeof url === 'string');
			await Promise.all(queryUrls.map((url) => vscode.env.openExternal(vscode.Uri.parse(url))));
		},
	);

	const provider = vscode.languages.registerCodeLensProvider(
		{ language: 'typescript', scheme: 'file' },
		new SnapshotUrlsCodeLensProvider(),
	);

	context.subscriptions.push(openAllDisposable, openAllWithQueryDisposable, provider);
}

/**
 * 扩展停用：当前无需额外清理逻辑。
 *
 * @returns 无返回值。
 */
export function deactivate(): void {}

/**
 * 检查任一工作区是否同时安装了三个必需依赖包。
 *
 * @returns 只要存在一个工作区安装了全部必需依赖，则返回 `true`。
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
 *
 * @param document 待检查的文本文档。
 * @returns 当文档位于工作区 `src/` 目录下且扩展名为 `.ts` 时返回 `true`。
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
 *
 * @param sourceText 文档的完整源码文本。
 * @returns 当源码中存在目标导入项时返回 `true`。
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

export const __test__ = {
	hasTargetDefineImport,
	findSnapshotUrlsEntries,
	parseSnapshotUrlsValue,
	skipWhitespace,
	readQuotedString,
	readArrayLiteral,
	extractStringLiterals,
	isValidHttpUrl,
	appendGkdParam,
	encodeSelectorToBase64,
};
