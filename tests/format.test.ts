import { describe, expect, it } from "vitest";
import { groupDisplay } from "../src/renderer/format";

describe("groupDisplay", () => {
  it("6 位纯数字按 3+3 分组", () => {
    expect(groupDisplay("738291")).toBe("738 291");
  });
  it("8 位纯数字按 4+4 分组", () => {
    expect(groupDisplay("12345678")).toBe("1234 5678");
  });
  it("已有分隔符的保持原样", () => {
    expect(groupDisplay("123-456")).toBe("123-456");
    expect(groupDisplay("123 456")).toBe("123 456");
  });
  it("字母数字码和短码不分组", () => {
    expect(groupDisplay("R7K2M9")).toBe("R7K2M9");
    expect(groupDisplay("4829")).toBe("4829");
  });
});
