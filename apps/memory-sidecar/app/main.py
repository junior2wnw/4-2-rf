from __future__ import annotations

import hashlib
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import chromadb
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from mempalace.searcher import search_memories

COLLECTION_NAME = "mempalace_drawers"
LOGGER = logging.getLogger("four-two.memory-sidecar")


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=5, ge=1, le=10)
    wing: Optional[str] = Field(default=None, max_length=128)
    room: Optional[str] = Field(default=None, max_length=128)


class DrawerRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    wing: str = Field(default="4-2", min_length=1, max_length=128)
    room: str = Field(default="product", min_length=1, max_length=128)
    source_file: str = Field(default="manual://sidecar", min_length=1, max_length=512)


def palace_path() -> str:
    value = os.getenv("MEMORY_PALACE_PATH", "/data/palace")
    Path(value).mkdir(parents=True, exist_ok=True)
    return value


def get_collection():
    client = chromadb.PersistentClient(path=palace_path())
    return client.get_or_create_collection(COLLECTION_NAME)


def drawer_id(source_file: str, room: str, text: str) -> str:
    digest = hashlib.sha256(f"{source_file}:{room}:{text}".encode("utf-8")).hexdigest()[:24]
    return f"drawer_{digest}"


def ensure_bootstrap_drawer() -> None:
    collection = get_collection()
    existing = collection.count()
    if existing > 0:
        return

    text = os.getenv("MEMORY_BOOTSTRAP_TEXT", "4-2.рф memory bootstrap")
    try:
        collection.upsert(
            ids=[drawer_id("bootstrap://memory", "system", text)],
            documents=[text],
            metadatas=[
                {
                    "wing": "public-playbooks",
                    "room": "system",
                    "source_file": "bootstrap://memory",
                    "chunk_index": 0,
                    "added_by": "memory-sidecar",
                    "filed_at": datetime.now(timezone.utc).isoformat(),
                }
            ],
        )
    except Exception:
        # Keep the sidecar available even when the first embedding bootstrap is slow or flaky.
        LOGGER.exception("bootstrap drawer initialization failed")


def require_internal_api_key(x_memory_sidecar_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("MEMORY_SIDECAR_API_KEY", "local-memory-sidecar-key")
    if not x_memory_sidecar_key or not secrets.compare_digest(x_memory_sidecar_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid memory sidecar key.",
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_bootstrap_drawer()
    yield


app = FastAPI(title="4-2 memory sidecar", version="0.1.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    collection = get_collection()
    return {
        "status": "ok",
        "collection": COLLECTION_NAME,
        "count": collection.count(),
        "palace_path": palace_path(),
    }


@app.post("/v1/search")
async def search(payload: SearchRequest, _: None = Depends(require_internal_api_key)):
    result = search_memories(
        query=payload.query,
        palace_path=palace_path(),
        wing=payload.wing,
        room=payload.room,
        n_results=payload.limit,
    )

    if "error" in result:
        raise HTTPException(status_code=503, detail=result["error"])

    items = []
    for entry in result.get("results", []):
        items.append(
            {
                "text": entry.get("text", ""),
                "wing": entry.get("wing", "unknown"),
                "room": entry.get("room", "unknown"),
                "sourceFile": entry.get("source_file", "?"),
                "similarity": entry.get("similarity", 0),
            }
        )

    return {
        "query": payload.query,
        "results": items,
    }


@app.post("/v1/drawers")
async def add_drawer(payload: DrawerRequest, _: None = Depends(require_internal_api_key)):
    collection = get_collection()
    doc_id = drawer_id(payload.source_file, payload.room, payload.text)
    collection.upsert(
        ids=[doc_id],
        documents=[payload.text],
        metadatas=[
            {
                "wing": payload.wing,
                "room": payload.room,
                "source_file": payload.source_file,
                "chunk_index": 0,
                "added_by": "memory-sidecar",
                "filed_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
    )

    return {
        "id": doc_id,
        "stored": True,
    }
