import React, { useEffect, useMemo, useState } from "react";
import type { Account, AccountDraft, AppState, ProviderId } from "../shared/types";
import { PROVIDER_LIST, PROVIDERS } from "../shared/presets";
import { GearIcon, HistoryIcon, MailIcon } from "./icons";
import { formatWhen, statusOf } from "./format";

type Page = "accounts" | "history" | "settings";
type DialogState = { title: string; account?: Account } | null;

export function App() {
  const api = window.madao;
  const [state, setState] = useState<AppState | null>(null);
  const [page, setPage] = useState<Page>("accounts");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!api) return;
    void api.getState().then(setState);
    return api.onState(setState);
  }, [api]);

  useEffect(() => {
    document.documentElement.dataset.theme = state?.theme || "light";
    document.documentElement.dataset.page = page;
  }, [state?.theme, page]);

  useEffect(() => {
    if (!state?.e2e) return;
    window.__madao = {
      openAdd: () => setDialog({ title: "添加账号" }),
      openSettings: () => { setDialog(null); setPage("settings"); },
      openAccounts: () => { setDialog(null); setPage("accounts"); },
    };
  }, [state?.e2e]);

  if (!api) return <p className="empty">请在码到桌面窗口里打开。</p>;
  if (!state) return <p className="empty">正在打开…</p>;
  const listening = state.statuses.filter((item) => item.state === "listening" || item.state === "polling").length;

  return (
    <div className="window">
      <div className="noise" />
      <header className="titlebar">
        <div className="appname"><span className="mark sm app">码</span>码到</div>
        <div className="caption">
          <button type="button" aria-label="最小化" onClick={() => api.windowControl("minimize")}><svg viewBox="0 0 10 10"><path d="M1 5h8" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
          <button type="button" aria-label="最大化" onClick={() => api.windowControl("maximize")}><svg viewBox="0 0 10 10"><rect x="1.2" y="1.2" width="7.6" height="7.6" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
          <button className="close" type="button" aria-label="关闭" onClick={() => api.windowControl("close")}><svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
        </div>
      </header>
      <div className="shell">
        <nav className="nav">
          <button type="button" data-nav="accounts" onClick={() => setPage("accounts")}><MailIcon />邮箱</button>
          <button type="button" data-nav="history" onClick={() => setPage("history")}><HistoryIcon />记录</button>
          <button type="button" data-nav="settings" onClick={() => setPage("settings")}><GearIcon />设置</button>
          <div className="nav-foot">{state.paused ? "监听已暂停" : `${listening} 个邮箱在监听`}<br />验证码不自动复制</div>
        </nav>
        <main className="content">
          {page === "accounts" && (
            <Accounts state={state} onAdd={() => setDialog({ title: "添加账号" })} onEdit={(account) => setDialog({ title: "编辑账号", account })} />
          )}
          {page === "history" && <History state={state} />}
          {page === "settings" && <Settings state={state} />}
        </main>
      </div>
      {dialog && <AccountDialog state={state} dialog={dialog} message={message} setMessage={setMessage} onClose={() => { setDialog(null); setMessage(""); api.cancelOAuth(); }} />}
    </div>
  );
}

function Accounts({ state, onAdd, onEdit }: { state: AppState; onAdd: () => void; onEdit: (account: Account) => void }) {
  const api = window.madao!;
  return (
    <div className="pane-accounts">
      {!state.encryptionAvailable && <p className="banner">这台系统现在不能加密保存授权码。码到不会把授权码明文写进磁盘，本次填写的授权码只留在内存里，退出后需要重新填写。Windows 上会使用 DPAPI。</p>}
      <div className="page-head">
        <div>
          <h1>邮箱</h1>
          <p className="lede">码到待在托盘里听新邮件。认出验证码后在右下角提醒，只有点通知或「复制」才会进剪贴板。</p>
        </div>
        <button className="btn-primary" type="button" onClick={onAdd}>添加账号</button>
      </div>
      {state.accounts.length === 0 ? (
        <p className="empty">还没有邮箱。添加后，码到会在后台听新邮件。</p>
      ) : (
        <div className="group">
          {state.accounts.map((account) => {
            const status = state.statuses.find((item) => item.accountId === account.id);
            const view = statusOf(status?.state, account.enabled && !state.paused, status?.detail || "");
            const preset = PROVIDERS[account.provider];
            return (
              <article className="account" key={account.id}>
                <Brand provider={account.provider} />
                <div>
                  <h2>{preset.name}</h2>
                  <div className="mail">{account.email}</div>
                  <div className="meta">
                    <i className={`dot ${view.kind}`} />
                    <span className={view.kind}>{view.label}{view.extra ? ` · ${view.extra}` : ""}</span>
                    <span>· {account.host}:{account.port} · {preset.hint}</span>
                  </div>
                </div>
                <button className="btn-quiet" type="button" onClick={() => onEdit(account)}>编辑</button>
                <button className={`switch ${account.enabled ? "on" : ""}`} type="button" aria-pressed={account.enabled} aria-label={`${account.enabled ? "暂停" : "启用"} ${preset.name}`} onClick={() => api.setEnabled(account.id, !account.enabled)}><i /></button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function History({ state }: { state: AppState }) {
  const api = window.madao!;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>记录</h1>
          <p className="lede">最近 20 条验证码。点一条或按「复制」才写入剪贴板，可以清空。</p>
        </div>
        <button className="btn" type="button" onClick={() => api.clearHistory()}>清空记录</button>
      </div>
      {state.history.length === 0 ? <p className="empty">还没有截到验证码。</p> : (
        <div className="hist-page">
          {state.history.map((item) => (
            <article className="hist-card" key={item.id}>
              <div className="code">{item.code}</div>
              <div className="who">{item.service} · {formatWhen(item.receivedAt)}</div>
              <button className="btn" type="button" onClick={() => api.copyCode(item.code, "history")}>复制</button>
              <div className="sub">{item.subject}</div>
              <div className="to">收件邮箱 · {item.email}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Settings({ state }: { state: AppState }) {
  const api = window.madao!;
  const settings = state.settings;
  const set = (patch: Partial<typeof settings>) => api.updateSettings(patch);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>设置</h1>
          <p className="lede">这些开关只影响这台电脑上的码到。</p>
        </div>
      </div>
      <section className="set-block">
        <h2>启动</h2>
        <div className="group">
          <SetRow title="开机自动启动" text="登录 Windows 后留在系统托盘，不打开主窗口。" on={settings.openAtLogin} onToggle={() => set({ openAtLogin: !settings.openAtLogin })} />
          <SetRow title="启动时不显示主窗口" text="需要看账号或记录时，再点托盘图标打开。" on={settings.startMinimized} onToggle={() => set({ startMinimized: !settings.startMinimized })} />
        </div>
      </section>
      <section className="set-block">
        <h2>通知</h2>
        <div className="group">
          <SetRow title="只提醒带验证码的邮件" text="关掉之后，每封新邮件都会在右下角弹出。认不出验证码的邮件默认不提醒。" on={settings.notifyOnlyCodes} onToggle={() => set({ notifyOnlyCodes: !settings.notifyOnlyCodes })} />
          <SetRow title="提示音" text="验证码通知出现时播放一声短促提示音。" on={settings.sound} onToggle={() => set({ sound: !settings.sound })} />
          <div className="set-row">
            <div>
              <h3>通知停留</h3>
              <p>时间到了自动收起。收起不会复制验证码。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="通知停留">
              {[15, 30, 0].map((value) => (
                <button key={value} type="button" className={settings.notificationSeconds === value ? "on" : ""} onClick={() => set({ notificationSeconds: value as 15 | 30 | 0 })}>{value === 0 ? "不自动关闭" : `${value} 秒`}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="set-block">
        <h2>识别</h2>
        <div className="group">
          <div className="set-row">
            <div>
              <h3>只处理刚到的新邮件</h3>
              <p>启动时不翻旧邮件，避免把历史验证码刷满屏幕。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="新邮件时间窗">
              {[3, 5, 10].map((value) => (
                <button key={value} type="button" className={settings.maxAgeMinutes === value ? "on" : ""} onClick={() => set({ maxAgeMinutes: value as 3 | 5 | 10 })}>{value} 分钟</button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="set-block">
        <h2>Outlook 登录</h2>
        <div className="group">
          <div className="set-row">
            <div style={{ flex: 1 }}>
              <h3>Azure 客户端 ID</h3>
              <p>个人 Outlook 要用你自己注册的免费应用。客户端 ID 不是密钥，可以保存在本机。</p>
              <div className="field" style={{ marginTop: 8 }}>
                <input value={settings.outlookClientId} placeholder="应用程序(客户端) ID" onChange={(event) => set({ outlookClientId: event.target.value.trim() })} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SetRow({ title, text, on, onToggle }: { title: string; text: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="set-row">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <button className={`switch ${on ? "on" : ""}`} type="button" aria-pressed={on} aria-label={title} onClick={onToggle}><i /></button>
    </div>
  );
}

function AccountDialog({ state, dialog, message, setMessage, onClose }: { state: AppState; dialog: { title: string; account?: Account }; message: string; setMessage: (value: string) => void; onClose: () => void }) {
  const api = window.madao!;
  const initial = dialog.account?.provider || "qq";
  const [provider, setProvider] = useState<ProviderId>(initial);
  const preset = PROVIDERS[provider];
  const [email, setEmail] = useState(dialog.account?.email || "");
  const [secret, setSecret] = useState("");
  const [host, setHost] = useState(dialog.account?.host || preset.host);
  const [port, setPort] = useState(String(dialog.account?.port || preset.port));
  const [oauthText, setOauthText] = useState("");
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => api.onOAuth((event) => {
    if (event.type === "device") setDevice({ userCode: event.userCode, verificationUri: event.verificationUri });
    if (event.type === "progress") setOauthText(event.message);
    if (event.type === "error") setOauthText(event.message);
    if (event.type === "success") onClose();
  }), [api, onClose]);

  const choose = (id: ProviderId) => {
    setProvider(id);
    if (!dialog.account) {
      setHost(PROVIDERS[id].host);
      setPort(String(PROVIDERS[id].port));
    }
  };

  const save = async () => {
    const draft: AccountDraft = {
      id: dialog.account?.id,
      provider,
      email,
      host,
      port: Number(port),
      secure: !host.includes("127.0.0.1"),
      secret,
    };
    const result = await api.saveAccount(draft);
    if (!result.ok) setMessage(result.message);
    else onClose();
  };

  const listening = useMemo(() => state.accounts.length, [state.accounts.length]);
  void listening;

  return (
    <div className="dialog-layer" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h1 id="dialog-title">{dialog.title}</h1>
        <p className="lede">选邮箱类型后自动填写服务器。授权码只加密存在这台电脑上。</p>
        <div className="providers">
          {PROVIDER_LIST.map((item) => (
            <button key={item.id} className={`provider ${provider === item.id ? "on" : ""}`} type="button" onClick={() => choose(item.id)}>
              <Brand provider={item.id} size="md" />
              <b>{item.name}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <div className="field wide">
            <label htmlFor="email">邮箱地址</label>
            <input id="email" value={email} placeholder={preset.placeholder} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {preset.authMethod === "password" && (
            <div className="field wide">
              <label htmlFor="secret">{preset.secretLabel}</label>
              <input id="secret" type="password" value={secret} placeholder={dialog.account ? "留空则保持原来的授权码" : "不是邮箱登录密码"} onChange={(event) => setSecret(event.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="host">IMAP 服务器</label>
            <input id="host" value={host} onChange={(event) => setHost(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="port">端口</label>
            <input id="port" value={port} onChange={(event) => setPort(event.target.value)} />
          </div>
        </div>
        {preset.authMethod === "oauth" && (
          <div className="oauth-box" style={{ display: "block" }}>
            <p>Outlook、Hotmail 个人账号已经不能用密码登录 IMAP。填好设置里的客户端 ID 后，用系统浏览器或设备码登录。</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" type="button" onClick={() => api.startOAuth("pkce")}>用浏览器登录</button>
              <button className="btn" type="button" onClick={() => api.startOAuth("device")}>用设备码登录</button>
            </div>
            {device && (
              <div>
                <div className="device-code">{device.userCode}</div>
                <p>打开 {device.verificationUri} ，输入上面的代码。</p>
                <button className="btn" type="button" onClick={() => api.copyText(device.userCode)}>复制设备码</button>
              </div>
            )}
            {oauthText && <p>{oauthText}</p>}
          </div>
        )}
        <div className="guide">
          <h2>{preset.guideTitle}</h2>
          <ol>{preset.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <p style={{ margin: "8px 0 0" }}><a href={preset.link} onClick={(event) => { event.preventDefault(); void api.openExternal(preset.link); }}>{preset.linkText}</a></p>
        </div>
        {message && <p className="banner">{message}</p>}
        <div className="dialog-actions">
          {dialog.account && (
            <button className="btn-quiet" type="button" onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              void api.deleteAccount(dialog.account!.id).then(onClose);
            }}>{confirmDelete ? "再点一次确认删除" : "删除账号"}</button>
          )}
          <button className="btn" type="button" onClick={onClose}>取消</button>
          {preset.authMethod === "password" && <button className="btn-primary" type="button" onClick={() => void save()}>保存并连接</button>}
        </div>
      </div>
    </div>
  );
}

function Brand({ provider, size = "lg" }: { provider: ProviderId; size?: "md" | "lg" }) {
  if (provider === "gmail") {
    return <span className={`mark ${size} gmail`} aria-hidden="true"><span>G</span></span>;
  }
  const preset = PROVIDERS[provider];
  return <span className={`mark ${size} ${provider}`} aria-hidden="true">{preset.letter}</span>;
}
