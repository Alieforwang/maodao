export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function htmlToText(html: string): string {
  let text = html.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|h\d|li|table|blockquote)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  return decodeEntities(text).replace(/\u00a0/g, " ");
}

export function decodeQuotedPrintable(input: string): string {
  const cleaned = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === "=" && /[0-9A-Fa-f]{2}/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = cleaned.charCodeAt(i);
      bytes.push(code < 256 ? code : 0x3f);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export function decodeBase64Utf8(input: string): string {
  return Buffer.from(input.replace(/\s+/g, ""), "base64").toString("utf8");
}

export function decodeBody(input: string, transferEncoding?: string): string {
  const encoding = (transferEncoding || "").toLowerCase();
  if (encoding.includes("base64")) return decodeBase64Utf8(input);
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(input);
  return input;
}
