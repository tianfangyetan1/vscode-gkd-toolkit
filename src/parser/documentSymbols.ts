import type * as ts from "typescript";
import {
  getTs,
  getPropertyName,
  getStringProperty,
  getPropertyValue,
} from "./utils";

export type DocumentSymbolEntry = {
  name: string;
  start: number;
  end: number;
  children: DocumentSymbolEntry[];
};

/**
 * 解析源码，提取 3 层文档大纲结构。
 *
 * @param sourceText 待解析的源码文本。
 * @returns 文档符号条目列表（通常只有一个 export default 顶层条目）。
 */
export function findDocumentSymbols(sourceText: string): DocumentSymbolEntry[] {
  const _ts = getTs();
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    sourceText,
    _ts.ScriptTarget.Latest,
    true,
  );
  const results: DocumentSymbolEntry[] = [];

  // 遍历文件中的所有顶层语句
  for (const statement of sourceFile.statements) {
    if (!_ts.isExportAssignment(statement)) {
      continue;
    }

    const callExpr = statement.expression;
    if (!_ts.isCallExpression(callExpr) || callExpr.arguments.length === 0) {
      continue;
    }

    const arg = callExpr.arguments[0];
    const groups = extractGroups(_ts, sourceFile, arg);

    results.push({
      name: "export default",
      start: statement.getStart(sourceFile),
      end: statement.getEnd(),
      children: groups,
    });
  }

  return results;
}

/**
 * 从表达式中提取 `groups` 属性并解析为文档符号数组。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param arg 需要解析的表达式节点
 * @returns 提取出的文档符号数组，无法提取则返回空数组
 */
function extractGroups(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  arg: ts.Expression,
): DocumentSymbolEntry[] {
  if (!_ts.isObjectLiteralExpression(arg)) {
    return [];
  }

  // 提取对象的 groups 属性
  let groupsArray: ts.ArrayLiteralExpression | undefined;
  for (const prop of arg.properties) {
    if (
      _ts.isPropertyAssignment(prop) &&
      getPropertyName(prop) === "groups" &&
      _ts.isArrayLiteralExpression(prop.initializer)
    ) {
      groupsArray = prop.initializer;
      break;
    }
  }

  if (!groupsArray) {
    return [];
  }

  // 遍历 groups 数组，提取每个规则组对象
  return groupsArray.elements
    .filter((el): el is ts.ObjectLiteralExpression =>
      _ts.isObjectLiteralExpression(el),
    )
    .map((groupObj) => extractGroupSymbol(_ts, sourceFile, groupObj));
}

/**
 * 将规则组对象提取为文档符号。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param groupObj 规则组对象
 * @returns 规则组文档符号对象
 */
function extractGroupSymbol(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  groupObj: ts.ObjectLiteralExpression,
): DocumentSymbolEntry {
  const name = getStringProperty(groupObj, "name");
  const key = getPropertyValue(groupObj, "key");
  const displayName =
    name || (key !== undefined ? `key=${key}` : "[未命名规则组]");

  const children = extractRules(_ts, sourceFile, groupObj);

  return {
    name: displayName,
    start: groupObj.getStart(sourceFile),
    end: groupObj.getEnd(),
    children,
  };
}

/**
 * 将规则对象提取为文档符号。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param groupObj 规则组对象
 * @returns 规则文档符号数组
 */
function extractRules(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  groupObj: ts.ObjectLiteralExpression,
): DocumentSymbolEntry[] {
  for (const prop of groupObj.properties) {
    if (!_ts.isPropertyAssignment(prop) || getPropertyName(prop) !== "rules") {
      continue;
    }

    if (!_ts.isArrayLiteralExpression(prop.initializer)) {
      return [];
    }

    return prop.initializer.elements
      .filter((el): el is ts.ObjectLiteralExpression =>
        _ts.isObjectLiteralExpression(el),
      )
      .map((ruleObj) => {
        const name = getStringProperty(ruleObj, "name");
        const key = getPropertyValue(ruleObj, "key");
        const displayName =
          name || (key !== undefined ? `key=${key}` : "[未命名规则]");
        return {
          name: displayName,
          start: ruleObj.getStart(sourceFile),
          end: ruleObj.getEnd(),
          children: [],
        };
      });
  }
  return [];
}
