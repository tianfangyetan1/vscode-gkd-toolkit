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
  selector?: string | string[];
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
 * 在父对象中查找 matches、anyMatches 或 rules 属性作为选择器。
 * 单个选择器保持字符串形式，多个选择器以数组返回。
 */
function findSelectorInParentObject(
  _ts: typeof ts,
  property: ts.PropertyAssignment,
): string | string[] | undefined {
  const parent = property.parent;
  if (!_ts.isObjectLiteralExpression(parent)) {
    return undefined;
  }

  const rules = getStringProperty(parent, "rules");
  if (rules !== undefined) {
    return rules;
  }

  const getSelectors = (name: string): string[] | undefined => {
    const candidate = parent.properties.find(
      (item) =>
        _ts.isPropertyAssignment(item) && getPropertyName(item) === name,
    );
    if (!candidate || !_ts.isPropertyAssignment(candidate)) {
      return undefined;
    }

    const { initializer } = candidate;
    if (
      _ts.isStringLiteral(initializer) ||
      _ts.isNoSubstitutionTemplateLiteral(initializer)
    ) {
      return [initializer.text];
    }
    if (_ts.isArrayLiteralExpression(initializer)) {
      return extractStringValues(initializer);
    }
    return undefined;
  };

  // matches 和 anyMatches 都可能是单个字符串或字符串数组。
  for (const name of ["matches", "anyMatches"]) {
    const selectors = getSelectors(name)?.filter(
      (selector) => selector.trim().length > 0,
    );
    if (selectors?.length) {
      return selectors.length === 1 ? selectors[0] : selectors;
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
