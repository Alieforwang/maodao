import React, { useEffect, useState } from "react";
import type { Account, Settings } from "../shared/types";
import type { OutlookFailure } from "../shared/outlookMailbox";
import { PROVIDERS } from "../shared/presets";

type Step = "start" | "device" | "working" | "mailbox" | "success" | "error" | "duplicate";

export function OutlookAdd({ account, settings, autoLogin, onClose }: { account?: Account; settings: Settings; autoLogin?: boolean; onClose: () => void }) {
  const api = window.madao!;
  const preset = PROVIDERS.outlook;
  const [step, setStep] = useState<Step>("start");
  const [host, setHost] = useState(account?.host || preset.host);
  const [port, setPort] = useState(String(account?.port || preset.port));
  const [alias, setAlias] = useState(account?.alias || "");
  const [mailbox, setMailbox] = useState(account?.email || "");
  const [loginName, setLoginName] = useState(account?.loginName || "");
  const [savedEmail, setSavedEmail] = useState(account?.email || "");
  const [accountId, setAccountId] = useState(account?.id || "");
  const [replaceId, setReplaceId] = useState(account?.id);
  const [progress, setProgress] = useState("");
  const [failure, setFailure] = useState<OutlookFailure | null>(null);
  const [device, setDevice] = useState<{ userCode: string; expiresIn: number } | null>(null);
  const [fixNote, setFixNote] = useState("");

  const begin = (mode: "pkce" | "device", nextReplaceId = replaceId) => {
    setFailure(null);
    setProgress(mode === "device" ? "正在获取设备码…" : "正在打开登录窗口…");
    setStep("working");
    void api.startOAuth(mode, { replaceId: nextReplaceId, host: host.trim(), port: Number(port) });
  };

  useEffect(() => api.onOAuth((event) => {
    if (event.type === "device") {
      setDevice({ userCode: event.userCode, expiresIn: event.expiresIn });
      setStep("device");
    } else if (event.type === "progress") {
      setProgress(event.message);
      setStep("working");
    } else if (event.type === "need-mailbox") {
      setLoginName(event.loginName);
      setMailbox(event.suggestion || "");
      setStep("mailbox");
    } else if (event.type === "duplicate") {
      setSavedEmail(event.email);
      setAccountId(event.accountId);
      setStep("duplicate");
    } else if (event.type === "success") {
      setSavedEmail(event.email);
      setLoginName(event.loginName || "");
      setAccountId(event.accountId);
      setStep("success");
    } else if (event.type === "error") {
      setFailure(event.failure);
      if (event.loginName) setLoginName(event.loginName);
      if (event.suggestion) setMailbox(event.suggestion);
      setStep("error");
    }
  }), [api]);

  useEffect(() => {
    if (autoLogin) begin("pkce");
    // The row action should start one login. Later retries call begin themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="outlook-flow">
      {step === "start" && (
        <>
          <button className="btn-primary" type="button" onClick={() => begin("pkce")}>{account ? "重新登录" : "登录 Microsoft 账号"}</button>
          <p className="hint">会打开微软官方登录页，码到不会看到你的密码。</p>
          <button className="text-link" type="button" onClick={() => begin("device")}>登录窗口打不开？改用设备码登录</button>
          {account && (
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="field wide">
                <label htmlFor="alias-now">备注名</label>
                <input id="alias-now" value={alias} placeholder="可留空，列表里仍会显示收信地址" onChange={(event) => setAlias(event.target.value)} />
              </div>
              <div className="field wide">
                <label htmlFor="fix-mail">收信地址</label>
                <input id="fix-mail" value={mailbox} onChange={(event) => setMailbox(event.target.value)} />
              </div>
            </div>
          )}
          {account && <p className="hint">现在用的是 {account.email}{account.loginName ? `，微软账号 ${account.loginName}` : ""}。地址能收信就可以不改。</p>}
          {fixNote && <p className="banner">{fixNote}</p>}
          {account && (
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => { void api.setAlias(account.id, alias); setFixNote("备注已保存。"); }}>保存备注</button>
              <button className="btn" type="button" onClick={() => void api.fixMailbox(account.id, mailbox).then((result) => setFixNote(result.ok ? `已改为 ${result.email}` : result.message))}>保存收信地址</button>
            </div>
          )}
        </>
      )}
      {step === "device" && device && <DeviceCode userCode={device.userCode} expiresIn={device.expiresIn} />}
      {step === "working" && <p className="hint">{progress || "正在登录…"}</p>}
      {step === "mailbox" && (
        <>
          <p>这个登录名不能直接收信。请填写 Outlook、Hotmail 或 Live 邮箱地址，码到会用刚才的登录再试一次。</p>
          {loginName && <p className="hint">微软账号：{loginName}</p>}
          <div className="field">
            <label htmlFor="mailbox">收信地址</label>
            <input id="mailbox" value={mailbox} placeholder="name@outlook.com" onChange={(event) => setMailbox(event.target.value)} />
          </div>
          <div className="dialog-actions">
            <button className="btn-primary" type="button" onClick={() => {
              setStep("working");
              setProgress("正在连接邮箱…");
              void api.submitMailbox(mailbox).then((result) => {
                if (!result.ok) {
                  setFailure({ code: "unknown", title: result.message || "没有正在进行的登录。", reasons: [], actions: ["retry"], raw: result.message || "" });
                  setStep("error");
                }
              });
            }}>用这个地址连接</button>
          </div>
        </>
      )}
      {step === "success" && (
        <>
          <p className="added">已添加：{savedEmail}{loginName ? `（微软账号：${loginName}）` : ""}</p>
          <div className="field">
            <label htmlFor="alias">备注名</label>
            <input id="alias" value={alias} placeholder="可留空" onChange={(event) => setAlias(event.target.value)} />
          </div>
          <div className="dialog-actions">
            <button className="btn-primary" type="button" onClick={() => { void api.setAlias(accountId, alias); onClose(); }}>完成</button>
          </div>
        </>
      )}
      {step === "duplicate" && (
        <>
          <p className="added">该邮箱已添加</p>
          <p className="hint">{savedEmail}</p>
          <div className="dialog-actions">
            <button className="btn-primary" type="button" onClick={() => { setReplaceId(accountId); begin("pkce", accountId); }}>重新登录</button>
          </div>
        </>
      )}
      {step === "error" && failure && (
        <>
          <p className="added">{failure.title}</p>
          {failure.reasons.length > 0 && <ul className="reasons">{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          <div className="dialog-actions">
            {failure.actions.includes("retry") && <button className="btn-primary" type="button" onClick={() => begin("pkce")}>重试</button>}
            {failure.actions.includes("device") && <button className="btn" type="button" onClick={() => begin("device")}>改用设备码登录</button>}
            {failure.actions.includes("new-code") && <button className="btn-primary" type="button" onClick={() => begin("device")}>获取新代码</button>}
            {failure.actions.includes("edit-mailbox") && <button className="btn" type="button" onClick={() => setStep("mailbox")}>修改收信地址</button>}
            {failure.actions.includes("reset-client") && <button className="btn" type="button" onClick={() => { void api.updateSettings({ outlookClientId: "", oauthRedirectUri: "" }); begin("pkce"); }}>恢复默认</button>}
          </div>
          {failure.raw && (
            <details className="advanced">
              <summary>详细信息</summary>
              <pre>{failure.raw}</pre>
            </details>
          )}
        </>
      )}
      {(step === "start" || step === "error") && (
        <details className="advanced">
          <summary>高级选项</summary>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="outlook-host">IMAP 服务器</label>
              <input id="outlook-host" value={host} onChange={(event) => setHost(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="outlook-port">端口</label>
              <input id="outlook-port" value={port} onChange={(event) => setPort(event.target.value)} />
            </div>
            <div className="field wide">
              <label htmlFor="outlook-client">自定义 Azure 客户端 ID</label>
              <input id="outlook-client" value={settings.outlookClientId} placeholder="一般不需要填写" onChange={(event) => void api.updateSettings({ outlookClientId: event.target.value.trim() })} />
            </div>
          </div>
          <p className="hint">留空时使用内置客户端，登录窗口的回调地址是 https://localhost。填写自己的客户端 ID 后，回调改为 http://127.0.0.1:45832/callback，需要和 Azure 里登记的一致。</p>
          <p><a href={preset.link} onClick={(event) => { event.preventDefault(); void api.openExternal(preset.link); }}>{preset.linkText}</a></p>
        </details>
      )}
    </div>
  );
}

function DeviceCode({ userCode, expiresIn }: { userCode: string; expiresIn: number }) {
  const api = window.madao!;
  const [left, setLeft] = useState(expiresIn);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setLeft(Math.max(0, expiresIn - Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresIn]);
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <div>
      <div className="device-code">{userCode}</div>
      <p className="hint">剩余 {minutes}:{seconds}。登录完成后会自动连接邮箱。</p>
      <button className="btn-primary" type="button" onClick={() => { void api.copyText(userCode); void api.openExternal("https://microsoft.com/link"); }}>复制代码并打开 microsoft.com/link</button>
    </div>
  );
}
