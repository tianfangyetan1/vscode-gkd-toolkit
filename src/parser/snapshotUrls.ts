import type * as ts from "typescript";

export type SnapshotUrlsEntry = {
  propertyIndex: number;
  urls: string[];
  selector?: string;
};

let _ts: typeof ts;

/**
 * 设置 TypeScript 模块实例（从工作区动态加载）。
 */
export function setTypeScriptModule(tsModule: typeof ts): void {
  _ts = tsModule;
}

/**
 * 扫描文本中的 snapshotUrls 属性，并提取其中合法 URL 与同对象选择器。
 *
 * @param sourceText 待扫描的源码文本。
 * @returns 按出现顺序提取出的 `snapshotUrls` 条目列表。
 */
export function findSnapshotUrlsEntries(
  sourceText: string,
): SnapshotUrlsEntry[] {
  const sourceFile = _ts.createSourceFile(
    "temp.ts",
    sourceText,
    _ts.ScriptTarget.Latest,
    true,
  );
  const entries: SnapshotUrlsEntry[] = [];

  function visit(node: ts.Node): void {
    if (
      _ts.isPropertyAssignment(node) &&
      getPropertyName(node) === "snapshotUrls"
    ) {
      const urls = extractStringValues(node.initializer).filter(isValidHttpUrl);
      const selector = findSelectorInParentObject(node);
      entries.push({
        propertyIndex: node.getStart(sourceFile),
        urls,
        selector,
      });
    }
    _ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return entries;
}

/**
 * 获取属性赋值节点的属性名。
 */
function getPropertyName(node: ts.PropertyAssignment): string | undefined {
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
 */
function extractStringValues(node: ts.Expression): string[] {
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
 * 在父对象中查找 rules 或 matches 字符串属性作为选择器。
 * 优先返回 rules，其次 matches。
 */
function findSelectorInParentObject(
  property: ts.PropertyAssignment,
): string | undefined {
  const parent = property.parent;
  if (!_ts.isObjectLiteralExpression(parent)) {
    return undefined;
  }
  return (
    getStringProperty(parent, "rules") ?? getStringProperty(parent, "matches")
  );
}

/**
 * 从对象字面量中获取指定名称的字符串属性值。
 */
function getStringProperty(
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
 * 判断 URL 是否为可打开的 http/https 协议。
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const value = new URL(url);
    return value.protocol === "http:" || value.protocol === "https:";
  } catch {
    return false;
  }
}
