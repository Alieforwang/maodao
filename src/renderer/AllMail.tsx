import React, { useEffect, useMemo, useState } from "react";
import type { AppState, MailClass, StoredMail } from "../shared/types";
import { classLabel, filterMails, highlightCandidates, rerecognizeNote, sourceLabel } from "../shared/mailLog";
import { formatWhen } from "./format";

const CLASSES: Array<{ id: MailClass | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "code", label: "验证码" },
  { id: "link", label: "链接验证" },
  { id: "maybe", label: "可能是验证码" },
  { id: "none", label: "非验证码" },
];

export function AllMail({ state }: { state: AppState }) {
  const api = window.madao!;
  const [accountId, setAccountId] = useState("all");
  const [classification, setClassification] = useState<MailClass | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<StoredMail | null>(null);
  const [draftCode, setDraftCode] = useState("");
  const [note, setNote] = useState("");

  const rows = useMemo(
    () => filterMails(state.mails, { accountId, classification, search }),
    [state.mails, accountId, classification, search],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
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
        <select aria-label="按邮箱筛选" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="all">全部邮箱</option>
          {state.accounts.map((account) => <option key={account.id} value={account.id}>{account.alias || account.email}</option>)}
        </select>
        <div className="segment" role="radiogroup" aria-label="按分类筛选">
          {CLASSES.map((item) => (
            <button key={item.id} type="button" className={classification === item.id ? "on" : ""} onClick={() => setClassification(item.id)}>{item.label}</button>
          ))}
        </div>
        <input aria-label="搜索发件人或标题" placeholder="搜索发件人或标题" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="hint">保留
          <select aria-label="保留天数" value={state.settings.mailRetentionDays} onChange={(event) => void api.updateSettings({ mailRetentionDays: Number(event.target.value) as 7 | 30 | 90 })}>
            {[7, 30, 90].map((days) => <option key={days} value={days}>{days} 天</option>)}
          </select>
        </label>
        <label className="hint">每个邮箱
          <select aria-label="每个邮箱保留封数" value={state.settings.mailRetentionCount} onChange={(event) => void api.updateSettings({ mailRetentionCount: Number(event.target.value) as 200 | 500 | 1000 })}>
            {[200, 500, 1000].map((count) => <option key={count} value={count}>{count} 封</option>)}
          </select>
        </label>
      </div>
      <div className="mail-log">
        <div className="mail-list">
          {rows.length === 0 ? <p className="empty">还没有符合条件的邮件。</p> : rows.map((mail) => (
            <button key={mail.id} type="button" className={`mail-row ${selectedId === mail.id ? "on" : ""}`} onClick={() => setSelectedId(mail.id)}>
              <span>{formatWhen(mail.receivedAt)}</span>
              <strong>{mail.subject || "（无标题）"}</strong>
              <em>{mail.email}</em>
              <em>{mail.from}</em>
              <b>{classLabel(mail.classification)} · {mail.confidence === "high" ? "高" : mail.confidence === "medium" ? "中" : "低"} · {sourceLabel(mail.source)}</b>
            </button>
          ))}
        </div>
        <article className="mail-detail">
          {!detail ? <p className="empty">选一封邮件查看正文。这里只显示纯文本，不会加载远程图片。</p> : (
            <>
              <h2>{detail.subject || "（无标题）"}</h2>
              <p className="hint">{formatWhen(detail.receivedAt)} · {detail.email} · {detail.from}</p>
              <p className="hint">{classLabel(detail.classification)} · {detail.display || detail.code || "没有验证码"} · {sourceLabel(detail.source)}</p>
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
