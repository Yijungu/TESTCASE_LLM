"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

type DocItem = { id: number; text: string };

export default function AdminPage() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<DocItem[]>([]);
  const [stats, setStats] = useState<any>(null);

  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState(""); // 🔎 local search

  const [busy, setBusy] = useState<{ upsert?: boolean; list?: boolean; stats?: boolean; del?: boolean }>({});
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

  const refreshStats = async () => {
    setBusy((b) => ({ ...b, stats: true }));
    try {
      const data = await api("/api/stats");
      setStats(data);
    } catch (e: any) {
      showToast("err", `통계 조회 실패: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, stats: false }));
    }
  };

  const refreshList = async (o = offset, l = limit) => {
    setBusy((b) => ({ ...b, list: true }));
    try {
      const data = await api(`/api/docs?limit=${l}&offset=${o}`);
      setItems(data.items ?? []);
    } catch (e: any) {
      showToast("err", `목록 조회 실패: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, list: false }));
    }
  };

  useEffect(() => {
    refreshStats();
    refreshList(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const key = q.trim();
    if (!key) return items;
    return items.filter((it) => it.text.includes(key) || String(it.id).includes(key));
  }, [items, q]);

  const upsert = async () => {
    const payloadItems = text
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ text: t })); // ✅ id 없이

    if (payloadItems.length === 0) {
      showToast("err", "업서트할 문장이 없어.");
      return;
    }

    setBusy((b) => ({ ...b, upsert: true }));
    try {
      const data = await api("/api/docs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ items: payloadItems, overwrite: false }),
      });

      showToast("ok", `업서트 완료: ${data.inserted ?? "?"}건`);
      setText("");
      setOffset(0);
      await refreshStats();
      await refreshList(0, limit);
    } catch (e: any) {
      showToast("err", `업서트 실패: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, upsert: false }));
    }
  };

  const delOne = async (id: number) => {
    if (!window.confirm(`id=${id} 문서를 삭제할까?`)) return;

    setBusy((b) => ({ ...b, del: true }));
    try {
      await api(`/api/docs/${id}`, { method: "DELETE" });
      showToast("ok", `삭제 완료: id=${id}`);
      await refreshStats();
      await refreshList(offset, limit);
    } catch (e: any) {
      showToast("err", `삭제 실패: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, del: false }));
    }
  };

  const delAll = async () => {
    const step1 = window.confirm("⚠️ 전체 삭제는 되돌릴 수 없어. 진행할까?");
    if (!step1) return;
    const step2 = window.prompt(`확인을 위해 "DELETE" 를 입력해줘`) === "DELETE";
    if (!step2) {
      showToast("err", "취소됨(확인 문자열 불일치)");
      return;
    }

    setBusy((b) => ({ ...b, del: true }));
    try {
      const data = await api(`/api/docs?confirm=true`, { method: "DELETE" });
      showToast("ok", `전체 삭제 완료: ${data.deleted ?? "?"}건`);
      setOffset(0);
      await refreshStats();
      await refreshList(0, limit);
    } catch (e: any) {
      showToast("err", `전체 삭제 실패: ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, del: false }));
    }
  };

  const applyPaging = async () => {
    setOffset(0);
    await refreshList(0, limit);
  };

  const nextPage = async () => {
    const o = offset + limit;
    setOffset(o);
    await refreshList(o, limit);
  };

  const prevPage = async () => {
    const o = Math.max(0, offset - limit);
    setOffset(o);
    await refreshList(o, limit);
  };

  const copying = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      showToast("ok", "클립보드에 복사했어");
    } catch {
      showToast("err", "복사 실패(권한/브라우저 정책)");
    }
  };

  const isBusy = !!(busy.upsert || busy.list || busy.stats || busy.del);

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>데이터 관리</h1>
          <p className={styles.subtitle}>Milvus 문서 업서트 / 조회 / 삭제</p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.btnGhost}
            onClick={async () => {
              await refreshStats();
              await refreshList(offset, limit);
            }}
            disabled={isBusy}
          >
            새로고침
          </button>
          <button className={styles.btnDanger} onClick={delAll} disabled={isBusy} title="전체삭제(2중 확인)">
            전체삭제
          </button>
        </div>
      </header>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>통계</h2>
            <span className={styles.badge}>{busy.stats ? "loading…" : "ready"}</span>
          </div>

          <div className={styles.kv}>
            <div className={styles.kvRow}>
              <div className={styles.k}>collection</div>
              <div className={styles.v}>{stats?.collection ?? "-"}</div>
            </div>
            <div className={styles.kvRow}>
              <div className={styles.k}>num_entities</div>
              <div className={styles.v}>{stats?.num_entities ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>업서트</h2>
            <span className={styles.badge}>{busy.upsert ? "업서트 중…" : "대기"}</span>
          </div>

          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={`줄바꿈으로 여러 문장 입력\n예)\n인권은 모든 사람이 존엄과 가치를 지니며 평등하다는 원칙이다.\n법은 개인의 자유와 권리를 보장하고 사회 질서를 유지한다.`}
          />

          <div className={styles.rowBetween}>
            <div className={styles.miniHelp}>
              {text.trim() ? `입력 라인: ${text.split("\n").filter((l) => l.trim()).length}` : "id는 서버에서 자동 생성"}
            </div>
            <button className={styles.btnPrimary} onClick={upsert} disabled={busy.upsert || busy.del}>
              업서트
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card} style={{ marginTop: 14 }}>
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardTitle}>목록 조회</h2>
          <span className={styles.badge}>{busy.list ? "불러오는 중…" : `offset=${offset}`}</span>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <label className={styles.labelInline}>
              limit
              <input
                className={styles.input}
                type="number"
                value={limit}
                min={1}
                max={200}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>

            <button className={styles.btnGhost} onClick={applyPaging} disabled={busy.list || busy.del}>
              적용
            </button>

            <input
              className={styles.input}
              style={{ width: 260 }}
              placeholder="검색(id 또는 포함 문자열)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className={styles.toolbarRight}>
            <button className={styles.btnGhost} onClick={prevPage} disabled={offset === 0 || busy.list || busy.del}>
              이전
            </button>
            <button className={styles.btnGhost} onClick={nextPage} disabled={busy.list || busy.del}>
              다음
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>데이터 없음</div>
          ) : (
            filtered.map((it) => (
              <article key={it.id} className={styles.itemCard}>
                <div className={styles.itemTop}>
                  <div className={styles.itemId}>
                    <span className={styles.idBadge}>id {it.id}</span>
                    <button className={styles.btnTiny} onClick={() => copying(String(it.id))}>
                      id 복사
                    </button>
                  </div>

                  <div className={styles.itemActions}>
                    <button className={styles.btnTiny} onClick={() => copying(it.text)}>
                      text 복사
                    </button>
                    <button className={styles.btnTinyDanger} onClick={() => delOne(it.id)} disabled={busy.del}>
                      삭제
                    </button>
                  </div>
                </div>

                <div className={styles.itemText}>{it.text}</div>
              </article>
            ))
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
