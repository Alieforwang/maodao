import React, { useEffect, useState } from "react";
import type { ToastPayload } from "../shared/types";
import brandIcon from "./brand/icon-32.png";

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
  const index = payload.selectedIndex || 0;
  const code = payload.candidates?.[index] || payload.code;
  const display = payload.displays?.[index] || payload.display || code;
  const kind = payload.kind || (code ? "code" : "mail");
  const copy = (reason: "notification-click" | "copy-button", value = code) => {
    if (!value || !api || kind === "link") return;
    void api.copyCode(value, reason).then(() => setCopied(true));
  };
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
        <span className="ago">刚刚</span>
        <button className="icon-btn" type="button" data-action="dismiss" aria-label="关闭通知" onClick={() => api?.dismissToast()}>
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
      <div className="toast-body">
        {kind === "link" ? <div className="code link-title">这是一封链接验证邮件</div> : kind === "maybe" ? <div className="maybe">可能是验证码</div> : <div className="code">{display}</div>}
        {kind === "maybe" && (
          <div className="chips">
            {(payload.candidates || []).slice(0, 3).map((item, chip) => (
              <button key={`${item}-${chip}`} type="button" className={chip === index ? "on" : ""} onClick={() => copy("copy-button", item)}>{payload.displays?.[chip] || item}</button>
            ))}
          </div>
        )}
        <div className="service">{payload.service}</div>
        <div className="subject">{payload.subject}</div>
        <div className="mailto">收件邮箱 · {payload.email}</div>
      </div>
      <div className="toast-actions">
        {kind === "link" ? <button className="copy" type="button" onClick={() => api?.openVerifyLink()}>打开链接</button> : code ? <button className="copy" type="button" data-action="copy" onClick={() => copy("copy-button")}>{copied ? "已复制" : "复制验证码"}</button> : <button type="button" data-action="dismiss" onClick={() => api?.dismissToast()}>知道了</button>}
        <button type="button" data-action="dismiss" onClick={() => api?.dismissToast()}>关闭</button>
      </div>
      {kind !== "mail" && (
        <div className="toast-extra">
          <button type="button" onClick={() => api?.muteToastSender()}>不是验证码</button>
          {kind !== "link" && (payload.candidates?.length || 0) > 1 && <button type="button" onClick={() => void api?.chooseOtherCode()}>选另一个</button>}
          <button type="button" onClick={() => api?.exportRedactedSample()}>导出脱敏样本</button>
        </div>
      )}
      <p className="toast-hint">{kind === "link" ? "只有点「打开链接」才会离开码到，不会自动打开。" : "点击通知或「复制验证码」才写入剪贴板，不会自动复制。"}</p>
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
