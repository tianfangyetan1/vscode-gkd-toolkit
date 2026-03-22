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

export type DocumentSymbolOptions = {
  /** 当规则组内只有一条规则时，不展开该规则。默认为 true。 */
  hideSingleRule?: boolean;
};

/**
 * 解析源码，提取文档大纲结构。
 * 顶层为规则组，规则组内为规则。
 *
 * @param sourceText 待解析的源码文本。
 * @param options 大纲设置。
 * @returns 文档符号条目列表。
 */
export function findDocumentSymbols(
  sourceText: string,
  options: DocumentSymbolOptions = {},
): DocumentSymbolEntry[] {
  const _ts = getTs();
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    sourceText,
    _ts.ScriptTarget.Latest,
    true,
  );

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
    return extractGroups(_ts, sourceFile, arg, options);
  }

  return [];
}

/**
 * 从函数参数对象中提取 `groups` 属性并解析为文档符号数组。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param arg 需要解析的表达式节点
 * @param options 大纲设置
 * @returns 提取出的文档符号数组，无法提取则返回空数组
 */
function extractGroups(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  arg: ts.Expression,
  options: DocumentSymbolOptions,
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
    .map((groupObj) => extractGroupSymbol(_ts, sourceFile, groupObj, options));
}

/**
 * 将规则组对象提取为文档符号。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param groupObj 规则组对象
 * @param options 大纲设置
 * @returns 规则组文档符号对象
 */
function extractGroupSymbol(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  groupObj: ts.ObjectLiteralExpression,
  options: DocumentSymbolOptions,
): DocumentSymbolEntry {
  const name = getStringProperty(groupObj, "name");
  const key = getPropertyValue(groupObj, "key");
  const displayName =
    name || (key !== undefined ? `key=${key}` : "[未命名规则组]");

  const children = extractRules(_ts, sourceFile, groupObj, options);

  return {
    name: displayName,
    start: groupObj.getStart(sourceFile),
    end: groupObj.getEnd(),
    children,
  };
}

/**
 * 从规则组中提取 `rules` 数组并解析为文档符号数组。
 *
 * @param _ts TypeScript 模块实例
 * @param sourceFile 当前解析文件的 AST 节点
 * @param groupObj 规则组对象
 * @param options 大纲设置
 * @returns 规则文档符号数组
 */
function extractRules(
  _ts: typeof ts,
  sourceFile: ts.SourceFile,
  groupObj: ts.ObjectLiteralExpression,
  options: DocumentSymbolOptions,
): DocumentSymbolEntry[] {
  for (const prop of groupObj.properties) {
    if (!_ts.isPropertyAssignment(prop) || getPropertyName(prop) !== "rules") {
      continue;
    }

    if (!_ts.isArrayLiteralExpression(prop.initializer)) {
      return [];
    }

    const ruleObjects = prop.initializer.elements.filter(
      (el): el is ts.ObjectLiteralExpression =>
        _ts.isObjectLiteralExpression(el),
    );

    if (options.hideSingleRule !== false && ruleObjects.length <= 1) {
      return [];
    }

    return ruleObjects.map((ruleObj) => {
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
