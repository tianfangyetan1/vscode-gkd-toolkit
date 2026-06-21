import type * as ts from "typescript";
import {
  getTs,
  getStringProperty,
  getPropertyValue,
  findGroupsArray,
} from "./utils";

/** 把单个表达式包裹成可解析语句的前缀，用于解析裸对象字面量文本。 */
const WRAP_PREFIX = "const __gkd__ = (";
const WRAP_SUFFIX = ");";

/** payload 中一个 groups 元素：原始文本及其相对 payload 文本的起止偏移。 */
export interface PayloadGroup {
  text: string;
  start: number;
  end: number;
}

/** `/append` 载荷（defineGkdApp 参数对象）解析结果。 */
export interface AppPayload {
  id: string | undefined;
  groups: PayloadGroup[];
}

/**
 * 把裸对象字面量文本包裹后解析，返回对象字面量节点及其所在 SourceFile。
 *
 * @param objectText 对象字面量文本，如 `{ id: '...', groups: [...] }`。
 * @returns 解析成功时返回节点；非对象或解析失败返回 undefined。
 */
function parseWrappedObject(
  objectText: string,
): { sourceFile: ts.SourceFile; obj: ts.ObjectLiteralExpression } | undefined {
  const _ts = getTs();
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    WRAP_PREFIX + objectText + WRAP_SUFFIX,
    _ts.ScriptTarget.Latest,
    true,
  );
  const statement = sourceFile.statements[0];
  if (!statement || !_ts.isVariableStatement(statement)) {
    return undefined;
  }
  const declaration = statement.declarationList.declarations[0];
  if (!declaration || !declaration.initializer) {
    return undefined;
  }
  let init: ts.Expression = declaration.initializer;
  while (_ts.isParenthesizedExpression(init)) {
    init = init.expression;
  }
  if (!_ts.isObjectLiteralExpression(init)) {
    return undefined;
  }
  return { sourceFile, obj: init };
}

/**
 * 从 `export default defineGkdApp({...})` 中取出参数对象字面量节点。
 *
 * @param sourceText 规则文件源码。
 * @returns 节点及其 SourceFile；非 defineGkdApp / 无 export default 返回 undefined。
 */
function findDefineAppArg(
  sourceText: string,
): { sourceFile: ts.SourceFile; obj: ts.ObjectLiteralExpression } | undefined {
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
    return { sourceFile, obj: arg };
  }
  return undefined;
}

/**
 * 解析 `/append` 载荷（完整的 defineGkdApp 参数对象文本），
 * 提取 `id` 以及 `groups` 数组每个元素的原始文本与偏移。
 *
 * @param payloadObjectText 载荷对象字面量文本。
 * @returns 解析结果；解析失败 / 非对象 / 无 groups 数组时返回 undefined。
 */
export function extractAppPayload(
  payloadObjectText: string,
): AppPayload | undefined {
  const parsed = parseWrappedObject(payloadObjectText);
  if (!parsed) {
    return undefined;
  }
  const { sourceFile, obj } = parsed;
  const groupsArray = findGroupsArray(obj);
  if (!groupsArray) {
    return undefined;
  }
  const groups = groupsArray.elements.map((el) => {
    const start = el.getStart(sourceFile) - WRAP_PREFIX.length;
    const end = el.getEnd() - WRAP_PREFIX.length;
    return { text: payloadObjectText.slice(start, end), start, end };
  });
  return { id: getStringProperty(obj, "id"), groups };
}

/**
 * 定位现有文件 groups 数组的插入点（紧邻闭合 `]` 之前）。
 *
 * @param sourceText 规则文件源码。
 * @returns 插入偏移与是否需要补逗号；非 defineGkdApp / 无 groups 数组返回 undefined。
 */
export function findGroupsArrayInsertOffset(
  sourceText: string,
): { offset: number; needsComma: boolean } | undefined {
  const found = findDefineAppArg(sourceText);
  if (!found) {
    return undefined;
  }
  const groupsArray = findGroupsArray(found.obj);
  if (!groupsArray) {
    return undefined;
  }
  const offset = groupsArray.getEnd() - 1; // 闭合 `]` 之前
  const needsComma =
    groupsArray.elements.length > 0 && !groupsArray.elements.hasTrailingComma;
  return { offset, needsComma };
}

/**
 * 取现有文件所有规则组中最大的 `key` 值。
 *
 * @param sourceText 规则文件源码。
 * @returns 最大 key；无任何 key 或无法解析时返回 undefined。
 */
export function findMaxGroupKey(sourceText: string): number | undefined {
  const _ts = getTs();
  const found = findDefineAppArg(sourceText);
  if (!found) {
    return undefined;
  }
  const groupsArray = findGroupsArray(found.obj);
  if (!groupsArray) {
    return undefined;
  }
  let max: number | undefined;
  for (const el of groupsArray.elements) {
    if (!_ts.isObjectLiteralExpression(el)) {
      continue;
    }
    const value = getPropertyValue(el, "key");
    if (value === undefined) {
      continue;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      continue;
    }
    max = max === undefined ? num : Math.max(max, num);
  }
  return max;
}

/**
 * 覆写单个规则组对象文本的 `key` 值：已有则替换其值，没有则在 `{` 后新增。
 *
 * @param groupText 单个规则组对象字面量文本。
 * @param key 要写入的 key 值。
 * @returns 改写后的文本；解析失败时原样返回。
 */
export function setGroupKey(groupText: string, key: number): string {
  const _ts = getTs();
  const parsed = parseWrappedObject(groupText);
  if (!parsed) {
    return groupText;
  }
  const { sourceFile, obj } = parsed;
  for (const prop of obj.properties) {
    if (_ts.isPropertyAssignment(prop) && isKeyName(_ts, prop)) {
      const start = prop.initializer.getStart(sourceFile) - WRAP_PREFIX.length;
      const end = prop.initializer.getEnd() - WRAP_PREFIX.length;
      return groupText.slice(0, start) + String(key) + groupText.slice(end);
    }
  }
  // 无 key 属性：在 `{` 之后插入
  const insertPos = obj.getStart(sourceFile) - WRAP_PREFIX.length + 1;
  return (
    groupText.slice(0, insertPos) +
    ` key: ${key},` +
    groupText.slice(insertPos)
  );
}

/**
 * 判断属性赋值节点的属性名是否为 `key`。
 */
function isKeyName(_ts: typeof ts, prop: ts.PropertyAssignment): boolean {
  return (
    (_ts.isIdentifier(prop.name) || _ts.isStringLiteral(prop.name)) &&
    prop.name.text === "key"
  );
}
