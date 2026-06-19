import type * as ts from "typescript";
import { getTs, getPropertyName } from "./utils";

/**
 * 复制「当前规则组」：返回 `defineGkdApp(...)` 参数对象的文本，
 * 但其中 `groups` 数组只保留光标所在偏移量对应的那一个规则组对象。
 *
 * @param sourceText 待解析的源码文本。
 * @param offset 光标在源码中的偏移量。
 * @returns 重组后的参数对象文本；当不满足条件（非 defineGkdApp、无 groups、
 *   光标不在任何规则组内等）时返回 undefined。
 */
export function buildSingleGroupAppText(
  sourceText: string,
  offset: number,
): string | undefined {
  const _ts = getTs();
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    sourceText,
    _ts.ScriptTarget.Latest,
    true,
  );

  for (const statement of sourceFile.statements) {
    if (!_ts.isExportAssignment(statement)) {
      continue;
    }

    const callExpr = statement.expression;
    if (!_ts.isCallExpression(callExpr) || callExpr.arguments.length === 0) {
      continue;
    }

    // 仅处理 defineGkdApp 调用
    if (
      !_ts.isIdentifier(callExpr.expression) ||
      callExpr.expression.text !== "defineGkdApp"
    ) {
      return undefined;
    }

    const arg = callExpr.arguments[0];
    if (!_ts.isObjectLiteralExpression(arg)) {
      return undefined;
    }

    const groupsArray = findGroupsArray(_ts, arg);
    if (!groupsArray) {
      return undefined;
    }

    const targetGroup = groupsArray.elements.find(
      (el): el is ts.ObjectLiteralExpression =>
        _ts.isObjectLiteralExpression(el) &&
        el.getStart(sourceFile) <= offset &&
        offset <= el.getEnd(),
    );
    if (!targetGroup) {
      return undefined;
    }

    // 保留原始源码格式，仅把 groups 数组替换为只含目标组的数组
    const argStart = arg.getStart(sourceFile);
    const objText = sourceText.slice(argStart, arg.getEnd());
    const relStart = groupsArray.getStart(sourceFile) - argStart;
    const relEnd = groupsArray.getEnd() - argStart;
    const groupText = sourceText.slice(
      targetGroup.getStart(sourceFile),
      targetGroup.getEnd(),
    );

    return (
      objText.slice(0, relStart) + "[" + groupText + "]" + objText.slice(relEnd)
    );
  }

  return undefined;
}

/**
 * 从对象字面量中找到 `groups` 属性对应的数组字面量。
 *
 * @param _ts TypeScript 模块实例。
 * @param obj 待查找的对象字面量。
 * @returns groups 数组字面量；未找到时返回 undefined。
 */
function findGroupsArray(
  _ts: typeof ts,
  obj: ts.ObjectLiteralExpression,
): ts.ArrayLiteralExpression | undefined {
  for (const prop of obj.properties) {
    if (
      _ts.isPropertyAssignment(prop) &&
      getPropertyName(prop) === "groups" &&
      _ts.isArrayLiteralExpression(prop.initializer)
    ) {
      return prop.initializer;
    }
  }
  return undefined;
}
