import type * as ts from "typescript";

let _ts: typeof ts;

/**
 * 设置 TypeScript 模块实例（从工作区动态加载）。
 *
 * @param tsModule TypeScript 模块实例
 */
export function setTypeScriptModule(tsModule: typeof ts): void {
  _ts = tsModule;
}

/**
 * 获取 TypeScript 模块实例。
 *
 * @returns TypeScript 模块实例
 */
export function getTs(): typeof ts {
  return _ts;
}

/**
 * 获取属性赋值节点的属性名。
 *
 * @param node 属性赋值节点
 * @returns 属性名，如果不是标识符或字符串字面量则返回 undefined
 */
export function getPropertyName(
  node: ts.PropertyAssignment,
): string | undefined {
  if (_ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (_ts.isStringLiteral(node.name)) {
    return node.name.text;
  }
  return undefined;
}

/**
 * 从表达式节点中提取字符串值，支持字符串字面量和字符串数组。
 *
 * @param node 表达式节点
 * @returns 提取到的字符串数组
 */
export function extractStringValues(node: ts.Expression): string[] {
  if (_ts.isStringLiteral(node) || _ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (_ts.isArrayLiteralExpression(node)) {
    return node.elements
      .filter(
        (el): el is ts.StringLiteral =>
          _ts.isStringLiteral(el) || _ts.isNoSubstitutionTemplateLiteral(el),
      )
      .map((el) => el.text);
  }
  return [];
}

/**
 * 从对象字面量中获取指定名称的字符串属性值。
 *
 * @param obj 对象字面量表达式节点
 * @param name 属性名称
 * @returns 字符串属性值，如果未找到或不是字符串字面量则返回 undefined
 */
export function getStringProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  for (const prop of obj.properties) {
    if (
      _ts.isPropertyAssignment(prop) &&
      getPropertyName(prop) === name &&
      _ts.isStringLiteral(prop.initializer)
    ) {
      return prop.initializer.text;
    }
  }
  return undefined;
}

/**
 * 从对象字面量中获取指定属性的值（支持字符串和数字字面量）。
 *
 * @param obj 对象字面量表达式节点
 * @param name 属性名称
 * @returns 属性的字符串表示值，如果未找到或不支持该类型则返回 undefined
 */
export function getPropertyValue(
  obj: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  for (const prop of obj.properties) {
    if (!_ts.isPropertyAssignment(prop) || getPropertyName(prop) !== name) {
      continue;
    }
    if (_ts.isStringLiteral(prop.initializer)) {
      return prop.initializer.text;
    }
    if (_ts.isNumericLiteral(prop.initializer)) {
      return prop.initializer.text;
    }
    if (
      _ts.isPrefixUnaryExpression(prop.initializer) &&
      prop.initializer.operator === _ts.SyntaxKind.MinusToken &&
      _ts.isNumericLiteral(prop.initializer.operand)
    ) {
      return "-" + prop.initializer.operand.text;
    }
  }
  return undefined;
}
