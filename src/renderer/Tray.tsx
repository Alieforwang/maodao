import React, { useEffect, useState } from "react";
import type { AppState } from "../shared/types";
import { formatWhen, remainText } from "./format";

export function TrayApp() {
  const api = window.madao;
  const [state, setState] = useState<AppState | null>(null);
  const [copiedId, setCopiedId] = useState("");
  useEffect(() => {
    if (!api) return;
    void api.getState().then((next) => {
      setState(next);
      document.documentElement.dataset.theme = next.theme;
    });
    return api.onState((next) => {
      setState(next);
      document.documentElement.dataset.theme = next.theme;
    });
  }, [api]);
  if (!api || !state) return null;
  const listening = state.statuses.filter((item) => item.state === "listening" || item.state === "polling").length;
  const broken = state.statuses.filter((item) => item.state === "auth_failed" || item.state === "error");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = state.history.filter((item) => item.receivedAt >= todayStart.getTime()).length;
  const copy = (id: string, code: string) => {
    void api.copyCode(code, "tray").then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? "" : current)), 1400);
    });
  };
  return (
    <aside className="flyout">
      <div className="fly-head">
        <strong>码到</strong>
        <span>{state.paused ? "监听已暂停" : `正在监听 ${listening} 个邮箱`} · 今日 {todayCount} 条 · 最近 {Math.min(5, state.history.length)} 条</span>
        {broken.length > 0 && (
          <button type="button" className="text-link" style={{ color: "var(--danger)", marginTop: 4 }} onClick={() => api.windowControl("show")}>
            {broken.length} 个邮箱登录失效或异常，点此查看
          </button>
        )}
      </div>
      <div className="hist-label">最近验证码</div>
      <div id="tray-history">
        {state.history.length === 0 && <p className="empty">还没有验证码。</p>}
        {state.history.slice(0, 5).map((item) => (
          <div className="hist-item" key={item.id}>
            <div className="hist-top">
              <span className="hist-code">{item.code}</span>
              <span className="hist-time">{formatWhen(item.receivedAt)}</span>
              <button className={`mini-copy ${copiedId === item.id ? "copied" : ""}`} type="button" onClick={() => copy(item.id, item.code)}>{copiedId === item.id ? "已复制 ✓" : "复制"}</button>
            </div>
            <div className="hist-sub">{item.service} · {item.subject}</div>
            <div className="hist-mail">{item.email}</div>
          </div>
        ))}
      </div>
      <div className="menu">
        <button type="button" onClick={() => api.windowControl("show")}>打开主窗口</button>
        <button type="button" onClick={() => api.setPaused(!state.paused)}>{state.paused ? "继续监听" : "暂停监听（断开连接）"}</button>
        {state.settings.muteUntil > Date.now() ? (
          <button type="button" onClick={() => void api.setMuted(0)}>取消静默（{remainText(state.settings.muteUntil)}后自动恢复）</button>
        ) : (
          <>
            <button type="button" onClick={() => void api.setMuted(30)}>静默 30 分钟（只记录不弹窗）</button>
            <button type="button" onClick={() => void api.setMuted(60)}>静默 1 小时</button>
            <button type="button" onClick={() => void api.setMuted(180)}>静默 3 小时</button>
          </>
        )}
        <button type="button" onClick={() => void api.sendTestNotification()}>发送测试通知</button>
        <button type="button" onClick={() => api.clearHistory()}>清空记录</button>
        <button type="button" onClick={() => void api.checkForUpdates()}>检查更新</button>
        <button type="button" onClick={() => api.windowControl("quit")}>退出</button>
      </div>
    </aside>
  );
}
