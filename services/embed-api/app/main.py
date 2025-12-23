from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import time

from .settings import MILVUS_HOST, MILVUS_PORT, MILVUS_COLLECTION, EMBED_MODEL
from .embedder import Embedder
from .milvus_client import connect_milvus, ensure_collection

app = FastAPI(title="KURE Embedding API")

embedder: Embedder | None = None
collection = None

# ---------- Schemas ----------
class UpsertItem(BaseModel):
    # ✅ id optional (서버 자동 생성)
    id: Optional[int] = None
    text: str

class UpsertRequest(BaseModel):
    items: List[UpsertItem]
    overwrite: bool = False  # ✅ 같은 id가 있으면 덮어쓸지

class UpsertResponse(BaseModel):
    inserted: int
    ids: List[int]

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

# ---------- Startup ----------
@app.on_event("startup")
def startup():
    global embedder, collection
    embedder = Embedder(EMBED_MODEL)
    connect_milvus(MILVUS_HOST, MILVUS_PORT)
    collection = ensure_collection(MILVUS_COLLECTION, embedder.dim)

@app.get("/health")
def health():
    return {
        "ok": True,
        "model": EMBED_MODEL,
        "dim": embedder.dim if embedder else None,
        "milvus": f"{MILVUS_HOST}:{MILVUS_PORT}",
        "collection": MILVUS_COLLECTION,
    }

def _next_id() -> int:
    # ✅ 간단한 자동 ID 생성: 현재 ms (충돌 가능성 거의 낮음)
    # 더 안전하게 하고 싶으면: max(id) 조회 후 +1 또는 ULID/UUID 써도 됨
    return int(time.time() * 1000)

# ---------- Data APIs ----------
@app.post("/upsert", response_model=UpsertResponse)
def upsert(req: UpsertRequest):
    assert embedder is not None and collection is not None

    # ✅ 서버에서 id 자동 채우기
    ids: List[int] = []
    texts: List[str] = []
    for it in req.items:
        _id = it.id if it.id is not None else _next_id()
        ids.append(int(_id))
        texts.append(it.text)

    vectors = embedder.encode(texts)

    # ✅ overwrite=true면 기존 id 삭제 후 insert
    if req.overwrite and ids:
        try:
            expr = f"id in [{','.join(map(str, ids))}]"
            collection.delete(expr)
        except Exception:
            pass

    collection.insert([ids, vectors, texts])
    collection.flush()
    return {"inserted": len(ids), "ids": ids}

@app.get("/stats")
def stats():
    assert collection is not None
    return {
        "collection": collection.name,
        "num_entities": collection.num_entities,
    }

@app.get("/v1/docs")
def list_docs(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    ✅ Milvus는 '전체 목록'을 DB처럼 편하게 뽑는 기능이 약해서
    - 여기서는 id 범위 기반/랜덤 조회를 하거나
    - 별도 메타 저장소(SQLite/Postgres) 두는 게 정석임

    일단 MVP: offset/limit 흉내 = id를 0~큰수 범위로 query 후 slice (데이터 적을 때만 추천)
    """
    assert collection is not None

    # ⚠️ 데이터가 많아지면 비추. MVP 용도.
    # "id >= 0" 조건으로 쿼리하고, output_fields로 필요한 필드만 받음
    res = collection.query(
        expr="id >= 0",
        output_fields=["id", "text"],
        limit=offset + limit,
    )
    page = res[offset: offset + limit]
    return {
        "items": page,
        "limit": limit,
        "offset": offset,
        "total_hint": collection.num_entities,
    }

@app.get("/v1/docs/{doc_id}")
def get_doc(doc_id: int):
    assert collection is not None
    res = collection.query(
        expr=f"id == {int(doc_id)}",
        output_fields=["id", "text"],
        limit=1,
    )
    if not res:
        raise HTTPException(status_code=404, detail="not found")
    return res[0]

@app.delete("/v1/docs/{doc_id}")
def delete_doc(doc_id: int):
    assert collection is not None
    collection.delete(expr=f"id == {int(doc_id)}")
    collection.flush()
    return {"deleted": True, "id": int(doc_id)}

@app.delete("/v1/docs")
def delete_all_docs(confirm: bool = False):
    """
    ✅ 안전장치: confirm=true 없으면 400
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="set confirm=true to delete all")
    assert collection is not None
    collection.delete(expr="id >= 0")
    collection.flush()
    return {"deleted_all": True}

# ---------- Search ----------
@app.post("/search")
def search(req: SearchRequest):
    assert embedder is not None and collection is not None
    qv = embedder.encode([req.query])[0]
    results = collection.search(
        data=[qv],
        anns_field="embedding",
        param={"ef": 64},
        limit=req.top_k,
        output_fields=["text", "id"],
    )

    hits = []
    for hit in results[0]:
        hits.append({
            "id": hit.entity.get("id"),
            "score": float(hit.score),
            "text": hit.entity.get("text"),
        })
    return {"hits": hits}
