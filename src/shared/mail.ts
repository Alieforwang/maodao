import { simpleParser } from "mailparser";
import { htmlToText } from "./decode.js";

export interface ParsedMail {
  subject: string;
  from: string;
  text: string;
  messageId: string;
  date?: Date;
}

export async function parseRawMail(source: Buffer | string): Promise<ParsedMail> {
  const parsed = await simpleParser(source);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = [parsed.text || "", html ? htmlToText(html) : ""].filter(Boolean).join("\n");
  return {
    subject: parsed.subject || "",
    from: parsed.from?.text || "",
    text,
    messageId: parsed.messageId || "",
    date: parsed.date || undefined,
  };
}
