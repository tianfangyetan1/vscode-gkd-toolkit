declare const __non_webpack_require__: NodeRequire;
import * as vscode from "vscode";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { findSnapshotUrlsEntries, isValidHttpUrl } from "./parser/snapshotUrls";
import { setTypeScriptModule } from "./parser/utils";
import {
  findDocumentSymbols,
  type DocumentSymbolEntry,
} from "./parser/documentSymbols";
import { findRulesArrayRanges } from "./parser/rulesRanges";
import { buildSingleGroupAppText } from "./parser/copyGroup";
import {
  extractAppPayload,
  findGroupsArrayInsertOffset,
  findMaxGroupKey,
  setGroupKey,
} from "./parser/appendGroup";
import {
  appendGkdParam,
  encodeSelectorToBase64,
  decodeBase64FromUrlSafe,
} from "./url/gkdQuery";

const OPEN_ALL_COMMAND_ID = "gkd-toolkit.openAllSnapshotUrls";
const OPEN_ALL_WITH_QUERY_COMMAND_ID =
  "gkd-toolkit.openAllSnapshotUrlsWithQuery";
const COLLAPSE_ALL_RULES_COMMAND_ID = "gkd-toolkit.collapseAllRules";
const COPY_CURRENT_GROUP_COMMAND_ID = "gkd-toolkit.copyCurrentGroup";
const REQUIRED_PACKAGES = ["@gkd-kit/api", "@gkd-kit/define", "@gkd-kit/tools"];
const TARGET_IMPORTS = new Set(["defineGkdGlobalGroups", "defineGkdApp"]);

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
      const codeLenses: vscode.CodeLens[] = [
        new vscode.CodeLens(range, {
          title: "全部打开",
          command: OPEN_ALL_COMMAND_ID,
          arguments: [entry.urls],
        }),
      ];

      if (entry.selector !== undefined) {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "全部打开并查询",
            command: OPEN_ALL_WITH_QUERY_COMMAND_ID,
            arguments: [entry.urls, entry.selector],
          }),
        );
      }

      return codeLenses;
    });
  }
}

/**
 * 为目标文档提供 2 层文档大纲：groups → rules。
 */
class GkdDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.DocumentSymbol[] {
    if (!isTargetDocument(document)) {
      return [];
    }

    const sourceText = document.getText();
    if (!hasTargetDefineImport(sourceText)) {
      return [];
    }

    const config = vscode.workspace.getConfiguration("gkd-toolkit");
    const hideSingleRule = config.get<boolean>("outline.hideSingleRule", true);
    const entries = findDocumentSymbols(sourceText, { hideSingleRule });
    return entries.map((entry) => this.toDocumentSymbol(document, entry, true));
  }

  /**
   * 将自定义的文档符号列表转换为 VS Code 的 DocumentSymbol 对象。
   *
   * @param document 当前文本文档，用于将偏移量转换为行列位置。
   * @param entry 解析出的文档符号条目。
   * @param isGroup 是否为规则组层级，决定符号类型（Class 或 Field）。
   * @returns 转换后的 VS Code 文档符号对象。
   */
  private toDocumentSymbol(
    document: vscode.TextDocument,
    entry: DocumentSymbolEntry,
    isGroup: boolean,
  ): vscode.DocumentSymbol {
    const startPos = document.positionAt(entry.start);
    const endPos = document.positionAt(entry.end);
    const range = new vscode.Range(startPos, endPos);
    const kind = isGroup ? vscode.SymbolKind.Class : vscode.SymbolKind.Field;

    const symbol = new vscode.DocumentSymbol(
      entry.name,
      "",
      kind,
      range,
      range,
    );

    symbol.children = entry.children.map((child) =>
      this.toDocumentSymbol(document, child, false),
    );

    return symbol;
  }
}

/**
 * 在规则文件顶部显示「折叠所有规则」按钮。
 * 仅当设置 `gkd-toolkit.collapseAllRules.show` 开启时生效。
 *
 * 点击一次后按钮消失；关闭标签页时自动展开折叠，使折叠不会持久化。
 */
class CollapseAllRulesCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** 已折叠的文档（按钮不再显示） */
  public readonly collapsedDocs = new Set<string>();

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (this.collapsedDocs.has(document.uri.toString())) {
      return [];
    }

    if (!isTargetDocument(document)) {
      return [];
    }

    const sourceText = document.getText();
    if (!hasTargetDefineImport(sourceText)) {
      return [];
    }

    const range = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(range, {
        title: "折叠所有规则",
        command: COLLAPSE_ALL_RULES_COMMAND_ID,
      }),
    ];
  }
}

/**
 * 扩展激活：校验依赖并注册命令和 CodeLens Provider。
 *
 * @param context VS Code 提供的扩展上下文，用于注册可释放资源。
 * @returns 无返回值。
 */
export function activate(context: vscode.ExtensionContext): void {
  // URI handler 始终注册，不受工作区门控影响（多工作区判断在 handleUri 内进行）。
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }));

  const workspacePath = findWorkspaceWithRequiredPackages();
  if (!workspacePath) {
    return;
  }

  ensureTsLoaded(workspacePath);

  const openAllDisposable = vscode.commands.registerCommand(
    OPEN_ALL_COMMAND_ID,
    async (urls: unknown) => {
      const list = Array.isArray(urls) ? urls : [];
      const validUrls = list.filter(
        (url): url is string => typeof url === "string" && isValidHttpUrl(url),
      );
      await Promise.all(
        validUrls.map((url) => vscode.env.openExternal(vscode.Uri.parse(url))),
      );
    },
  );

  const openAllWithQueryDisposable = vscode.commands.registerCommand(
    OPEN_ALL_WITH_QUERY_COMMAND_ID,
    async (urls: unknown, selector: unknown) => {
      if (typeof selector !== "string") {
        return;
      }
      const list = Array.isArray(urls) ? urls : [];
      const validUrls = list.filter(
        (url): url is string => typeof url === "string" && isValidHttpUrl(url),
      );
      const queryUrls = validUrls
        .map((url) => appendGkdParam(url, selector))
        .filter((url): url is string => typeof url === "string");
      await Promise.all(
        queryUrls.map((url) =>
          vscode.env.openExternal(vscode.Uri.parse(url, true)),
        ),
      );
    },
  );

  const copyCurrentGroupDisposable = vscode.commands.registerCommand(
    COPY_CURRENT_GROUP_COMMAND_ID,
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const doc = editor.document;
      if (!isTargetDocument(doc) || !hasTargetDefineImport(doc.getText())) {
        vscode.window.showErrorMessage("当前文件不是 GKD 规则文件");
        return;
      }
      const offset = doc.offsetAt(editor.selection.active);
      const objectText = buildSingleGroupAppText(doc.getText(), offset);
      if (objectText === undefined) {
        vscode.window.showErrorMessage("光标未处于任何规则组内");
        return;
      }
      await vscode.env.clipboard.writeText(objectText);
      // 成功提示：状态栏消息，3 秒后自动清除
      vscode.window.setStatusBarMessage("已复制当前规则组", 3000);
    },
  );

  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    { language: "typescript", scheme: "file" },
    new SnapshotUrlsCodeLensProvider(),
  );

  const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
    { language: "typescript", scheme: "file" },
    new GkdDocumentSymbolProvider(),
  );

  context.subscriptions.push(
    openAllDisposable,
    openAllWithQueryDisposable,
    copyCurrentGroupDisposable,
    codeLensProvider,
    symbolProvider,
  );

  // 折叠所有规则，仅在设置开启时注册
  const config = vscode.workspace.getConfiguration("gkd-toolkit");
  if (config.get<boolean>("collapseAllRules.show", false)) {
    const collapseAllRulesProvider = new CollapseAllRulesCodeLensProvider();

    const collapseAllRulesDisposable = vscode.commands.registerCommand(
      COLLAPSE_ALL_RULES_COMMAND_ID,
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const sourceText = editor.document.getText();
        const ranges = findRulesArrayRanges(sourceText);
        if (ranges.length === 0) {
          return;
        }

        const foldLines = ranges.map(
          (r) => editor.document.positionAt(r.start).line,
        );
        await vscode.commands.executeCommand("editor.fold", {
          selectionLines: foldLines,
        });

        collapseAllRulesProvider.collapsedDocs.add(
          editor.document.uri.toString(),
        );
        collapseAllRulesProvider.refresh();
      },
    );

    // 文档关闭时清除折叠记录，使下次打开时按钮重新出现
    const onDocCloseDisposable = vscode.workspace.onDidCloseTextDocument(
      (doc) => {
        if (collapseAllRulesProvider.collapsedDocs.delete(doc.uri.toString())) {
          collapseAllRulesProvider.refresh();
        }
      },
    );

    // 规则文件首次打开时，自动展开所有被折叠的 rules 数组
    const onDocOpenDisposable = vscode.workspace.onDidOpenTextDocument(
      (doc) => {
        if (!isTargetDocument(doc) || !hasTargetDefineImport(doc.getText())) {
          return;
        }
        const ranges = findRulesArrayRanges(doc.getText());
        if (ranges.length === 0) {
          return;
        }
        // 延迟等待编辑器就绪及 VS Code 恢复折叠状态后再展开
        setTimeout(async () => {
          const editor = vscode.window.visibleTextEditors.find(
            (e) => e.document.uri.toString() === doc.uri.toString(),
          );
          if (!editor) {
            return;
          }
          const foldLines = ranges.map(
            (r) => editor.document.positionAt(r.start).line,
          );
          await vscode.commands.executeCommand("editor.unfold", {
            selectionLines: foldLines,
          });
        }, 300);
      },
    );

    const collapseAllRulesCodeLensProvider =
      vscode.languages.registerCodeLensProvider(
        { language: "typescript", scheme: "file" },
        collapseAllRulesProvider,
      );

    context.subscriptions.push(
      collapseAllRulesDisposable,
      onDocCloseDisposable,
      onDocOpenDisposable,
      collapseAllRulesProvider,
      collapseAllRulesCodeLensProvider,
    );
  }
}

/**
 * 扩展停用：当前无需额外清理逻辑。
 */
export function deactivate(): void {}

/** TS 单例是否已注入，避免重复加载。 */
let tsLoaded = false;

/**
 * 确保 TypeScript 单例已从工作区动态加载并注入到 parser 层。
 *
 * @param workspacePath 含有 typescript 依赖的工作区路径。
 */
function ensureTsLoaded(workspacePath: string): void {
  if (tsLoaded) {
    return;
  }
  const ts = __non_webpack_require__(
    path.join(workspacePath, "node_modules", "typescript"),
  );
  setTypeScriptModule(ts);
  tsLoaded = true;
}

/**
 * 查找所有同时安装了必需依赖包的工作区路径。
 *
 * @returns 所有匹配的工作区文件系统路径列表。
 */
function findWorkspacesWithRequiredPackages(): string[] {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  return workspaceFolders
    .filter((f) =>
      REQUIRED_PACKAGES.every((pkgName) =>
        existsSync(
          path.join(f.uri.fsPath, "node_modules", ...pkgName.split("/")),
        ),
      ),
    )
    .map((f) => f.uri.fsPath);
}

/**
 * 查找同时安装了所有必需依赖包的工作区路径（取第一个匹配）。
 *
 * @returns 找到的工作区文件系统路径；未找到时返回 `undefined`。
 */
function findWorkspaceWithRequiredPackages(): string | undefined {
  return findWorkspacesWithRequiredPackages()[0];
}

/**
 * 校验 app 包名参数：非空、不含路径分隔符、不含 `..`（防目录穿越）。
 *
 * @param app 来自 URL 的 app 参数。
 * @returns 合法时返回 `true`。
 */
function isValidAppId(app: string | null): app is string {
  if (!app) {
    return false;
  }
  if (/[\\/]/.test(app) || app.includes("..")) {
    return false;
  }
  return true;
}

/**
 * 处理 vscode:// 协议唤起，支持 `/open` 与 `/append`。
 *
 * 仅当恰好存在一个 GKD 订阅工作区时才响应。
 *
 * @param uri 唤起扩展的 URI。
 */
async function handleUri(uri: vscode.Uri): Promise<void> {
  const matches = findWorkspacesWithRequiredPackages();
  if (matches.length === 0) {
    vscode.window.showErrorMessage("未打开 GKD 订阅工作区");
    return;
  }
  if (matches.length > 1) {
    vscode.window.showErrorMessage("检测到多个 GKD 订阅工作区，无法跳转文件");
    return;
  }
  const workspacePath = matches[0];
  ensureTsLoaded(workspacePath);

  const params = new URLSearchParams(uri.query);
  const app = params.get("app");
  if (!isValidAppId(app)) {
    vscode.window.showErrorMessage("缺少或非法的 app 参数");
    return;
  }
  const filePath = path.join(workspacePath, "src", "apps", app + ".ts");

  switch (uri.path) {
    case "/open":
      await handleOpenUri(filePath);
      break;
    case "/append":
      await handleAppendUri(filePath, params.get("groups"));
      break;
    default:
      vscode.window.showErrorMessage(`不支持的操作：${uri.path}`);
  }
}

/**
 * `/open`：打开指定规则文件，不存在则报错。
 *
 * @param filePath 目标文件绝对路径。
 */
async function handleOpenUri(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    vscode.window.showErrorMessage(`规则文件不存在：${filePath}`);
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
}

/**
 * `/append`：把规则组追加进文件（不存在则新建），按配置确认、覆写 key、格式化。
 *
 * @param filePath 目标文件绝对路径。
 * @param groupsParam URL 中的 groups 参数（url-safe base64）。
 */
async function handleAppendUri(
  filePath: string,
  groupsParam: string | null,
): Promise<void> {
  if (!groupsParam) {
    vscode.window.showErrorMessage("缺少 groups 参数");
    return;
  }
  const decoded = decodeBase64FromUrlSafe(groupsParam);
  if (decoded === null) {
    vscode.window.showErrorMessage("groups 参数解码失败");
    return;
  }
  const payload = extractAppPayload(decoded);
  if (!payload) {
    vscode.window.showErrorMessage(
      "groups 不是合法的 defineGkdApp 参数对象",
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("gkd-toolkit");
  if (config.get<boolean>("append.confirm", true)) {
    const choice = await vscode.window.showWarningMessage(
      `确定向 ${filePath} 添加 ${payload.groups.length} 个规则组吗？`,
      "确定",
      "不再询问",
    );
    if (choice === undefined) {
      return; // 取消
    }
    if (choice === "不再询问") {
      await config.update(
        "append.confirm",
        false,
        vscode.ConfigurationTarget.Global,
      );
    }
  }

  const overwriteKey = config.get<boolean>("append.overwriteKey", true);
  const fileUri = vscode.Uri.file(filePath);
  const edit = new vscode.WorkspaceEdit();

  if (!existsSync(filePath)) {
    // 新建文件：在 payload 文本内按 1,2,3... 覆写 key（从后往前以保持偏移有效）。
    let payloadText = decoded;
    if (overwriteKey) {
      for (let i = payload.groups.length - 1; i >= 0; i--) {
        const g = payload.groups[i];
        payloadText =
          payloadText.slice(0, g.start) +
          setGroupKey(g.text, i + 1) +
          payloadText.slice(g.end);
      }
    }
    const content = `import { defineGkdApp } from "@gkd-kit/define";\n\nexport default defineGkdApp(${payloadText});\n`;
    edit.createFile(fileUri, { ignoreIfExists: false });
    edit.insert(fileUri, new vscode.Position(0, 0), content);
  } else {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const insert = findGroupsArrayInsertOffset(doc.getText());
    if (!insert) {
      vscode.window.showErrorMessage(
        "目标文件不是合法的 GKD App 规则文件",
      );
      return;
    }
    let groupTexts = payload.groups.map((g) => g.text);
    if (overwriteKey) {
      const base = (findMaxGroupKey(doc.getText()) ?? 0) + 1;
      groupTexts = groupTexts.map((t, i) => setGroupKey(t, base + i));
    }
    const insertText = (insert.needsComma ? "," : "") + groupTexts.join(",\n");
    edit.insert(fileUri, doc.positionAt(insert.offset), insertText);
  }

  await vscode.workspace.applyEdit(edit);

  const editor = await vscode.window.showTextDocument(fileUri);
  if (config.get<boolean>("append.format", true)) {
    await vscode.commands.executeCommand("editor.action.formatDocument");
  }
  await editor.document.save();

  vscode.window.setStatusBarMessage(
    `已追加规则组到 ${path.basename(filePath)}`,
    3000,
  );
}

/**
 * 判断文档是否属于工作区 src/ 下的 TypeScript 文件。
 *
 * @param document 待检查的文本文档。
 * @returns 当文档位于工作区 `src/` 目录下且扩展名为 `.ts` 时返回 `true`。
 */
function isTargetDocument(document: vscode.TextDocument): boolean {
  if (!document.fileName.endsWith(".ts")) {
    return false;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return false;
  }

  const relativePath = path
    .relative(workspaceFolder.uri.fsPath, document.fileName)
    .replace(/\\/g, "/");
  if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath.startsWith("src/");
}

/**
 * 判断文件是否从 \@gkd-kit/define 导入了目标定义函数。
 *
 * @param sourceText 文档的完整源码文本。
 * @returns 当源码中存在目标导入项时返回 `true`。
 */
function hasTargetDefineImport(sourceText: string): boolean {
  const importRegex =
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]@gkd-kit\/define['"]/g;
  let match = importRegex.exec(sourceText);
  while (match) {
    const namedImports = match[1]
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const namedImport of namedImports) {
      // 兼容 `import { type X, Y as Z }`：先去掉 type，再去掉 as 别名。
      const withoutType = namedImport.replace(/^type\s+/, "").trim();
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
  findRulesArrayRanges,
  buildSingleGroupAppText,
  isValidHttpUrl,
  appendGkdParam,
  encodeSelectorToBase64,
  decodeBase64FromUrlSafe,
  extractAppPayload,
  findGroupsArrayInsertOffset,
  findMaxGroupKey,
  setGroupKey,
  isValidAppId,
};
