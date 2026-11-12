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
