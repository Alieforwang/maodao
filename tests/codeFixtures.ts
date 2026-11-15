import fs from "node:fs";
import path from "node:path";
import * as extract from "../src/shared/extract.js";

export interface CodeFixture {
  id: string;
  lang: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  expected: string | null;
  kind: "code" | "link" | "none";
  note?: string;
}

export function loadFixtures(): CodeFixture[] {
  const dir = path.join(process.cwd(), "tests/fixtures/codes");
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).flatMap((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as CodeFixture[]);
}

export function classifyFixture(sample: CodeFixture): { code: string | null; kind: "code" | "link" | "none"; confidence: string } {
  if ("extractFromMail" in extract && typeof extract.extractFromMail === "function") {
    const result = extract.extractFromMail({ subject: sample.subject, body: sample.text || "", html: sample.html, from: sample.from });
    return { code: result.confidence === "low" ? null : result.code, kind: result.kind, confidence: result.confidence };
  }
  const hit = extract.extractVerificationCode([sample.subject, sample.text || "", sample.html || ""].filter(Boolean).join("\n"));
  return { code: hit?.code ?? null, kind: hit ? "code" : "none", confidence: hit ? "high" : "low" };
}
