/**
 * 将选择器编码为 Base64 字符串。
 * @param selector 要编码的选择器字符串。
 * @returns 编码后的 Base64 字符串。
 */
export function encodeSelectorToBase64(selector: string): string {
  return Buffer.from(selector, "utf8").toString("base64");
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
    let selectorEncoding = encodeSelectorToBase64(selector)
      .replaceAll("+", "-")
      .replaceAll("=", "");
    value.searchParams.set("gkd", selectorEncoding);
    return value.toString();
  } catch {
    return null;
  }
}

/**
 * 解码 url-safe Base64 字符串（与 {@link appendGkdParam} 的编码约定对称）。
 *
 * 编码方将标准 Base64 的 `+` 替换为 `-`、并去掉了 `=` 填充；
 * 此处反向还原：`-`→`+`，按长度补足 `=` 填充，再按 UTF-8 解码。
 *
 * @param value url-safe Base64 字符串。
 * @returns 解码后的 UTF-8 字符串；解码失败时返回 `null`。
 */
export function decodeBase64FromUrlSafe(value: string): string | null {
  try {
    let base64 = value.replaceAll("-", "+");
    const padding = base64.length % 4;
    if (padding === 1) {
      // 长度对 4 取余为 1 的 Base64 不合法
      return null;
    }
    if (padding > 0) {
      base64 += "=".repeat(4 - padding);
    }
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
}
