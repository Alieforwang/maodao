import React, { useEffect, useRef, useState } from "react";
import type { ToastPayload } from "../shared/types";
import { formatWhen, groupDisplay, remainText } from "./format";
import brandIcon from "./brand/icon-32.png";

function agoText(receivedAt: number | undefined, now: number): string {
  if (!receivedAt) return "刚刚";
  const diff = now - receivedAt;
  if (diff < 60_000) return "刚刚";
  if (diff < 60 * 60_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  return formatWhen(receivedAt, now);
}

export function ToastApp() {
  const api = window.madao;
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [sel, setSel] = useState(0);
  const [now, setNow] = useState(Date.now());
  const shownAt = useRef(0);

  useEffect(() => {
    if (!api) return;
    void api.getState().then((state) => { document.documentElement.dataset.theme = state.theme; });
    void api.currentToast().then((current) => current && setPayload(current));
    return api.onToast((next) => {
      setCopied(false);
      setPayload(next);
      document.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
      if (next.sound) beep();
    });
  }, [api]);

  useEffect(() => {
    if (!payload) return;
    shownAt.current = Date.now();
    setSel(payload.selectedIndex || 0);
    setNow(Date.now());
  }, [payload?.id]);

  useEffect(() => {
    if (!payload) return;
    const dismiss = payload.seconds ? setTimeout(() => api?.dismissToast(), payload.seconds * 1000) : undefined;
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => { if (dismiss) clearTimeout(dismiss); clearInterval(tick); };
  }, [api, payload]);

  const kind = payload?.kind || (payload?.code ? "code" : "mail");
  const candidates = payload?.candidates || [];
  const index = kind === "maybe" ? Math.min(sel, Math.max(0, candidates.length - 1)) : (payload?.selectedIndex || 0);
  const code = candidates[index] || payload?.code || null;
  const display = payload?.displays?.[index] || payload?.display || code || "";

  const copy = (reason: "notification-click" | "copy-button", value = code) => {
    if (!value || !api || kind === "link") return;
    void api.copyCode(value, reason).then(() => setCopied(true));
  };

  useEffect(() => {
    if (!payload) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") { event.preventDefault(); copy("copy-button"); }
      if (event.key === "Escape") { event.preventDefault(); void api?.dismissToast(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!payload) return null;
  const remain = payload.seconds ? Math.max(0, 1 - (now - shownAt.current) / (payload.seconds * 1000)) : 1;

  return (
    <article className="toast" onClick={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button")) return;
      if (kind === "link" || kind === "maybe") return;
      copy("notification-click");
    }}>
      <div className="toast-top">
        <img className="brand-icon" src={brandIcon} alt="" />
        <span className="name">码到</span>
        {payload.test && <span className="test-tag">测试</span>}
        {payload.fromJunk && <span className="queue-tag">来自垃圾箱</span>}
        {payload.alert === "auth" && <span className="test-tag" style={{ background: "color-mix(in srgb, var(--danger) 14%, transparent)", color: "var(--danger)" }}>需要处理</span>}
        {(payload.queueLength || 0) > 0 && <span className="queue-tag">还有 {payload.queueLength} 条</span>}
        <span className="ago">{agoText(payload.receivedAt, now)}</span>
        <button className="icon-btn" type="button" data-action="dismiss" aria-label="关闭通知" onClick={() => api?.dismissToast()}>
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
      <div className="toast-body">
        {kind === "link" ? <div className="code link-title">这是一封链接验证邮件</div> : kind === "maybe" ? <div className="maybe">可能是验证码 · 点一个候选，再按复制</div> : <div className="code">{groupDisplay(display)}</div>}
        {kind === "maybe" && (
          <div className="chips">
            {candidates.slice(0, 3).map((item, chip) => (
              <button key={`${item}-${chip}`} type="button" className={chip === index ? "on" : ""} onClick={() => { setSel(chip); setCopied(false); }}>{groupDisplay(payload.displays?.[chip] || item)}</button>
            ))}
          </div>
        )}
        <div className="service"><span className="svc-mark" aria-hidden="true">{(payload.service || "码").slice(0, 1)}</span>{payload.service}
          {payload.expiresAt ? <span className={`remain ${payload.expiresAt - now <= 0 ? "expired" : payload.expiresAt - now < 60_000 ? "urgent" : ""}`}>{remainText(payload.expiresAt, now)}</span> : null}
        </div>
        <div className="subject">{payload.subject}</div>
        <div className="mailto">收件邮箱 · {payload.email}</div>
      </div>
      <div className="toast-actions">
        {payload.alert === "auth" ? <button className="copy" type="button" onClick={() => { api?.windowControl("show"); void api?.dismissToast(); }}>去重新登录</button> : kind === "link" ? <button className="copy" type="button" onClick={() => api?.openVerifyLink()}>打开链接</button> : code ? <button className="copy" type="button" data-action="copy" onClick={() => copy("copy-button")}>{copied ? "已复制 ✓" : "复制验证码"}</button> : <button type="button" data-action="dismiss" onClick={() => api?.dismissToast()}>知道了</button>}
        <button type="button" data-action="dismiss" onClick={() => api?.dismissToast()}>关闭</button>
      </div>
      {payload.seconds > 0 && <div className="toast-progress" aria-hidden="true"><i style={{ width: `${Math.round(remain * 100)}%` }} /></div>}
      {kind !== "mail" && !payload.test && (
        <div className="toast-extra">
          <button type="button" onClick={() => api?.muteToastSender()}>不是验证码</button>
          {kind !== "link" && candidates.length > 1 && <button type="button" onClick={() => void api?.chooseOtherCode()}>选另一个</button>}
        </div>
      )}
      <p className="toast-hint">{payload.test ? "这是测试通知，不会记入记录。" : kind === "link" ? "只有点「打开链接」才会离开码到，不会自动打开。" : "回车复制 · Esc 关闭 · 点击通知也可复制"}</p>
    </article>
  );
}

function beep(): void {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  oscillator.onended = () => void context.close();
}
