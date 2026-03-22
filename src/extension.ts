declare const __non_webpack_require__: NodeRequire;
import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
	findSnapshotUrlsEntries,
	isValidHttpUrl,
} from './parser/snapshotUrls';
import { setTypeScriptModule } from './parser/utils';
import {
	findDocumentSymbols,
	type DocumentSymbolEntry,
} from './parser/documentSymbols';
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

const SYMBOL_KINDS: vscode.SymbolKind[] = [
	vscode.SymbolKind.Module,
	vscode.SymbolKind.Class,
	vscode.SymbolKind.Field,
];

/**
 * 为目标文档提供 3 层文档大纲：export default → groups → rules。
 */
class GkdDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		if (!isTargetDocument(document)) {
			return [];
		}

		const sourceText = document.getText();
		if (!hasTargetDefineImport(sourceText)) {
			return [];
		}

		const entries = findDocumentSymbols(sourceText);
		return entries.map((entry) => this.toDocumentSymbol(document, entry, 0));
	}

	/**
	 * 将自定义的文档符号列表转换为 VS Code 的 DocumentSymbol 对象。
	 *
	 * @param document 当前文本文档，用于将偏移量转换为行列位置。
	 * @param entry 解析出的文档符号列表。
	 * @param depth 当前符号的层级深度，用于决定符号的类型。
	 * @returns 转换后的 VS Code 文档符号对象。
	 */
	private toDocumentSymbol(
		document: vscode.TextDocument,
		entry: DocumentSymbolEntry,
		depth: number,
	): vscode.DocumentSymbol {
		const startPos = document.positionAt(entry.start);
		const endPos = document.positionAt(entry.end);
		const range = new vscode.Range(startPos, endPos);
		const kind = SYMBOL_KINDS[Math.min(depth, SYMBOL_KINDS.length - 1)];

		const symbol = new vscode.DocumentSymbol(
			entry.name,
			'',
			kind,
			range,
			range,
		);

		symbol.children = entry.children.map((child) =>
			this.toDocumentSymbol(document, child, depth + 1),
		);

		return symbol;
	}
}

/**
 * 扩展激活：校验依赖并注册命令和 CodeLens Provider。
 *
 * @param context VS Code 提供的扩展上下文，用于注册可释放资源。
 * @returns 无返回值。
 */
export function activate(context: vscode.ExtensionContext): void {
	const workspacePath = findWorkspaceWithRequiredPackages();
	if (!workspacePath) {
		return;
	}

	const ts = __non_webpack_require__(path.join(workspacePath, 'node_modules', 'typescript'));
	setTypeScriptModule(ts);

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
			await Promise.all(queryUrls.map((url) => vscode.env.openExternal(vscode.Uri.parse(url, true))));
		},
	);

	const codeLensProvider = vscode.languages.registerCodeLensProvider(
		{ language: 'typescript', scheme: 'file' },
		new SnapshotUrlsCodeLensProvider(),
	);

	const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
		{ language: 'typescript', scheme: 'file' },
		new GkdDocumentSymbolProvider(),
	);

	context.subscriptions.push(openAllDisposable, openAllWithQueryDisposable, codeLensProvider, symbolProvider);
}

/**
 * 扩展停用：当前无需额外清理逻辑。
 */
export function deactivate(): void {}

/**
 * 查找同时安装了所有必需依赖包的工作区路径。
 *
 * @returns 找到的工作区文件系统路径；未找到时返回 `undefined`。
 */
function findWorkspaceWithRequiredPackages(): string | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	const folder = workspaceFolders.find((f) => {
		return REQUIRED_PACKAGES.every((pkgName) => {
			const pkgPath = path.join(f.uri.fsPath, 'node_modules', ...pkgName.split('/'));
			return existsSync(pkgPath);
		});
	});
	return folder?.uri.fsPath;
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
 * 判断文件是否从 \@gkd-kit/define 导入了目标定义函数。
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
	findDocumentSymbols,
	isValidHttpUrl,
	appendGkdParam,
	encodeSelectorToBase64,
};
