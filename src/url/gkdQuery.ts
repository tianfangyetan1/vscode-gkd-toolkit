/**
 * 将选择器编码为 Base64 字符串。
 * @param selector 要编码的选择器字符串。
 * @returns 编码后的 Base64 字符串。
 */
export function encodeSelectorToBase64(selector: string): string {
	return Buffer.from(selector, 'utf8').toString('base64');
}

/**
 * 向 URL 追加 gkd 查询参数。
 * @param url 要追加查询参数的原始 URL。
 * @param selector 要编码并写入 `gkd` 参数的选择器字符串。
 * @returns 追加参数后的 URL 字符串；如果传入的 URL 无效则返回 `null`。
 */
export function appendGkdParam(url: string, selector: string): string | null {
	try {
		const value = new URL(url);
		value.searchParams.set('gkd', encodeSelectorToBase64(selector));
		return value.toString();
	} catch {
		return null;
	}
}
