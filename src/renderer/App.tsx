import React, { useEffect, useMemo, useState } from "react";
import type { Account, AccountDraft, AppState, ProviderId } from "../shared/types";
import { PROVIDER_LIST, PROVIDERS, stripCredentialWhitespace } from "../shared/presets";
import { GearIcon, HistoryIcon, InboxIcon, MailIcon } from "./icons";
import { AllMail } from "./AllMail";
import { formatWhen, remainText, statusOf } from "./format";
import { AI_PRESETS } from "../shared/aiRecognize";
import brandIcon from "./brand/icon-32.png";
import appIcon from "../../resources/icon.png";
import { outlookDisplay } from "../shared/outlookMailbox";
import { OutlookAdd } from "./OutlookAdd";

type Page = "overview" | "accounts" | "history" | "mail" | "settings";
type DialogState = { title: string; account?: Account; autoLogin?: boolean } | null;

export function App() {
  const api = window.madao;
  const [state, setState] = useState<AppState | null>(null);
  const [page, setPage] = useState<Page>("overview");
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
        <div className="appname"><img className="brand-icon" src={brandIcon} alt="" />码到</div>
        <div className="caption">
          <button type="button" aria-label="最小化" onClick={() => api.windowControl("minimize")}><svg viewBox="0 0 10 10"><path d="M1 5h8" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
          <button type="button" aria-label="最大化" onClick={() => api.windowControl("maximize")}><svg viewBox="0 0 10 10"><rect x="1.2" y="1.2" width="7.6" height="7.6" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
          <button className="close" type="button" aria-label="关闭" onClick={() => api.windowControl("close")}><svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1" /></svg></button>
        </div>
      </header>
      <div className="shell">
        <nav className="nav">
          <button type="button" data-nav="overview" onClick={() => setPage("overview")}><InboxIcon />概览</button>
          <button type="button" data-nav="accounts" onClick={() => setPage("accounts")}><MailIcon />邮箱</button>
          <button type="button" data-nav="history" onClick={() => setPage("history")}><HistoryIcon />记录</button>
          <button type="button" data-nav="mail" onClick={() => setPage("mail")}><InboxIcon />全部邮件</button>
          <button type="button" data-nav="settings" onClick={() => setPage("settings")}><GearIcon />设置</button>
          <div className="nav-foot">{state.paused ? "监听已暂停" : `${listening} 个邮箱在监听`}<br />{state.settings.muteUntil > Date.now() ? <span className="mute-note">静默中 · {remainText(state.settings.muteUntil)}后恢复提醒</span> : "验证码不自动复制"}</div>
        </nav>
        <main className="content">
          {page === "overview" && (
            <Overview state={state} onAdd={() => setDialog({ title: "添加账号" })} onRelogin={(account) => setDialog({ title: "重新登录", account, autoLogin: true })} onGo={setPage} />
          )}
          {page === "accounts" && (
            <Accounts state={state} onAdd={() => setDialog({ title: "添加账号" })} onEdit={(account) => setDialog({ title: "编辑账号", account })} onRelogin={(account) => setDialog({ title: "重新登录", account, autoLogin: true })} />
          )}
          {page === "history" && <History state={state} />}
          {page === "mail" && <AllMail state={state} />}
          {page === "settings" && <Settings state={state} />}
        </main>
      </div>
      {dialog && <AccountDialog state={state} dialog={dialog} message={message} setMessage={setMessage} onClose={() => { setDialog(null); setMessage(""); api.cancelOAuth(); }} />}
    </div>
  );
}

function FirstRunGuide({ onAdd }: { onAdd: () => void }) {
  const api = window.madao!;
  return (
    <section className="ov-hero">
      <div className="ov-hero-label">第一次使用 · 三步就绪</div>
      <ol className="guide-steps">
        <li>
          <div><strong>添加你的第一个邮箱</strong><p>QQ / 163 / 126 用授权码，Outlook / Gmail 走网页登录。添加完码到就开始监听。</p></div>
          <button className="btn primary" type="button" onClick={onAdd}>添加邮箱</button>
        </li>
        <li>
          <div><strong>发一条测试通知</strong><p>先确认弹窗位置、提示音都对，不用等真验证码来才发现没声音。</p></div>
          <button className="btn" type="button" onClick={() => void api.sendTestNotification()}>发送测试通知</button>
        </li>
        <li>
          <div><strong>记住快捷键 Ctrl+Shift+V</strong><p>以后在任何软件里按它，最新验证码直接进剪贴板，连通知都不用点。</p></div>
        </li>
      </ol>
    </section>
  );
}

function Overview({ state, onAdd, onRelogin, onGo }: { state: AppState; onAdd: () => void; onRelogin: (account: Account) => void; onGo: (page: Page) => void }) {
  const api = window.madao!;
  const [copied, setCopied] = useState(false);
  const [now] = useState(Date.now());
  const latest = state.history[0];
  const listeningCount = state.statuses.filter((item) => item.state === "listening" || item.state === "polling").length;
  const broken = state.accounts.filter((account) => {
    const status = state.statuses.find((item) => item.accountId === account.id);
    return status && (status.state === "auth_failed" || status.state === "error");
  });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = state.history.filter((item) => item.receivedAt >= todayStart.getTime()).length;
  const latestExpired = Boolean(latest?.expiresAt && latest.expiresAt <= now);
  const copyLatest = () => {
    if (!latest) return;
    void api.copyCode(latest.code, "history").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <p className="lede">{state.paused ? "监听已暂停，新邮件不会被检查。" : listeningCount > 0 ? `${listeningCount} 个邮箱在监听，验证码会弹到屏幕右下角。` : "还没有邮箱在监听，先去添加一个邮箱。"}</p>
        </div>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="btn" type="button" onClick={() => void api.sendTestNotification()}>发送测试通知</button>
          {state.settings.muteUntil > now
            ? <button className="btn" type="button" onClick={() => void api.setMuted(0)}>取消静默</button>
            : <button className="btn" type="button" onClick={() => void api.setMuted(30)}>静默 30 分钟</button>}
        </span>
      </div>

      {state.accounts.length === 0 && <FirstRunGuide onAdd={onAdd} />}

      {broken.length > 0 && (
        <div className="ov-alert">
          <strong>{broken.length} 个邮箱需要处理</strong>
          {broken.map((account) => {
            const status = state.statuses.find((item) => item.accountId === account.id);
            return (
              <div className="ov-alert-row" key={account.id}>
                <span>{account.email} · {status?.detail || "连接异常"}，这个邮箱的验证码会漏检</span>
                {account.provider === "outlook"
                  ? <button className="btn" type="button" onClick={() => onRelogin(account)}>重新登录</button>
                  : <button className="btn" type="button" onClick={() => onGo("accounts")}>去邮箱页处理</button>}
              </div>
            );
          })}
        </div>
      )}

      {latest ? (
        <section className={`ov-hero ${latestExpired ? "expired" : ""}`}>
          <div className="ov-hero-label">最新验证码 · {latest.service} · {formatWhen(latest.receivedAt, now)}{latest.expiresAt ? ` · ${remainText(latest.expiresAt, now)}` : ""}</div>
          <div className="ov-hero-code">{latest.code}</div>
          <div className="ov-hero-sub">{latest.subject} · 收件 {latest.email}</div>
          <div className="ov-hero-actions">
            <button className={`btn primary ${copied ? "copied" : ""}`} type="button" onClick={copyLatest}>{copied ? "已复制 ✓" : "复制验证码"}</button>
            <span className="ov-hint">在任何软件里按 Ctrl+Shift+V 也能复制（自动跳过已过期的）</span>
          </div>
        </section>
      ) : (
        <section className="ov-hero">
          <div className="ov-hero-label">最新验证码</div>
          <p className="empty" style={{ textAlign: "left", margin: "10px 0 4px" }}>还没有截到验证码。收到后这里会显示最新一条，不用再去翻记录页。</p>
        </section>
      )}

      <div className="ov-stats">
        <div className="ov-stat"><strong>{todayCount}</strong><span>今日截获（近 7 天记录内）</span></div>
        <div className="ov-stat"><strong>{listeningCount} / {state.accounts.length}</strong><span>邮箱在监听</span></div>
        <div className="ov-stat"><strong>{state.history.length}</strong><span>记录保留（7 天 / 200 条）</span></div>
        <div className="ov-stat"><strong>{broken.length}</strong><span>异常邮箱</span></div>
      </div>

      {state.history.length > 1 && (
        <>
          <div className="hist-day">最近验证码</div>
          <div className="hist-page">
            {state.history.slice(1, 5).map((item) => (
              <article className={`hist-card ${item.expiresAt && item.expiresAt <= now ? "expired" : ""}`} key={item.id}>
                <div className="code">{item.code}</div>
                <div className="who">{item.service} · {formatWhen(item.receivedAt, now)}</div>
                <button className="btn" type="button" onClick={() => void api.copyCode(item.code, "history")}>复制</button>
                <div className="sub">{item.subject}</div>
                <div className="to">收件邮箱 · {item.email}</div>
              </article>
            ))}
          </div>
          <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={() => onGo("history")}>查看全部记录</button>
        </>
      )}
    </div>
  );
}

function Accounts({ state, onAdd, onEdit, onRelogin }: { state: AppState; onAdd: () => void; onEdit: (account: Account) => void; onRelogin: (account: Account) => void }) {
  const api = window.madao!;
  const [copiedLatest, setCopiedLatest] = useState(false);
  const listeningCount = state.statuses.filter((item) => item.state === "listening" || item.state === "polling").length;
  const brokenCount = state.statuses.filter((item) => item.state === "auth_failed" || item.state === "error").length;
  const latest = state.history[0];
  const copyLatest = () => {
    if (!latest) return;
    void api.copyCode(latest.code, "history").then(() => {
      setCopiedLatest(true);
      setTimeout(() => setCopiedLatest(false), 1400);
    });
  };
  return (
    <div className="pane-accounts">
      {!state.encryptionAvailable && <p className="banner">这台系统现在不能加密保存授权码。码到不会把授权码明文写进磁盘，本次填写的授权码只留在内存里，退出后需要重新填写。Windows 上会使用 DPAPI。</p>}
      <div className="overview">
        <span className="ov-status"><span className={`pulse-dot ${state.paused || listeningCount === 0 ? "off" : ""}`} />{state.paused ? "监听已暂停" : listeningCount > 0 ? `${listeningCount} 个邮箱在监听` : "还没有邮箱在监听"}</span>
        {brokenCount > 0 && <span className="ov-bad">{brokenCount} 个邮箱登录失效或异常，见下方列表</span>}
        {latest ? (
          <span className="ov-latest">最新验证码 <span className="ov-code">{latest.code}</span> {latest.service} · {formatWhen(latest.receivedAt)}
            <button className={`mini-copy ${copiedLatest ? "copied" : ""}`} type="button" onClick={copyLatest}>{copiedLatest ? "已复制 ✓" : "复制"}</button>
          </span>
        ) : <span className="ov-latest">还没有截到验证码，收到后会弹到屏幕右下角。</span>}
      </div>
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
            const shown = account.provider === "outlook" ? outlookDisplay(account) : null;
            const needsRelogin = account.provider === "outlook" && status?.state === "auth_failed";
            return (
              <article className="account" key={account.id}>
                <Brand provider={account.provider} />
                <div>
                  <h2>{shown ? shown.title : preset.name}</h2>
                  {shown ? (shown.title !== shown.mailbox && <div className="mail">{shown.mailbox}</div>) : <div className="mail">{account.email}</div>}
                  {shown?.microsoftAccount && <div className="mail">微软账号：{shown.microsoftAccount}</div>}
                  <div className="meta">
                    <i className={`dot ${needsRelogin ? "bad" : view.kind}`} />
                    <span className={needsRelogin ? "bad" : view.kind}>{needsRelogin ? "需要重新登录" : view.label}{!needsRelogin && view.extra ? ` · ${view.extra}` : ""}</span>
                    <span>· {account.host}:{account.port} · {preset.hint}</span>
                  </div>
                  {needsRelogin && <button className="btn" type="button" style={{ marginTop: 8 }} onClick={() => onRelogin(account)}>重新登录</button>}
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

function dayLabel(timestamp: number): string {
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  return `${day.getMonth() + 1} 月 ${day.getDate()} 日`;
}

function History({ state }: { state: AppState }) {
  const api = window.madao!;
  const [copiedId, setCopiedId] = useState("");
  const [query, setQuery] = useState("");
  const [now] = useState(Date.now());
  const copy = (id: string, code: string) => {
    void api.copyCode(code, "history").then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? "" : current)), 1400);
    });
  };
  const needle = query.trim().toLowerCase();
  const visible = state.history.filter((item) => !needle || `${item.service} ${item.subject} ${item.email} ${item.code}`.toLowerCase().includes(needle));
  const groups: Array<{ label: string; items: typeof visible }> = [];
  for (const item of visible) {
    const label = dayLabel(item.receivedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>记录</h1>
          <p className="lede">保留最近 7 天、最多 200 条验证码。点「复制」才写入剪贴板；过期的会标出来。在任何软件里按 Ctrl+Shift+V 复制最新一条未过期的。</p>
        </div>
        <button className="btn" type="button" onClick={() => api.clearHistory()}>清空记录</button>
      </div>
      <label className="field hist-search">
        <span>搜索</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按服务、标题、邮箱或验证码搜索" />
      </label>
      {state.history.length === 0 ? <p className="empty">还没有截到验证码。</p> : visible.length === 0 ? <p className="empty">没有匹配「{query}」的记录。</p> : (
        groups.map((group) => (
          <div key={group.label}>
            <div className="hist-day">{group.label}</div>
            <div className="hist-page">
              {group.items.map((item) => {
                const expired = Boolean(item.expiresAt && item.expiresAt <= now);
                return (
                  <article className={`hist-card ${expired ? "expired" : ""}`} key={item.id}>
                    <div className="code">{item.code}</div>
                    <div className="who">{item.service} · {formatWhen(item.receivedAt, now)}</div>
                    <button className={`btn ${copiedId === item.id ? "copied" : ""}`} type="button" onClick={() => copy(item.id, item.code)}>{copiedId === item.id ? "已复制 ✓" : "复制"}</button>
                    <div className="sub">{item.subject}</div>
                    <div className="to">收件邮箱 · {item.email}</div>
                    <div className="to" style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {item.copiedAt && <span className="tag ok">已复制</span>}
                      {item.expiresAt ? (expired ? <span className="tag bad">已过期</span> : <span className="tag">{remainText(item.expiresAt, now)}</span>) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))
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
        <div className="group">
          <div className="set-row">
            <div className="about-id">
              <img className="app-icon" src={appIcon} alt="" />
              <div>
                <h3>码到 MaoDao</h3>
                <p>当前版本 {state.version} · {state.update.message}</p>
              </div>
            </div>
            <button className="btn" type="button" onClick={() => void api.checkForUpdates()}>检查更新</button>
          </div>
        </div>
      </section>
      <section className="set-block">
        <h2>外观</h2>
        <div className="group">
          <div className="set-row">
            <div>
              <h3>主题</h3>
              <p>浅色（日间）和深色样式都内置了。跟随系统时，Windows 切换深浅色，这边会一起变。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="主题">
              {([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as const).map(([value, label]) => (
                <button key={value} type="button" className={settings.themeMode === value ? "on" : ""} onClick={() => set({ themeMode: value })}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
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
              <h3>静默模式</h3>
              <p>{settings.muteUntil > Date.now() ? `静默中，${remainText(settings.muteUntil)}后恢复提醒。这段时间的新码照常记录，只是不弹窗不发声。` : "开会、共享屏幕时用：选一段时间，新码照常记录和监听，只是不弹窗不发声。和「暂停监听」不同，暂停是真的断开连接。"}</p>
            </div>
            {settings.muteUntil > Date.now() ? (
              <button className="btn" type="button" onClick={() => void api.setMuted(0)}>取消静默</button>
            ) : (
              <span style={{ display: "flex", gap: 6 }}>
                <button className="btn" type="button" onClick={() => void api.setMuted(30)}>30 分钟</button>
                <button className="btn" type="button" onClick={() => void api.setMuted(60)}>1 小时</button>
                <button className="btn" type="button" onClick={() => void api.setMuted(180)}>3 小时</button>
              </span>
            )}
          </div>
          <div className="set-row">
            <div>
              <h3>测试通知</h3>
              <p>用一条假验证码走一遍完整弹窗，确认位置、提示音和复制都正常。不会记入记录。</p>
            </div>
            <button className="btn" type="button" onClick={() => void api.sendTestNotification()}>发送测试通知</button>
          </div>
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
        <h2>验证码</h2>
        <div className="group">
          <SetRow title="全局快捷键复制最新验证码" text="在任何软件里按 Ctrl+Shift+V，最新一条验证码直接写入剪贴板，不用去点通知。被其他软件占用时不会生效，可在这里关掉。" on={settings.hotkeyCopyLatest} onToggle={() => set({ hotkeyCopyLatest: !settings.hotkeyCopyLatest })} />
          <div className="set-row">
            <div>
              <h3>复制后自动清空剪贴板</h3>
              <p>验证码留在剪贴板里会被其他软件读到。时间到时如果剪贴板里还是这个码，就自动清掉；你期间复制了别的东西不会动。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="剪贴板自动清空">
              {[0, 1, 5, 10].map((value) => (
                <button key={value} type="button" className={settings.clipboardClearMinutes === value ? "on" : ""} onClick={() => set({ clipboardClearMinutes: value as 0 | 1 | 5 | 10 })}>{value === 0 ? "不清理" : `${value} 分钟`}</button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div>
              <h3>新邮件时间窗</h3>
              <p>启动和重连时，只补拉这个时间窗内到达的验证码，太旧的不再弹。窗口越大越不容易漏（比如电脑睡了一觉），代价是可能把已经在别处用过的码再弹一次——有过期标记的会自动跳过。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="新邮件时间窗">
              {[3, 5, 10, 15, 30, 60].map((value) => (
                <button key={value} type="button" className={settings.maxAgeMinutes === value ? "on" : ""} onClick={() => set({ maxAgeMinutes: value as 3 | 5 | 10 | 15 | 30 | 60 })}>{value} 分钟</button>
              ))}
            </div>
          </div>
          <SetRow title="顺带巡查垃圾箱" text="有些验证码会被邮箱误投到垃圾箱。每 5 分钟用一条临时连接扫一眼垃圾箱最近的邮件，捞到了照常提醒并标注「来自垃圾箱」。服务器没有垃圾箱时自动跳过。" on={settings.watchJunkFolder} onToggle={() => set({ watchJunkFolder: !settings.watchJunkFolder })} />
        </div>
      </section>
      <section className="set-block">
        <h2>存储</h2>
        <div className="group">
          <div className="set-row">
            <div>
              <h3>邮件保留天数</h3>
              <p>「全部邮件」在本机保留多久，超期自动清掉。记录（验证码历史）固定保留 7 天。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="邮件保留天数">
              {[7, 30, 90].map((value) => (
                <button key={value} type="button" className={settings.mailRetentionDays === value ? "on" : ""} onClick={() => set({ mailRetentionDays: value as 7 | 30 | 90 })}>{value} 天</button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div>
              <h3>每个邮箱保留封数</h3>
              <p>单个邮箱在本机最多留多少封邮件，超出的从最旧的开始清。</p>
            </div>
            <div className="segment" role="radiogroup" aria-label="每个邮箱保留封数">
              {[200, 500, 1000].map((value) => (
                <button key={value} type="button" className={settings.mailRetentionCount === value ? "on" : ""} onClick={() => set({ mailRetentionCount: value as 200 | 500 | 1000 })}>{value} 封</button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="set-block">
        <h2>AI 识别</h2>
        <div className="group">
          <SetRow title="启用 AI 识别" text="默认关闭。规则已经很有把握时不会调用。只有把握不够，或什么都没认出时才问模型。" on={settings.aiEnabled} onToggle={() => set({ aiEnabled: !settings.aiEnabled })} />
          <div className="set-row">
            <div style={{ flex: 1 }}>
              <h3>服务商</h3>
              <p>接口地址按公开文档预填。模型名没有在这台机器上实际调用过，测试失败时改成控制台里的名字。</p>
              <div className="segment" role="radiogroup" aria-label="AI 服务商" style={{ marginTop: 8 }}>
                {AI_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" className={settings.aiPreset === preset.id ? "on" : ""} onClick={() => set({ aiPreset: preset.id, aiBaseUrl: preset.baseUrl, aiModel: preset.model })}>{preset.name}</button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="ai-url">接口根地址</label>
                <input id="ai-url" value={settings.aiBaseUrl} placeholder="https://example.com/v1" onChange={(event) => set({ aiBaseUrl: event.target.value.trim(), aiPreset: "custom" })} />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="ai-model">模型</label>
                <input id="ai-model" value={settings.aiModel} placeholder="模型名" onChange={(event) => set({ aiModel: event.target.value.trim(), aiPreset: "custom" })} />
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="ai-key">API 密钥</label>
                <input id="ai-key" type="password" placeholder={state.aiKeySaved ? "已加密保存，留空则不改" : "本地 Ollama 可以不填"} onBlur={(event) => { if (event.target.value.trim()) void api.setAiKey(event.target.value); event.target.value = ""; }} />
              </div>
              <p className="hint">{AI_PRESETS.find((item) => item.id === settings.aiPreset)?.endpointNote} {AI_PRESETS.find((item) => item.id === settings.aiPreset)?.modelNote}</p>
              <p className="hint">邮件内容会发送到所选服务商，免费服务可能用于训练；本地 Ollama 不联网。</p>
              <p className="hint">{state.aiStatus}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn" type="button" onClick={() => void api.testAi()}>测试</button>
                {state.aiKeySaved && <button className="btn" type="button" onClick={() => void api.setAiKey("")}>清除密钥</button>}
              </div>
            </div>
          </div>
          <details className="advanced">
            <summary>高级 · 每封都用 AI</summary>
            <SetRow title="每封都用 AI" text="高置信的规则结果仍然保留，模型不能推翻它。" on={settings.aiEveryMessage} onToggle={() => set({ aiEveryMessage: !settings.aiEveryMessage })} />
          </details>
        </div>
      </section>
      <section className="set-block">
        <h2>发件域名</h2>
        <div className="group">
          {Object.keys(settings.senderPrefs || {}).length === 0 ? <p className="empty">还没有记过。通知上点「不是验证码」或「选另一个」之后，会记在这里，删掉账号也不会清。</p> : Object.entries(settings.senderPrefs).map(([domain, pref]) => (
            <div className="set-row" key={domain}>
              <div>
                <h3>{domain}</h3>
                <p>{pref.muted ? "不再弹出这个域名的验证码。" : `更倾向第 ${(pref.preferIndex || 0) + 1} 个候选。`}</p>
              </div>
              <button className="btn" type="button" onClick={() => {
                const senderPrefs = { ...settings.senderPrefs };
                delete senderPrefs[domain];
                set({ senderPrefs });
              }}>删除</button>
            </div>
          ))}
        </div>
      </section>
      <section className="set-block">
        <h2>更新</h2>
        <div className="group">
          <SetRow title="自动检查更新" text="启动约 20 秒后检查一次，之后每 6 小时再检查。下载在后台进行。手动检查在设置页顶部。" on={settings.autoCheckUpdates} onToggle={() => set({ autoCheckUpdates: !settings.autoCheckUpdates })} />
          {state.update.phase === "downloaded" && (
            <div className="set-row">
              <div>
                <h3>更新已就绪</h3>
                <p>稍后退出码到时会安装。也可以现在重启。</p>
              </div>
              <button className="btn-primary" type="button" onClick={() => void api.installUpdate()}>立即重启更新</button>
            </div>
          )}
        </div>
      </section>
      <section className="set-block">
        <details className="advanced">
          <summary>高级 · 一般不需要填写</summary>
          <div className="group">
            <div className="set-row">
              <div style={{ flex: 1 }}>
                <h3>自定义 Azure 客户端 ID</h3>
                <p>留空即可登录个人 Outlook / Hotmail。只有你自己在 Azure 注册了应用时才需要填写。</p>
                <div className="field" style={{ marginTop: 8 }}>
                  <input value={settings.outlookClientId} placeholder="一般不需要填写" onChange={(event) => set({ outlookClientId: event.target.value.trim() })} />
                </div>
                <h3 style={{ marginTop: 12 }}>自定义回调地址</h3>
                <p>留空时，内置客户端使用 https://localhost，自己的客户端使用 http://127.0.0.1:45832/callback。</p>
                <div className="field" style={{ marginTop: 8 }}>
                  <input value={settings.oauthRedirectUri} placeholder="例如 https://localhost" onChange={(event) => set({ oauthRedirectUri: event.target.value.trim() })} />
                </div>
              </div>
            </div>
          </div>
        </details>
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

function AccountDialog({ state, dialog, message, setMessage, onClose }: { state: AppState; dialog: DialogState & object; message: string; setMessage: (value: string) => void; onClose: () => void }) {
  const api = window.madao!;
  const initial = dialog.account?.provider || "qq";
  const [provider, setProvider] = useState<ProviderId>(initial);
  const preset = PROVIDERS[provider];
  const [email, setEmail] = useState(dialog.account?.email || "");
  const [secret, setSecret] = useState("");
  const [host, setHost] = useState(dialog.account?.host || preset.host);
  const [port, setPort] = useState(String(dialog.account?.port || preset.port));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const providerRef = React.useRef(provider);
  useEffect(() => {
    if (providerRef.current === "outlook" && provider !== "outlook") void api.cancelOAuth();
    providerRef.current = provider;
  }, [api, provider]);

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
        <p className="lede">{provider === "outlook" ? "用微软官方页面登录。码到只保存登录后的授权，看不到密码。" : "选邮箱类型后自动填写服务器。授权码只加密存在这台电脑上。"}</p>
        <div className="providers">
          {PROVIDER_LIST.map((item) => (
            <button key={item.id} className={`provider ${provider === item.id ? "on" : ""}`} type="button" onClick={() => choose(item.id)}>
              <Brand provider={item.id} size="md" />
              <b>{item.name}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        {preset.authMethod === "oauth" ? (
          <OutlookAdd account={dialog.account} settings={state.settings} autoLogin={dialog.autoLogin} onClose={onClose} />
        ) : (
          <>
            <div className="form-grid">
              <div className="field wide">
                <label htmlFor="email">邮箱地址</label>
                <input id="email" value={email} placeholder={preset.placeholder} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="field wide">
                <label htmlFor="secret">{preset.secretLabel}</label>
                <input
                  id="secret"
                  type="password"
                  value={secret}
                  placeholder={dialog.account ? "留空则保持原来的授权码" : "不是邮箱登录密码"}
                  onChange={(event) => setSecret(stripCredentialWhitespace(event.target.value))}
                  onPaste={(event) => {
                    event.preventDefault();
                    const pasted = stripCredentialWhitespace(event.clipboardData.getData("text"));
                    const input = event.currentTarget;
                    const next = stripCredentialWhitespace(`${input.value.slice(0, input.selectionStart ?? 0)}${pasted}${input.value.slice(input.selectionEnd ?? input.value.length)}`);
                    setSecret(next);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="host">IMAP 服务器</label>
                <input id="host" value={host} onChange={(event) => setHost(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="port">端口</label>
                <input id="port" value={port} onChange={(event) => setPort(event.target.value)} />
              </div>
            </div>
            <div className="guide">
              <h2>{preset.guideTitle}</h2>
              <ol>{preset.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p style={{ margin: "8px 0 0" }}><a href={preset.link} onClick={(event) => { event.preventDefault(); void api.openExternal(preset.link); }}>{preset.linkText}</a></p>
            </div>
          </>
        )}
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
