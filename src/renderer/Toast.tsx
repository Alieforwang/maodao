import React, { useEffect, useState } from "react";
import type { ToastPayload } from "../shared/types";

export function ToastApp() {
  const api = window.madao;
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (!payload || !payload.seconds) return;
    const timer = setTimeout(() => api?.dismissToast(), payload.seconds * 1000);
    return () => clearTimeout(timer);
  }, [api, payload]);

  if (!payload) return null;
  const copy = (reason: "notification-click" | "copy-button") => {
    if (!payload.code || !api) return;
    void api.copyCode(payload.code, reason).then(() => setCopied(true));
  };
  return (
    <article className="toast" onClick={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-action='dismiss']")) return;
      if (target.closest("[data-action='copy']")) copy("copy-button");
      else copy("notification-click");
    }}>
      <div className="toast-top">
        <span className="mark sm app">码</span>
        <span className="name">码到</span>
        <span className="ago">刚刚</span>
        <button className="icon-btn" type="button" data-action="dismiss" aria-label="关闭通知" onClick={() => api?.dismissToast()}>
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
      <div className="toast-body">
        <div className="code">{payload.code || "新邮件"}</div>
        <div className="service">{payload.service}</div>
        <div className="subject">{payload.subject}</div>
        <div className="mailto">收件邮箱 · {payload.email}</div>
      </div>
      <div className="toast-actions">
        {payload.code ? <button className="copy" type="button" data-action="copy">{copied ? "已复制" : "复制验证码"}</button> : <button type="button" data-action="dismiss">知道了</button>}
        <button type="button" data-action="dismiss">关闭</button>
      </div>
      <p className="toast-hint">点击通知或「复制验证码」才写入剪贴板，不会自动复制。</p>
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
