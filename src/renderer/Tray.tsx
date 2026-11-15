import React, { useEffect, useState } from "react";
import type { AppState } from "../shared/types";
import { formatWhen } from "./format";

export function TrayApp() {
  const api = window.madao;
  const [state, setState] = useState<AppState | null>(null);
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
  return (
    <aside className="flyout">
      <div className="fly-head">
        <strong>码到</strong>
        <span>{state.paused ? "监听已暂停" : `正在监听 ${listening} 个邮箱`} · 最近 {Math.min(5, state.history.length)} 条</span>
      </div>
      <div className="hist-label">最近验证码</div>
      <div id="tray-history">
        {state.history.length === 0 && <p className="empty">还没有验证码。</p>}
        {state.history.slice(0, 5).map((item) => (
          <div className="hist-item" key={item.id}>
            <div className="hist-top">
              <span className="hist-code">{item.code}</span>
              <span className="hist-time">{formatWhen(item.receivedAt)}</span>
              <button className="mini-copy" type="button" onClick={() => api.copyCode(item.code, "tray")}>复制</button>
            </div>
            <div className="hist-sub">{item.service} · {item.subject}</div>
            <div className="hist-mail">{item.email}</div>
          </div>
        ))}
      </div>
      <div className="menu">
        <button type="button" onClick={() => api.windowControl("show")}>打开主窗口</button>
        <button type="button" onClick={() => api.setPaused(!state.paused)}>{state.paused ? "继续监听" : "暂停监听"}</button>
        <button type="button" onClick={() => api.clearHistory()}>清空记录</button>
        <button type="button" onClick={() => void api.checkForUpdates()}>检查更新</button>
        <button type="button" onClick={() => api.windowControl("quit")}>退出</button>
      </div>
    </aside>
  );
}
