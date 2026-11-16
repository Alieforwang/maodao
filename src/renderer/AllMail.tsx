import React, { useEffect, useMemo, useState } from "react";
import type { AppState, ContentKind, MailClass, StoredMail } from "../shared/types";
import { classLabel, filterMails, highlightCandidates, rerecognizeNote, sourceLabel } from "../shared/mailLog";
import { CONTENT_KIND_LABELS } from "../shared/spam";
import { formatWhen } from "./format";
import { Select } from "./Select";

const CLASSES: Array<{ id: MailClass | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "code", label: "验证码" },
  { id: "link", label: "链接验证" },
  { id: "maybe", label: "可能是验证码" },
  { id: "none", label: "非验证码" },
];

const CONTENT_KINDS: Array<{ id: ContentKind | "all"; label: string }> = [
  { id: "all", label: "全部类型" },
  { id: "important", label: "重要通知" },
  { id: "promo", label: "推广" },
  { id: "subscription", label: "订阅" },
  { id: "normal", label: "普通" },
  { id: "spammy", label: "疑似垃圾" },
];

export function AllMail({ state }: { state: AppState }) {
  const api = window.madao!;
  const [accountId, setAccountId] = useState("all");
  const [classification, setClassification] = useState<MailClass | "all">("all");
  const [contentKind, setContentKind] = useState<ContentKind | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<StoredMail | null>(null);
  const [draftCode, setDraftCode] = useState("");
  const [note, setNote] = useState("");
  const [learnBanner, setLearnBanner] = useState("");

  const rows = useMemo(
    () => filterMails(state.mails, { accountId, classification, search }).filter((mail) => contentKind === "all" || mail.contentKind === contentKind),
    [state.mails, accountId, classification, search, contentKind],
  );
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mail of state.mails) if (mail.contentKind) counts.set(mail.contentKind, (counts.get(mail.contentKind) || 0) + 1);
    return counts;
  }, [state.mails]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLearnBanner("");
    void api.getMail(selectedId).then((mail) => {
      if (cancelled) return;
      setDetail(mail);
      setDraftCode(mail?.code || "");
    });
    return () => { cancelled = true; };
  }, [api, selectedId, state.mails]);

  const correct = async (kind: "code" | "link" | "none", code?: string) => {
    if (!detail) return;
    const updated = await api.correctMail(detail.id, { kind, code });
    if (updated) {
      setDetail(updated);
      setDraftCode(updated.code || "");
      setNote(kind === "none" ? "已记为非验证码，这个发件域名不再弹出。" : "已记下，并更新了这个发件域名的偏好。");
    }
  };

  const correctSpam = async (isSpam: boolean) => {
    if (!detail) return;
    const from = detail.from;
    const result = await api.correctMailSpam(detail.id, isSpam);
    if (result) {
      setDetail(result.mail);
      const { learned } = result;
      const fmt = (delta: number) => (delta > 0 ? `+${delta}` : `${delta}`);
      setLearnBanner(`✓ 已记住：${from} ${isSpam ? "是垃圾邮件" : "不是垃圾"}。这是第 ${learned.corrections} 个学习样本（进度 ${learned.progress}/100，当前学习率 ${(learned.rate * 100).toFixed(1)}%）；这个发件人今后的邮件本地评分 ${fmt(learned.senderDelta)} 分，同域名 ${fmt(learned.domainDelta)} 分。判错随时再纠正回来。`);
    }
  };

  return (
    <div className="pane-mail">
      <div className="page-head">
        <div>
          <h1>全部邮件</h1>
          <p className="lede">最近拉下来的邮件都留在这台电脑上，方便回头改分类。不会上传。</p>
        </div>
        <button className="btn" type="button" onClick={() => { if (window.confirm("清空这台电脑上的全部邮件记录？")) void api.clearMails(); }}>清空本地邮件记录</button>
      </div>
      <div className="mail-tools">
        <Select
          ariaLabel="按邮箱筛选"
          style={{ width: 240, flex: "none" }}
          value={accountId}
          onChange={setAccountId}
          options={[{ value: "all", label: "全部邮箱" }, ...state.accounts.map((account) => ({ value: account.id, label: account.alias || account.email }))]}
        />
        <div className="segment" role="radiogroup" aria-label="按分类筛选">
          {CLASSES.map((item) => (
            <button key={item.id} type="button" className={classification === item.id ? "on" : ""} onClick={() => setClassification(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="segment" role="radiogroup" aria-label="按内容类型筛选">
          {CONTENT_KINDS.map((item) => (
            <button key={item.id} type="button" className={contentKind === item.id ? "on" : ""} onClick={() => setContentKind(item.id)}>{item.label}{item.id !== "all" && kindCounts.get(item.id) ? ` ${kindCounts.get(item.id)}` : ""}</button>
          ))}
        </div>
        <input aria-label="搜索发件人或标题" placeholder="搜索发件人或标题" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="mail-log">
        <div className="mail-list">
          {rows.length === 0 ? <p className="empty">还没有符合条件的邮件。</p> : rows.map((mail) => (
            <button key={mail.id} type="button" className={`mail-row ${selectedId === mail.id ? "on" : ""}`} onClick={() => setSelectedId(mail.id)}>
              <span className="mail-row-top">
                <strong>{mail.subject || "（无标题）"}</strong>
                <time>{formatWhen(mail.receivedAt)}</time>
              </span>
              <span className="mail-row-sub">
                <em>{mail.from}</em>
                {mail.classification === "code" ? (
                  <span className="chip chip-code">验证码 <b>{mail.display || mail.code || ""}</b></span>
                ) : mail.classification !== "none" ? (
                  <span className="chip">{classLabel(mail.classification)}</span>
                ) : null}
                {mail.contentKind && mail.contentKind !== "normal" && <span className="chip">{CONTENT_KIND_LABELS[mail.contentKind]}</span>}
                {typeof mail.spamScore === "number" && mail.spamScore >= 40 && <span className="chip chip-risk">风险 {mail.spamScore}</span>}
                {mail.aiJudged && <span className="chip chip-ai">✦ AI 裁决</span>}
              </span>
            </button>
          ))}
        </div>
        <article className="mail-detail">
          {!detail ? <p className="empty">选一封邮件查看正文。这里只显示纯文本，不会加载远程图片。</p> : (
            <>
              <h2>{detail.subject || "（无标题）"}</h2>
              {learnBanner && <div className="learn-banner">{learnBanner}</div>}
              <p className="hint">{formatWhen(detail.receivedAt)} · {detail.email} · {detail.from}</p>
              <p className="hint">{classLabel(detail.classification)} · {detail.display || detail.code || "没有验证码"} · {sourceLabel(detail.source)}</p>
              {typeof detail.spamScore === "number" ? (
                <div className="spam-ledger">
                  <p className="hint" style={{ margin: 0 }}>
                    内容类型 · {detail.contentKind ? CONTENT_KIND_LABELS[detail.contentKind] : "普通"} · 垃圾风险 <strong>{detail.spamScore}</strong> 分
                    {detail.headers && (detail.headers.spf || detail.headers.dkim || detail.headers.dmarc) ? ` · SPF ${detail.headers.spf || "—"} / DKIM ${detail.headers.dkim || "—"} / DMARC ${detail.headers.dmarc || "—"}` : ""}
                  </p>
                  {detail.spamReasons && detail.spamReasons.length > 0 ? (
                    <ul>
                      {detail.spamReasons.map((reason, index) => (
                        <li key={index} className={reason.label.startsWith("AI 裁决") ? "ai-line" : reason.label.startsWith("你的纠正") ? "learn-line" : ""}><span>{reason.label}</span><b className={reason.delta > 0 ? "plus" : "minus"}>{reason.delta > 0 ? `+${reason.delta}` : reason.delta}</b></li>
                      ))}
                    </ul>
                  ) : <p className="hint" style={{ margin: "4px 0 0" }}>没有命中任何风险项。</p>}
                  <p className="hint" style={{ margin: "4px 0 0" }}>分数只用于标记和折叠，永远不会自动删信。</p>
                </div>
              ) : <p className="hint">这封是旧记录，入库时还没有垃圾评估；点下方「重新识别」可以补上。</p>}
              <div className="mail-body">
                {highlightCandidates(detail.text, [...detail.candidates, detail.display || "", detail.code || ""]).map((part, index) => part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}
              </div>
              <div className="field">
                <label htmlFor="correct-code">正确的验证码</label>
                <input id="correct-code" value={draftCode} onChange={(event) => setDraftCode(event.target.value)} />
              </div>
              {detail.candidates.length > 0 && (
                <div className="chips">
                  {detail.candidates.map((item) => (
                    <button key={item} type="button" className={draftCode === item ? "on" : ""} onClick={() => setDraftCode(item)}>{item}</button>
                  ))}
                </div>
              )}
              <div className="dialog-actions">
                <button className="btn-primary" type="button" onClick={() => void correct("code", draftCode)}>标为验证码</button>
                <button className="btn" type="button" onClick={() => void correct("link")}>标为链接验证</button>
                <button className="btn" type="button" onClick={() => void correct("none")}>标为非验证码</button>
              </div>
              <div className="dialog-actions">
                {detail.contentKind === "spammy" ? (
                  <button className="btn" type="button" onClick={() => void correctSpam(false)}>标为非垃圾</button>
                ) : (
                  <button className="btn" type="button" onClick={() => void correctSpam(true)}>标为疑似垃圾</button>
                )}
                <button className="btn" type="button" onClick={() => void api.rerecognizeMail(detail.id).then((mail) => { if (mail) { setDetail(mail); setDraftCode(mail.code || ""); setNote(rerecognizeNote(mail.source)); } })}>重新识别</button>
                <button className="btn" type="button" onClick={() => void api.exportMail(detail.id).then(() => setNote("脱敏样本已复制，可以贴进样本集。"))}>导出脱敏样本</button>
              </div>
              {note && <p className="hint">{note}</p>}
            </>
          )}
        </article>
      </div>
    </div>
  );
}
