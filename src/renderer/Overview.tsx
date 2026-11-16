import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkAreaComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Account, AppState } from "../shared/types";
import { computeOverviewStats, type StatsRange } from "../shared/stats";
import { AI_DAILY_LIMIT, weeklyPrecision } from "../shared/learning";
import { formatWhen, remainText, statusOf } from "./format";

echarts.use([LineChart, PieChart, BarChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkAreaComponent, CanvasRenderer]);

type Page = "overview" | "accounts" | "history" | "mail" | "settings";

function Chart({ option, height }: { option: echarts.EChartsCoreOption; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} style={{ height, width: "100%" }} />;
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

const TYPE_COLORS: Record<string, string> = {
  "验证码": "#005fb8",
  "重要通知": "#0e7a0e",
  "推广": "#e8a13a",
  "订阅": "#8a8a93",
  "疑似垃圾": "#c42b1c",
  "普通": "#c9c9d1",
};

function deltaText(delta: number | null): { text: string; cls: string } {
  if (delta === null) return { text: "上周期暂无数据", cls: "flat" };
  if (delta > 0) return { text: `▲ 较上周期 +${delta}%`, cls: "" };
  if (delta < 0) return { text: `▼ 较上周期 ${delta}%`, cls: "down" };
  return { text: "与上周期持平", cls: "flat" };
}

export function Overview({ state, onAdd, onRelogin, onGo }: { state: AppState; onAdd: () => void; onRelogin: (account: Account) => void; onGo: (page: Page) => void }) {
  const api = window.madao!;
  const [copied, setCopied] = useState(false);
  const [now] = useState(Date.now());
  const [range, setRange] = useState<StatsRange>(7);
  const dark = state.theme === "dark";
  const latest = state.history[0];
  const listeningCount = state.statuses.filter((item) => item.state === "listening" || item.state === "polling").length;
  const broken = state.accounts.filter((account) => {
    const status = state.statuses.find((item) => item.accountId === account.id);
    return status && (status.state === "auth_failed" || status.state === "error");
  });
  const latestExpired = Boolean(latest?.expiresAt && latest.expiresAt <= now);
  const stats = useMemo(
    () => computeOverviewStats({ mails: state.mails, history: state.history, range, now: Date.now() }),
    [state.mails, state.history, range],
  );
  const learning = state.learning;
  const weeks = useMemo(() => weeklyPrecision({ days: learning.days }, Date.now()), [learning.days]);
  const hasPrecisionTrend = weeks.some((week) => week.value !== null);

  const axis = useMemo(() => ({
    axisLine: { lineStyle: { color: dark ? "#3a3a42" : "#d8d8e0" } },
    axisLabel: { color: dark ? "#a1a1aa" : "#5b5b60", fontSize: 11 },
    splitLine: { lineStyle: { color: dark ? "#2e2e35" : "#f0f0f3" } },
  }), [dark]);

  const trendOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: { trigger: "axis" },
    legend: { top: 0, right: 0, textStyle: { fontSize: 11, color: dark ? "#d4d4da" : "#44444a" }, itemWidth: 14 },
    grid: { left: 34, right: 34, top: 26, bottom: 22 },
    xAxis: { type: "category", data: stats.series.map((item) => item.label), ...axis },
    yAxis: [{ type: "value", ...axis }, { type: "value", ...axis, splitLine: { show: false } }],
    series: [
      { name: "邮件量", type: "line", smooth: true, areaStyle: { color: "rgba(0,95,184,.13)" }, lineStyle: { color: "#005fb8", width: 2 }, itemStyle: { color: "#005fb8" }, data: stats.series.map((item) => item.mails) },
      { name: "验证码", type: "line", yAxisIndex: 1, smooth: true, lineStyle: { color: "#0e7a0e", width: 2 }, itemStyle: { color: "#0e7a0e" }, data: stats.series.map((item) => item.codes) },
    ],
  }), [stats, axis, dark]);

  const donutOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: {},
    legend: { bottom: 0, textStyle: { fontSize: 11, color: dark ? "#d4d4da" : "#44444a" }, itemWidth: 10 },
    series: [{
      type: "pie",
      radius: ["52%", "74%"],
      center: ["50%", "44%"],
      label: { formatter: "{c}", fontSize: 11, color: dark ? "#d4d4da" : "#44444a" },
      data: stats.typeDist.map((item) => ({ value: item.count, name: item.kind, itemStyle: { color: TYPE_COLORS[item.kind] } })),
    }],
  }), [stats, dark]);

  const accountsOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: {},
    grid: { left: 8, right: 14, top: 8, bottom: 20, containLabel: true },
    xAxis: { type: "value", ...axis },
    yAxis: { type: "category", data: stats.accountCounts.map((item) => item.email), axisLabel: { color: dark ? "#d4d4da" : "#44444a", fontSize: 11 }, axisLine: { lineStyle: { color: dark ? "#3a3a42" : "#d8d8e0" } } },
    series: [{ type: "bar", barWidth: 13, itemStyle: { color: "#005fb8", borderRadius: [0, 4, 4, 0] }, data: stats.accountCounts.map((item) => item.count) }],
  }), [stats, axis, dark]);

  const riskOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: {},
    grid: { left: 30, right: 10, top: 24, bottom: 22 },
    xAxis: { type: "category", data: ["0–19", "20–39", "40–54", "55–69", "70–84", "85–100"], ...axis },
    yAxis: { type: "value", ...axis },
    series: [{
      type: "bar",
      barWidth: "55%",
      data: stats.riskBuckets.map((value, index) => ({
        value,
        itemStyle: { color: ["#0e7a0e", "#7ab648", "#e8a13a", "#dd7a1f", "#c42b1c", "#8f1d12"][index] },
      })),
      markArea: {
        itemStyle: { color: "rgba(110,64,201,.08)" },
        label: { color: "#6e40c9", fontSize: 10 },
        data: [[{ name: "AI 灰区", xAxis: "40–54" }, { xAxis: "55–69" }]],
      },
    }],
  }), [stats, axis]);

  const heatOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: {},
    grid: { left: 36, right: 8, top: 8, bottom: 22 },
    xAxis: { type: "category", data: stats.heatDays, axisLabel: { color: dark ? "#a1a1aa" : "#5b5b60", fontSize: 10 }, splitArea: { show: true } },
    yAxis: { type: "category", data: ["0–4", "4–8", "8–12", "12–16", "16–20", "20–24"], axisLabel: { color: dark ? "#a1a1aa" : "#5b5b60", fontSize: 10 }, splitArea: { show: true } },
    visualMap: { show: false, min: 0, max: Math.max(4, ...stats.heat.map((cell) => cell[2])), inRange: { color: dark ? ["#23232a", "#274b73", "#2f7fd1"] : ["#eef3fa", "#9ec2e8", "#005fb8"] } },
    series: [{ type: "heatmap", data: stats.heat, itemStyle: { borderColor: dark ? "#1d1d22" : "#fff", borderWidth: 1.5, borderRadius: 2 } }],
  }), [stats, dark]);

  const precisionOption = useMemo<echarts.EChartsCoreOption>(() => ({
    tooltip: {},
    grid: { left: 34, right: 10, top: 18, bottom: 20 },
    xAxis: { type: "category", data: weeks.map((week) => week.label), ...axis },
    yAxis: { type: "value", min: 50, max: 100, ...axis, axisLabel: { formatter: "{value}%", color: dark ? "#a1a1aa" : "#5b5b60", fontSize: 11 } },
    series: [{ type: "line", smooth: true, connectNulls: true, lineStyle: { color: "#6e40c9", width: 2 }, itemStyle: { color: "#6e40c9" }, areaStyle: { color: "rgba(110,64,201,.1)" }, data: weeks.map((week) => week.value) }],
  }), [weeks, axis, dark]);

  const copyLatest = () => {
    if (!latest) return;
    void api.copyCode(latest.code, "history").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  const codesDelta = deltaText(stats.prevCodesDelta);
  const mailsDelta = deltaText(stats.prevMailsDelta);
  const rangeLabel = range === 1 ? "今日" : `近 ${range} 天`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <p className="lede">{state.paused ? "监听已暂停，新邮件不会被检查。" : listeningCount > 0 ? `${listeningCount} 个邮箱在监听，验证码会弹到屏幕右下角。` : "还没有邮箱在监听，先去添加一个邮箱。"} 系统数据全部来自本机记录，不上传。</p>
        </div>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="segment" role="radiogroup" aria-label="统计范围">
            {([[1, "今日"], [7, "近 7 天"], [30, "近 30 天"]] as Array<[StatsRange, string]>).map(([value, label]) => (
              <button key={value} type="button" className={range === value ? "on" : ""} onClick={() => setRange(value)}>{label}</button>
            ))}
          </span>
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

      <div className="dash-top">
        {latest ? (
          <section className={`ov-hero ${latestExpired ? "expired" : ""}`}>
            <div className="ov-hero-label">最新验证码 · {latest.service} · {formatWhen(latest.receivedAt, now)}{latest.expiresAt ? ` · ${remainText(latest.expiresAt, now)}` : ""}</div>
            <div className="ov-hero-code" style={{ fontSize: 40 }}>{latest.code}</div>
            <div className="ov-hero-sub">{latest.subject} · 收件 {latest.email}</div>
            <div className="ov-hero-actions">
              <button className={`btn primary ${copied ? "copied" : ""}`} type="button" onClick={copyLatest}>{copied ? "已复制 ✓" : "复制验证码"}</button>
              <span className="ov-hint">Ctrl+Shift+V 也能复制</span>
            </div>
          </section>
        ) : (
          <section className="ov-hero">
            <div className="ov-hero-label">最新验证码</div>
            <p className="empty" style={{ textAlign: "left", margin: "10px 0 4px" }}>今天还没有验证码。收到后会出现在这里，并弹到屏幕右下角。</p>
          </section>
        )}
        <div className="dash-card">
          <h3>系统状态</h3>
          {state.accounts.length === 0 ? <p className="hint">还没有添加邮箱。</p> : state.accounts.map((account) => {
            const status = state.statuses.find((item) => item.accountId === account.id);
            const info = statusOf(status?.state, account.enabled, status?.detail || "");
            return (
              <div className="sys-row" key={account.id}>
                <span className="who"><i className={`sys-dot ${info.kind === "ok" ? "" : info.kind}`} />{account.alias || account.email}</span>
                <b>{state.paused && account.enabled ? "已暂停" : info.label}</b>
              </div>
            );
          })}
          <div className="sys-row"><span className="who">异常邮箱</span><b>{broken.length} 个</b></div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="ov-stat"><strong>{stats.rangeCodes}</strong><span>{rangeLabel}截获验证码</span><em className={codesDelta.cls}>{codesDelta.text}</em></div>
        <div className="ov-stat"><strong>{stats.rangeMails}</strong><span>{rangeLabel}邮件总量</span><em className={mailsDelta.cls}>{mailsDelta.text}</em></div>
        <div className="ov-stat"><strong>{stats.todayMails}</strong><span>今日邮件</span><em className="flat">其中验证码 {stats.todayCodes}</em></div>
        <div className="ov-stat"><strong>{stats.rangeSpammy}</strong><span>{rangeLabel}疑似垃圾</span><em className="flat">占 {stats.spamShare}%</em></div>
        <div className="ov-stat"><strong>{learning.aiToday.calls}</strong><span>今日 AI 裁决</span><em className="flat">改判 {learning.aiToday.changed} 封</em></div>
        <div className="ov-stat"><strong>{learning.precision.value === null ? "—" : `${Math.round(learning.precision.value * 100)}%`}</strong><span>筛选精确率</span><em className="flat">{learning.precision.value === null ? "样本不足" : `${learning.precision.judged - learning.precision.overturned} / ${learning.precision.judged} 已确认`}</em></div>
      </div>

      <div className="dash-grid c2">
        <div className="dash-card">
          <h3>邮件量与验证码趋势<span>{range === 1 ? "按小时" : "每日双轴"}</span></h3>
          {stats.rangeMails === 0 && stats.rangeCodes === 0 ? <p className="empty">这个时段还没有数据。</p> : <Chart option={trendOption} height={218} />}
        </div>
        <div className="dash-card">
          <h3>邮件类型分布<span>{rangeLabel}</span></h3>
          {stats.typeDist.length === 0 ? <p className="empty">这个时段还没有邮件。</p> : <Chart option={donutOption} height={218} />}
        </div>
      </div>

      <div className="dash-grid c3">
        <div className="dash-card">
          <h3>各邮箱邮件量<span>{rangeLabel}</span></h3>
          {stats.accountCounts.length === 0 ? <p className="empty">暂无数据。</p> : <Chart option={accountsOption} height={172} />}
        </div>
        <div className="dash-card">
          <h3>垃圾风险分布<span>灰区 40–69 由 AI 裁决</span></h3>
          {stats.rangeMails === 0 ? <p className="empty">暂无数据。</p> : <Chart option={riskOption} height={172} />}
        </div>
        <div className="dash-card">
          <h3>到达时段热力<span>近 7 天 · 几点最忙</span></h3>
          {state.mails.length === 0 ? <p className="empty">暂无数据。</p> : <Chart option={heatOption} height={172} />}
        </div>
      </div>

      <div className="dash-grid c2">
        <div className="dash-card">
          <h3>✦ AI 与学习<span>精确率趋势 + 学习进度</span></h3>
          {!state.settings.aiEnabled ? (
            <>
              <p className="hint" style={{ lineHeight: 1.7 }}>还没有启用。启用后，灰区邮件的类型和风险会由 AI 裁决，你的纠正会让本地筛选越学越准，精确率、学习进度都会出现在这里。</p>
              <div style={{ marginTop: 10 }}><button className="btn primary" type="button" onClick={() => onGo("settings")}>去开启 AI 识别</button></div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 6, alignItems: "center" }}>
              {hasPrecisionTrend ? <Chart option={precisionOption} height={150} /> : <p className="empty">精确率样本积累中：被判为疑似垃圾的邮件达到 3 封的那一周起，这里会出现趋势线。</p>}
              <div>
                <div className="ai-metrics">
                  <div><b>{(learning.rate * 100).toFixed(1)}%</b><span>当前学习率</span></div>
                  <div><b>{learning.corrections}</b><span>累计纠正</span></div>
                  <div><b>{learning.aiToday.avgMs ? `${(learning.aiToday.avgMs / 1000).toFixed(1)}s` : "—"}</b><span>AI 平均响应</span></div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)" }}><span>学习进度</span><span>{learning.progress} / {learning.goal} 样本</span></div>
                  <div className="learn-progress"><i style={{ width: `${learning.progress}%` }} /></div>
                  <p className="hint" style={{ marginTop: 5 }}>{state.settings.aiModel || "未填模型"} · 今日额度 {learning.aiToday.calls} / {AI_DAILY_LIMIT}</p>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn" type="button" onClick={() => onGo("mail")}>去全部邮件看裁决</button>
                  <button className="btn" type="button" onClick={() => onGo("settings")}>AI 设置</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="dash-card">
          <h3>本地数据</h3>
          <div className="sys-row"><span className="who">已存邮件</span><b>{state.mails.length} 封</b></div>
          <div className="sys-row"><span className="who">验证码记录</span><b>{state.history.length} 条</b></div>
          <div className="sys-row"><span className="who">学习样本</span><b>{learning.corrections} 个</b></div>
          <div className="sys-row"><span className="who">保留策略</span><b>{state.settings.mailRetentionDays} 天 / {state.settings.mailRetentionCount} 封</b></div>
          <div className="sys-row"><span className="who">版本</span><b>{state.version} · {state.update.message}</b></div>
        </div>
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
