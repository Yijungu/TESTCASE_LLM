from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os, requests, re
from collections import Counter
from typing import List, Dict, Any, Tuple

app = FastAPI(title="LLM Service (Ollama gpt-oss + RAG)")

EMBED_API_URL = os.getenv("EMBED_API_URL", "http://embed-api:8000").rstrip("/")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss:20b")

MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "4000"))
OLLAMA_TIMEOUT_SEC = int(os.getenv("OLLAMA_TIMEOUT_SEC", "600"))

# ✅ 권장: 컨텍스트(토큰) 크기 / 출력 제한
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "4096"))
OLLAMA_NUM_PREDICT_1 = int(os.getenv("OLLAMA_NUM_PREDICT_1", "160"))
OLLAMA_NUM_PREDICT_2 = int(os.getenv("OLLAMA_NUM_PREDICT_2", "120"))

# ✅ stop 토큰(생각/태그/폭주 패턴 방지)
OLLAMA_STOP = os.getenv(
    "OLLAMA_STOP",
    "<thought>,</thought>,<think>,</think>"
).split(",")

# ✅ system: 한국어/근거 기반/추론 비노출 강제
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "너는 한국어로만 답하는 도우미다. "
    "내부 사고/추론 과정(thought/think)을 절대 출력하지 마라. "
    "주어진 근거(Context)에 있는 내용만 사용해 답하라."
)

class AskRequest(BaseModel):
    question: str
    top_k: int = 5

@app.get("/health")
def health():
    return {
        "ok": True,
        "embed_api": EMBED_API_URL,
        "ollama": OLLAMA_URL,
        "model": OLLAMA_MODEL,
        "num_ctx": OLLAMA_NUM_CTX,
        "stop": OLLAMA_STOP,
        "timeout_sec": OLLAMA_TIMEOUT_SEC,
    }

def _is_gibberish(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < 10:
        return True

    # 1) 숫자/기호 반복 폭주 (예: "5. 5. 5.", "**", "A:" 등)
    if re.search(r"(\b\d+\.\s*){10,}", t):
        return True
    if t.count("A:") >= 5 or t.count("**") >= 10:
        return True

    # 2) 동일 토큰 과다 반복
    tokens = re.findall(r"[가-힣A-Za-z0-9]+", t)
    if len(tokens) >= 30:
        top, cnt = Counter(tokens).most_common(1)[0]
        if cnt / len(tokens) > 0.35:
            return True

    # 3) 생각 태그가 섞이면 바로 실패 처리
    lowered = t.lower()
    if "<thought>" in lowered or "</thought>" in lowered or "<think>" in lowered or "</think>" in lowered:
        return True

    return False

def _fallback_answer(question: str, hits: List[Dict[str, Any]]) -> str:
    # LLM이 계속 폭주할 때라도 "근거 기반" 답변을 최소 보장
    lines = []
    used_ids = []

    for h in hits[:3]:
        used_ids.append(h.get("id"))
        txt = (h.get("text") or "").strip()
        if txt:
            lines.append(txt)

    if not lines:
        return "근거 부족"

    # 근거 1~3개를 자연스럽게 연결
    ans = " ".join(lines).strip()
    used = ", ".join([str(i) for i in used_ids if i is not None])
    return f"{ans}\n근거: {used}"

def _call_ollama_generate(prompt: str, options: Dict[str, Any]) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        # ✅ system 을 별도 필드로(지원 시 효과)
        "system": SYSTEM_PROMPT,
        "prompt": prompt,
        "stream": False,
        # ✅ gpt-oss 계열에서 thinking 출력 억제(지원 시 효과)
        "think": False,
        "options": {
            **options,
            # ✅ 컨텍스트 길이 / stop 토큰 주입
            "num_ctx": OLLAMA_NUM_CTX,
            "stop": OLLAMA_STOP,
        },
    }

    try:
        # ✅ connect timeout 10초 + read timeout 크게
        o = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json=payload,
            timeout=(10, OLLAMA_TIMEOUT_SEC),
        )
        o.raise_for_status()
        data = o.json()
        return (data.get("response") or "").strip()

    except requests.RequestException as e:
        # 가능하면 바디 일부를 함께 반환해서 디버깅 도움
        body = ""
        try:
            body = o.text[:800]  # type: ignore
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"ollama request failed: {e} | body={body}")

@app.post("/ask")
def ask(req: AskRequest):
    # 1) retrieve
    try:
        r = requests.post(
            f"{EMBED_API_URL}/search",
            json={"query": req.question, "top_k": req.top_k},
            timeout=(10, 120),
        )
        r.raise_for_status()
        hits = r.json().get("hits", []) or []
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"embed-api request failed: {e}")

    # 2) context (평문, 짧게)
    context_lines = [f"(id={h.get('id')}) {h.get('text','')}" for h in hits]
    context = "\n".join(context_lines).strip()

    if len(context) > MAX_CONTEXT_CHARS:
        context = context[:MAX_CONTEXT_CHARS]

    # ✅ 프롬프트는 평문 + 강제 포맷 최소화
    prompt = (
        "지시사항:\n"
        "- 한국어로만 답한다.\n"
        "- 아래 '근거'에 있는 내용만 사용한다.\n"
        "- 근거에 없는 내용은 '근거 부족'이라고 말한다.\n"
        "- 2~4문장으로 간결히 답한다.\n"
        "- 마지막 줄에 사용한 근거 id를 '근거: id1, id2' 형식으로 적는다.\n"
        "- 내부 사고/추론(thought/think) 또는 태그를 절대 출력하지 않는다.\n\n"
        f"질문: {req.question}\n\n"
        f"근거:\n{context}\n\n"
        "답변:"
    )

    # 3) generate (안정 옵션 1)
    options_1 = {
        "num_predict": OLLAMA_NUM_PREDICT_1,
        "temperature": 0.0,
        "top_p": 0.9,
        "top_k": 40,
        "repeat_penalty": 1.25,
    }

    answer = _call_ollama_generate(prompt, options_1)

    # 4) 폭주하면 재시도(더 짧고 더 억제)
    if _is_gibberish(answer):
        options_2 = {
            "num_predict": OLLAMA_NUM_PREDICT_2,
            "temperature": 0.0,
            "top_p": 0.85,
            "top_k": 30,
            "repeat_penalty": 1.35,
        }
        answer = _call_ollama_generate(prompt, options_2)

    # 5) 그래도 폭주면 fallback
    if _is_gibberish(answer):
        answer = _fallback_answer(req.question, hits)

    return {"answer": answer, "contexts": hits, "model": OLLAMA_MODEL}
