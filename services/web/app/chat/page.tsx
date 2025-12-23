"use client";

import { useMemo, useState } from "react";
import styles from "./chat.module.css";

type Hit = { id: number; score: number; text: string };

export default function ChatPage() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [contexts, setContexts] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2400);
  };

  const api = async (input: RequestInfo, init?: RequestInit) => {
    const r = await fetch(input, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = (data?.detail ?? data?.message ?? JSON.stringify(data)) as string;
      throw new Error(detail);
    }
    return data;
  };

  const ask = async () => {
    const question = q.trim();
    if (!question) {
      showToast("err", "질문을 입력해줘");
      return;
    }

    setLoading(true);
    setAnswer("");
    setContexts([]);

    try {
      const data = await api("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ question, top_k: 3 }),
      });

      setAnswer(data.answer || "");
      setContexts(data.contexts || []);
      showToast("ok", "응답 완료");
    } catch (e: any) {
      showToast("err", `요청 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") ask();
  };

  const avgScore = useMemo(() => {
    if (!contexts.length) return null;
    const s = contexts.reduce((a, c) => a + (c.score ?? 0), 0) / contexts.length;
    return Number.isFinite(s) ? s : null;
  }, [contexts]);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>AI 대화</h1>
          <p className={styles.subtitle}>RAG 기반 답변 + 근거(Context) 확인</p>
        </div>

        <div className={styles.headerRight}>
          <span className={styles.badge}>{loading ? "생성 중…" : "ready"}</span>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardTitle}>질문</h2>
          <span className={styles.hint}>Enter로 전송</span>
        </div>

        <div className={styles.inputRow}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            className={styles.input}
            placeholder="질문을 입력하세요 (예: 인권과 법의 중요성은?)"
            disabled={loading}
          />
          <button className={styles.btnPrimary} onClick={ask} disabled={loading}>
            {loading ? "생성 중…" : "질문"}
          </button>
        </div>

        <div className={styles.miniHelp}>
          {q.trim() ? `문자수: ${q.trim().length}` : "짧게/명확하게 물어볼수록 좋아"}
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>답변</h2>
            <span className={styles.badgeSoft}>{answer ? "done" : "empty"}</span>
          </div>

          {loading ? (
            <div className={styles.skeleton}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          ) : answer ? (
            <div className={styles.answerBox}>{answer}</div>
          ) : (
            <div className={styles.empty}>아직 답변이 없어</div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>근거(Context)</h2>
            <span className={styles.badgeSoft}>
              {contexts.length ? `${contexts.length}개` : "0개"}
            </span>
          </div>

          {avgScore != null && (
            <div className={styles.meta}>
              평균 score: <b>{avgScore.toFixed(3)}</b>
            </div>
          )}

          {contexts.length === 0 ? (
            <div className={styles.empty}>근거가 아직 없어</div>
          ) : (
            <div className={styles.ctxList}>
              {contexts.map((c) => (
                <article key={c.id} className={styles.ctxCard}>
                  <div className={styles.ctxTop}>
                    <span className={styles.idBadge}>id {c.id}</span>
                    <span className={styles.score}>
                      score <b>{Number(c.score ?? 0).toFixed(3)}</b>
                    </span>
                  </div>
                  <div className={styles.ctxText}>{c.text}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {toast && (
        <div className={`${styles.toast} ${toast.type === "ok" ? styles.toastOk : styles.toastErr}`}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}
