# services/embed-api/app/milvus_client.py
from pymilvus import (
    connections, utility, FieldSchema, CollectionSchema, DataType, Collection
)

def connect_milvus(host: str, port: int):
    connections.connect(alias="default", host=host, port=str(port))

def ensure_collection(name: str, dim: int) -> Collection:
    if not utility.has_collection(name):
        fields = [
            # ✅ Milvus가 자동 발급하는 PK
            FieldSchema(name="pk", dtype=DataType.INT64, is_primary=True, auto_id=True),

            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=dim),
            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=2048),

            # ✅ (선택) 외부에서 관리하고 싶은 문서 ID
            FieldSchema(name="doc_id", dtype=DataType.VARCHAR, max_length=256),
        ]
        schema = CollectionSchema(fields, description="KURE embeddings")
        col = Collection(name=name, schema=schema)

        col.create_index(
            field_name="embedding",
            index_params={
                "index_type": "HNSW",
                "metric_type": "COSINE",
                "params": {"M": 16, "efConstruction": 200},
            },
        )
    else:
        col = Collection(name)

    col.load()
    return col
