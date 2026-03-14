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
export function findSnapshotUrlsEntries(sourceText: string): SnapshotUrlsEntry[] {
	const entries: SnapshotUrlsEntry[] = [];
	const keyRegex = /snapshotUrls\s*:\s*/g;
	let match = keyRegex.exec(sourceText);
	while (match) {
		const valueStart = skipWhitespace(sourceText, keyRegex.lastIndex);
		const parsed = parseSnapshotUrlsValue(sourceText, valueStart);
		if (parsed) {
			const selector = findSelectorNearProperty(sourceText, match.index);
			entries.push({
				propertyIndex: match.index,
				urls: parsed.urls.filter(isValidHttpUrl),
				selector,
			});
			keyRegex.lastIndex = parsed.nextIndex;
		}
		match = keyRegex.exec(sourceText);
	}
	return entries;
}

/**
 * 解析 snapshotUrls 的值，支持字符串与数组两种字面量形式。
 *
 * @param sourceText 完整源码文本。
 * @param startIndex 属性值起始位置。
 * @returns 解析出的 URL 列表与下一个游标位置；无法解析时返回 `null`。
 */
export function parseSnapshotUrlsValue(sourceText: string, startIndex: number): { urls: string[]; nextIndex: number } | null {
	const startChar = sourceText[startIndex];
	if (!startChar) {
		return null;
	}

	if (startChar === '\'' || startChar === '"') {
		const quoted = readQuotedString(sourceText, startIndex);
		if (!quoted) {
			return null;
		}
		return { urls: [quoted.value], nextIndex: quoted.nextIndex };
	}

	if (startChar === '[') {
		const arrayLiteral = readArrayLiteral(sourceText, startIndex);
		if (!arrayLiteral) {
			return null;
		}
		return { urls: extractStringLiterals(arrayLiteral.value), nextIndex: arrayLiteral.nextIndex };
	}

	return null;
}

/**
 * 从指定位置开始跳过空白字符，返回第一个非空白字符索引。
 *
 * @param text 要处理的文本。
 * @param fromIndex 开始跳过空白的索引位置。
 * @returns 第一个非空白字符所在的索引。
 */
export function skipWhitespace(text: string, fromIndex: number): number {
	let cursor = fromIndex;
	while (cursor < text.length && /\s/.test(text[cursor])) {
		cursor += 1;
	}
	return cursor;
}

/**
 * 读取单/双引号包裹的字符串字面量，支持转义字符。
 *
 * @param text 要读取的文本。
 * @param startIndex 引号字符的起始索引。
 * @returns 解析出的字符串内容与结束后索引；解析失败时返回 `null`。
 */
export function readQuotedString(text: string, startIndex: number): { value: string; nextIndex: number } | null {
	const quote = text[startIndex];
	let cursor = startIndex + 1;
	let result = '';
	while (cursor < text.length) {
		const char = text[cursor];

		// 处理转义字符
		if (char === '\\') {
			const next = text[cursor + 1];
			if (next) {
				result += next;
				cursor += 2;
				continue;
			}
			return null;
		}

		if (char === quote) {
			return { value: result, nextIndex: cursor + 1 };
		}

		result += char;
		cursor += 1;
	}
	return null;
}

/**
 * 读取数组字面量文本。
 *
 * @param text 要读取的文本。
 * @param startIndex 数组开括号 `[` 的起始索引。
 * @returns 完整数组字面量文本与结束后索引；读取失败时返回 `null`。
 */
export function readArrayLiteral(text: string, startIndex: number): { value: string; nextIndex: number } | null {
	let cursor = startIndex + 1;
	let quote: '\'' | '"' | null = null;
	let inLineComment = false;
	let inBlockComment = false;
	while (cursor < text.length) {
		const char = text[cursor];
		const next = text[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (quote) {
			if (char === '\\') {
				cursor += 2;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			cursor += 1;
			continue;
		}

		if (char === ']') {
			return { value: text.slice(startIndex, cursor + 1), nextIndex: cursor + 1 };
		}

		cursor += 1;
	}
	return null;
}

/**
 * 从数组文本中提取全部字符串字面量内容。
 *
 * @param input 数组字面量文本。
 * @returns 提取出的非空字符串字面量列表。
 */
export function extractStringLiterals(input: string): string[] {
	const values: string[] = [];
	let cursor = 0;
	let inLineComment = false;
	let inBlockComment = false;

	while (cursor < input.length) {
		const char = input[cursor];
		const next = input[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			const quoted = readQuotedString(input, cursor);
			if (!quoted) {
				break;
			}
			const value = quoted.value.trim();
			if (value.length > 0) {
				values.push(value);
			}
			cursor = quoted.nextIndex;
			continue;
		}

		cursor += 1;
	}

	return values;
}

/**
 * 判断 URL 是否为可打开的 http/https 协议。
 *
 * @param url 待校验的 URL 字符串。
 * @returns 当 URL 为合法的 `http` 或 `https` 地址时返回 `true`。
 */
export function isValidHttpUrl(url: string): boolean {
	try {
		const value = new URL(url);
		return value.protocol === 'http:' || value.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * 基于 snapshotUrls 属性位置，向外定位其所属对象并提取选择器。
 *
 * @param sourceText 完整源码文本。
 * @param propertyIndex `snapshotUrls` 属性在源码中的位置。
 * @returns 找到的 `rules` 或 `matches` 选择器；未找到时返回 `undefined`。
 */
function findSelectorNearProperty(sourceText: string, propertyIndex: number): string | undefined {
	const objectLiteral = findEnclosingObjectLiteral(sourceText, propertyIndex);
	if (!objectLiteral) {
		return undefined;
	}
	return findStringPropertyFromObject(objectLiteral.value, 'rules') ?? findStringPropertyFromObject(objectLiteral.value, 'matches');
}

/**
 * 从属性索引向前回溯，找到包含该属性的最近对象字面量。
 *
 * @param text 要搜索的源码文本。
 * @param propertyIndex 属性在源码中的位置。
 * @returns 包含该属性的最近对象字面量；未找到时返回 `null`。
 */
function findEnclosingObjectLiteral(text: string, propertyIndex: number): { value: string; startIndex: number; nextIndex: number } | null {
	for (let cursor = propertyIndex; cursor >= 0; cursor -= 1) {
		if (text[cursor] !== '{') {
			continue;
		}
		const parsed = readObjectLiteral(text, cursor);
		if (parsed && parsed.nextIndex > propertyIndex) {
			return parsed;
		}
	}
	return null;
}

/**
 * 从给定 `{` 位置读取完整对象字面量，支持字符串与注释场景。
 *
 * @param text 要读取的文本。
 * @param startIndex 对象开括号 `{` 的起始索引。
 * @returns 完整对象字面量文本及其边界信息；读取失败时返回 `null`。
 */
function readObjectLiteral(text: string, startIndex: number): { value: string; startIndex: number; nextIndex: number } | null {
	let cursor = startIndex + 1;
	let quote: '\'' | '"' | null = null;
	let inLineComment = false;
	let inBlockComment = false;
	let depth = 1;

	while (cursor < text.length) {
		const char = text[cursor];
		const next = text[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (quote) {
			if (char === '\\') {
				cursor += 2;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			cursor += 1;
			continue;
		}

		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return { value: text.slice(startIndex, cursor + 1), startIndex, nextIndex: cursor + 1 };
			}
		}

		cursor += 1;
	}

	return null;
}

/**
 * 在对象顶层查找指定属性，且仅返回字符串字面量值。
 *
 * @param objectText 对象字面量文本。
 * @param propertyName 要查找的属性名。
 * @returns 属性对应的字符串字面量值；不存在或不是字符串时返回 `undefined`。
 */
function findStringPropertyFromObject(objectText: string, propertyName: 'rules' | 'matches'): string | undefined {
	let cursor = 1; // 跳过开头 {
	let braceDepth = 1;
	let bracketDepth = 0;
	let parenDepth = 0;
	let inLineComment = false;
	let inBlockComment = false;
	let quote: '\'' | '"' | null = null;

	while (cursor < objectText.length) {
		const char = objectText[cursor];
		const next = objectText[cursor + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			cursor += 1;
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				cursor += 2;
				continue;
			}
			cursor += 1;
			continue;
		}

		if (quote) {
			if (char === '\\') {
				cursor += 2;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			cursor += 1;
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			cursor += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inBlockComment = true;
			cursor += 2;
			continue;
		}

		if (char === '\'' || char === '"') {
			quote = char;
			cursor += 1;
			continue;
		}

		if (char === '{') {
			braceDepth += 1;
			cursor += 1;
			continue;
		}
		if (char === '}') {
			braceDepth -= 1;
			cursor += 1;
			continue;
		}
		if (char === '[') {
			bracketDepth += 1;
			cursor += 1;
			continue;
		}
		if (char === ']') {
			bracketDepth -= 1;
			cursor += 1;
			continue;
		}
		if (char === '(') {
			parenDepth += 1;
			cursor += 1;
			continue;
		}
		if (char === ')') {
			parenDepth -= 1;
			cursor += 1;
			continue;
		}

		if (braceDepth === 1 && bracketDepth === 0 && parenDepth === 0) {
			const parsed = parsePropertyAt(objectText, cursor);
			if (parsed) {
				if (parsed.key === propertyName && parsed.valueType === 'string') {
					return parsed.value;
				}
				cursor = parsed.nextIndex;
				continue;
			}
		}

		cursor += 1;
	}

	return undefined;
}

/**
 * 尝试从当前位置解析一个对象属性键值对（仅识别字符串值类型）。
 *
 * @param text 对象文本。
 * @param startIndex 尝试解析属性的起始索引。
 * @returns 解析出的属性信息；当前位置不是合法属性时返回 `null`。
 */
function parsePropertyAt(text: string, startIndex: number): { key: string; valueType: 'string' | 'other'; value?: string; nextIndex: number } | null {
	let cursor = startIndex;
	const keyToken = readPropertyKey(text, cursor);
	if (!keyToken) {
		return null;
	}

	cursor = skipWhitespace(text, keyToken.nextIndex);
	if (text[cursor] !== ':') {
		return null;
	}

	cursor = skipWhitespace(text, cursor + 1);
	const valueStart = text[cursor];
	if (valueStart === '\'' || valueStart === '"') {
		const quoted = readQuotedString(text, cursor);
		if (!quoted) {
			return null;
		}
		return { key: keyToken.key, valueType: 'string', value: quoted.value, nextIndex: quoted.nextIndex };
	}

	// 保持在值起始位置继续扫描，避免跳过 `[` / `{` / `(` 导致深度计数错位。
	return { key: keyToken.key, valueType: 'other', nextIndex: cursor };
}

/**
 * 解析对象属性名，支持标识符与引号字符串键。
 *
 * @param text 对象文本。
 * @param startIndex 属性名起始索引。
 * @returns 解析出的属性名与结束后索引；解析失败时返回 `null`。
 */
function readPropertyKey(text: string, startIndex: number): { key: string; nextIndex: number } | null {
	const char = text[startIndex];
	if (!char) {
		return null;
	}

	if (char === '\'' || char === '"') {
		const quoted = readQuotedString(text, startIndex);
		if (!quoted) {
			return null;
		}
		return { key: quoted.value, nextIndex: quoted.nextIndex };
	}

	if (!/[A-Za-z_$]/.test(char)) {
		return null;
	}

	let cursor = startIndex + 1;
	while (cursor < text.length && /[\w$]/.test(text[cursor])) {
		cursor += 1;
	}
	return { key: text.slice(startIndex, cursor), nextIndex: cursor };
}
