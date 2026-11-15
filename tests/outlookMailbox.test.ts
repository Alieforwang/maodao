import { describe, expect, it } from "vitest";
import {
  chooseSavedMailbox,
  deviceCodeButtonLabel,
  duplicateOutlookMessage,
  findDuplicateOutlook,
  mergeOutlookAccounts,
  imapLoginUser,
  mapOutlookFailure,
  outlookDisplay,
  readIdentity,
} from "../src/shared/outlookMailbox.js";

describe("Outlook 收信地址", () => {
  it("QQ 注册的微软账号优先显示 outlook.com，副标题保留 QQ", () => {
    const plan = readIdentity({
      preferred_username: "example123@qq.com",
      email: "wzs.example@outlook.com",
    });
    expect(plan.tryOrder[0]).toBe("wzs.example@outlook.com");
    expect(plan.loginName).toBe("example123@qq.com");
    const saved = chooseSavedMailbox(plan, "wzs.example@outlook.com");
    expect(saved.email).toBe("wzs.example@outlook.com");
    const viaLogin = chooseSavedMailbox(plan, "example123@qq.com");
    expect(viaLogin).toMatchObject({ email: "wzs.example@outlook.com", imapUser: "example123@qq.com", loginName: "example123@qq.com" });
    expect(chooseSavedMailbox(plan, "typed@outlook.com", true).email).toBe("typed@outlook.com");
    expect(outlookDisplay({ ...saved, alias: "" })).toEqual({
      title: "wzs.example@outlook.com",
      mailbox: "wzs.example@outlook.com",
      microsoftAccount: "example123@qq.com",
    });
  });

  it("登录名本身是 Hotmail 时不再重复显示微软账号", () => {
    const plan = readIdentity({ preferred_username: "Person@Hotmail.com" });
    expect(plan.mailboxFromClaims).toBe("Person@Hotmail.com");
    const saved = chooseSavedMailbox(plan, "person@hotmail.com");
    expect(saved.loginName).toBeUndefined();
    expect(outlookDisplay(saved).microsoftAccount).toBeNull();
  });

  it("没有邮箱域名时仍会先尝试登录名，失败才交给用户填写", () => {
    const plan = readIdentity({ preferred_username: "someone@example.net" });
    expect(plan.mailboxFromClaims).toBeNull();
    expect(plan.tryOrder).toEqual(["someone@example.net"]);
  });

  it("备注名只改标题，收信地址仍然保留", () => {
    expect(outlookDisplay({ email: "wzs.example@outlook.com", loginName: "example123@qq.com", alias: "工作" })).toEqual({
      title: "工作",
      mailbox: "wzs.example@outlook.com",
      microsoftAccount: "example123@qq.com",
    });
  });

  it("1.0.5 已保存的账号不强制重登，登录名缺失时继续用原地址", () => {
    const legacy = { email: "old@outlook.com" };
    expect(imapLoginUser(legacy)).toBe("old@outlook.com");
    expect(outlookDisplay(legacy)).toEqual({ title: "old@outlook.com", mailbox: "old@outlook.com", microsoftAccount: null });
    expect(imapLoginUser({ email: "shown@outlook.com", imapUser: "login@qq.com" })).toBe("login@qq.com");
  });

  it("同一个收信地址不重复添加", () => {
    const accounts = [
      { id: "a", provider: "outlook", email: "Wzs.Example@outlook.com" },
      { id: "b", provider: "qq", email: "wzs.example@outlook.com" },
    ];
    expect(findDuplicateOutlook(accounts, "wzs.example@outlook.com")?.id).toBe("a");
    expect(findDuplicateOutlook(accounts, "wzs.example@outlook.com", "a")).toBeUndefined();
    const legacy = { id: "old", provider: "outlook", email: "example123@qq.com" };
    const fresh = { id: "new", provider: "outlook", email: "wzs.example@outlook.com", loginName: "example123@qq.com" };
    expect(findDuplicateOutlook([legacy], "wzs.example@outlook.com", undefined, "example123@qq.com")?.id).toBe("old");
    const merged = mergeOutlookAccounts([legacy, fresh]);
    expect(merged.accounts).toHaveLength(1);
    const kept = merged.accounts[0] as { email: string; loginName?: string; id: string };
    expect(kept.email).toBe("wzs.example@outlook.com");
    expect(kept.loginName).toBe("example123@qq.com");
    expect(kept.id).toBe("new");
    expect(merged.reassign.map((item) => item.from)).toContain("old");
  });
});

describe("重复账号和设备码按钮", () => {
  it("命中旧账号时同时写出已有登录名和这次的收信地址", () => {
    expect(duplicateOutlookMessage(
      { email: "example123@qq.com" },
      "wzs.example@outlook.com",
    )).toEqual([
      "已有账号：example123@qq.com",
      "这次登录的收信地址是 wzs.example@outlook.com，和已有账号是同一个微软账号。",
    ]);
    expect(duplicateOutlookMessage(
      { email: "wzs.example@outlook.com", loginName: "example123@qq.com" },
      "wzs.example@outlook.com",
    )).toEqual(["已有账号：wzs.example@outlook.com（微软账号：example123@qq.com）"]);
  });

  it("www.microsoft.com/link 也显示设备码页面的按钮文字", () => {
    expect(deviceCodeButtonLabel("https://www.microsoft.com/link")).toBe("复制代码并打开 microsoft.com/link");
    expect(deviceCodeButtonLabel("https://microsoft.com/link")).toBe("复制代码并打开 microsoft.com/link");
    expect(deviceCodeButtonLabel("https://login.microsoftonline.com/common/oauth2/deviceauth")).toBe("复制代码并打开登录页");
  });
});

describe("Outlook 错误文案", () => {
  it("取消、窗口、过期、邮箱、网络和自定义应用都有对应的下一步", () => {
    expect(mapOutlookFailure("登录窗口已关闭。", { stage: "login", customClient: false }).title).toBe("登录已取消");
    expect(mapOutlookFailure("登录窗口没打开", { stage: "login", customClient: false })).toMatchObject({
      title: "登录窗口没打开，可能是网络问题",
      actions: ["retry", "device"],
    });
    expect(mapOutlookFailure("code has expired", { stage: "device", customClient: false }).title).toBe("代码已过期");
    expect(mapOutlookFailure("AUTHENTICATIONFAILED", { stage: "imap", customClient: false }).title).toBe("微软账号登录成功，但无法连接邮箱");
    expect(mapOutlookFailure("getaddrinfo ENOTFOUND login.microsoftonline.com", { stage: "login", customClient: false }).title).toBe("无法连接微软服务器，请检查网络");
    expect(mapOutlookFailure("redirect_uri is not valid", { stage: "login", customClient: true })).toMatchObject({
      title: "自定义 Azure 应用配置有误",
      actions: expect.arrayContaining(["reset-client"]),
    });
  });
});
