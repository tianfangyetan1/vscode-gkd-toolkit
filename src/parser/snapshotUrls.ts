import type * as ts from "typescript";
import {
  getTs,
  getPropertyName,
  getStringProperty,
  extractStringValues,
} from "./utils";

export type SnapshotUrlsEntry = {
  propertyIndex: number;
  urls: string[];
  selector?: string;
};

/**
 * 扫描文本中的 snapshotUrls 属性，并提取其中合法 URL 与同对象选择器。
 *
 * @param sourceText 待扫描的源码文本。
 * @returns 按出现顺序提取出的 `snapshotUrls` 条目列表。
 */
export function findSnapshotUrlsEntries(
  sourceText: string,
): SnapshotUrlsEntry[] {
  const _ts = getTs();
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
      const selector = findSelectorInParentObject(_ts, node);
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
 * 在父对象中查找 rules 或 matches 字符串属性作为选择器。
 * 优先返回 rules，其次 matches。
 */
function findSelectorInParentObject(
  _ts: typeof ts,
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
