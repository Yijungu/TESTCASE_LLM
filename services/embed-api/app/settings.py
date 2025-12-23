import os

MILVUS_HOST = os.getenv("MILVUS_HOST", "standalone")
MILVUS_PORT = int(os.getenv("MILVUS_PORT", "19530"))
MILVUS_COLLECTION = os.getenv("MILVUS_COLLECTION", "kure_docs")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nlpai-lab/KURE-v1")
