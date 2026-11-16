/** "还剩 4:32" style remaining-time label; empty when no expiry is known. */
export function remainText(expiresAt: number | null | undefined, now = Date.now()): string {
  if (!expiresAt) return "";
  const left = expiresAt - now;
  if (left <= 0) return "已过期";
  const totalSeconds = Math.ceil(left / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `还剩 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  return `还剩 ${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Group a bare numeric code for scanning: 738291 → "738 291". Displays that already carry separators stay untouched. */
export function groupDisplay(display: string): string {
  if (/[- ]/.test(display)) return display;
  if (/^\d{6}$/.test(display)) return `${display.slice(0, 3)} ${display.slice(3)}`;
  if (/^\d{8}$/.test(display)) return `${display.slice(0, 4)} ${display.slice(4)}`;
  return display;
}

export function formatWhen(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  const diff = today.getTime() - day.getTime();
  if (diff === 86_400_000) return "昨天";
  if (diff > 0) return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function statusOf(state: string | undefined, enabled: boolean, detail: string): { label: string; kind: "ok" | "warn" | "off" | "bad"; extra: string } {
  if (!enabled || state === "disabled") return { label: "已暂停", kind: "off", extra: "" };
  if (state === "listening") return { label: "监听中", kind: "ok", extra: "" };
  if (state === "polling") return { label: "轮询中", kind: "ok", extra: detail };
  if (state === "connecting") return { label: "连接中", kind: "warn", extra: "" };
  if (state === "reconnecting") return { label: "正在重连", kind: "warn", extra: detail };
  if (state === "auth_failed") return { label: "登录失败", kind: "bad", extra: detail };
  if (state === "error") return { label: "连接异常", kind: "warn", extra: detail };
  return { label: "未连接", kind: "off", extra: detail };
}
