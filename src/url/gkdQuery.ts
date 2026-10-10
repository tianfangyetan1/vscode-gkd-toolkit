import { deflateRawSync } from "node:zlib";

/**
 * 解码 url-safe Base64 字符串
 *
 * 编码方将标准 Base64 的 `+` 替换为 `-`、`/` 替换为 `_`、并去掉了 `=` 填充；
 * 此处反向还原：`-`→`+`、`_`→`/`，按长度补足 `=` 填充，再按 UTF-8 解码。
 *
 * @param value url-safe Base64 字符串。
 * @returns 解码后的 UTF-8 字符串；解码失败时返回 `null`。
 */
export function decodeBase64FromUrlSafe(value: string): string | null {
  try {
    let base64 = value.replaceAll("-", "+").replaceAll("_", "/");
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

const MAX_SNAPSHOT_URL_QUERY_SIZE = 20;
const MAX_SNAPSHOT_URL_STATE_LENGTH = 8192;
const MAX_DECODED_STATE_SIZE = 32 * 1024;
const COMPRESSION_THRESHOLD = 96;

/**
 * 生成新版 GKD 快照审查工具使用的 state 参数。
 * 查询历史按最近查询优先保存，因此需要反转规则中的选择器顺序。
 */
export function appendSnapshotStateParam(
  url: string,
  selectors: readonly string[],
): string | null {
  try {
    const value = new URL(url);
    const uniqueSelectors = [
      ...new Set(selectors.filter((selector) => selector.trim().length > 0)),
    ];

    if (
      uniqueSelectors.length === 0 ||
      uniqueSelectors.length > MAX_SNAPSHOT_URL_QUERY_SIZE
    ) {
      return null;
    }

    // [focusNodeId, queries]；1 表示选择器查询。插件无法预知节点 ID，故焦点节点为 null。
    const rawBytes = Buffer.from(
      JSON.stringify([
        null,
        [...uniqueSelectors].reverse().map((selector) => [1, selector]),
      ]),
      "utf8",
    );

    if (rawBytes.byteLength > MAX_DECODED_STATE_SIZE) {
      return null;
    }

    let body = rawBytes;
    let compressed = false;

    if (rawBytes.byteLength >= COMPRESSION_THRESHOLD) {
      const compressedBytes = deflateRawSync(rawBytes);
      if (compressedBytes.byteLength < rawBytes.byteLength) {
        body = compressedBytes;
        compressed = true;
      }
    }

    // 状态版本 1 占高位，最低位表示内容是否经过 deflate-raw 压缩。
    const header = Buffer.from([(1 << 1) | Number(compressed)]);
    const encoded = Buffer.concat([header, body]).toString("base64url");

    if (encoded.length > MAX_SNAPSHOT_URL_STATE_LENGTH) {
      return null;
    }

    // state 是新版参数；移除旧 gkd 参数，避免同一链接包含两套查询状态。
    value.searchParams.delete("gkd");
    value.searchParams.set("state", encoded);
    return value.toString();
  } catch {
    return null;
  }
}
