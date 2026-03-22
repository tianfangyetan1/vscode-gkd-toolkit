import type * as ts from "typescript";
import { getTs, getPropertyName } from "./utils";

export type RulesArrayRange = {
  /** rules 数组字面量的起始偏移量 */
  start: number;
  /** rules 数组字面量的结束偏移量 */
  end: number;
};

/**
 * 解析源码，查找所有 `rules` 属性中类型为数组的代码块范围。
 *
 * @param sourceText 待解析的源码文本。
 * @returns rules 数组的范围列表。
 */
export function findRulesArrayRanges(sourceText: string): RulesArrayRange[] {
  const _ts = getTs();
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    sourceText,
    _ts.ScriptTarget.Latest,
    true,
  );

  // 找到 export default 调用的第一个参数
  for (const statement of sourceFile.statements) {
    if (!_ts.isExportAssignment(statement)) {
      continue;
    }
    const callExpr = statement.expression;
    if (!_ts.isCallExpression(callExpr) || callExpr.arguments.length === 0) {
      continue;
    }
    const arg = callExpr.arguments[0];
    if (!_ts.isObjectLiteralExpression(arg)) {
      return [];
    }
    return extractRulesFromGroups(_ts, arg);
  }

  return [];
}

/**
 * 从顶层对象的 `groups` 数组中，提取每个规则组对象的 `rules` 数组范围。
 */
function extractRulesFromGroups(
  _ts: typeof ts,
  obj: ts.ObjectLiteralExpression,
): RulesArrayRange[] {
  for (const prop of obj.properties) {
    if (
      !_ts.isPropertyAssignment(prop) ||
      getPropertyName(prop) !== "groups" ||
      !_ts.isArrayLiteralExpression(prop.initializer)
    ) {
      continue;
    }

    const ranges: RulesArrayRange[] = [];
    for (const element of prop.initializer.elements) {
      if (!_ts.isObjectLiteralExpression(element)) {
        continue;
      }
      for (const groupProp of element.properties) {
        if (
          _ts.isPropertyAssignment(groupProp) &&
          getPropertyName(groupProp) === "rules" &&
          _ts.isArrayLiteralExpression(groupProp.initializer) &&
          groupProp.initializer.elements.length > 0
        ) {
          ranges.push({
            start: groupProp.initializer.getStart(),
            end: groupProp.initializer.getEnd(),
          });
        }
      }
    }
    return ranges;
  }

  return [];
}
