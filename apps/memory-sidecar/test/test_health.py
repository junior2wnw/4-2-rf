import sys
import types

from fastapi.testclient import TestClient


class _FakeCollection:
    def count(self):
        return 1

    def upsert(self, **_kwargs):
        return None


class _FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    def get_or_create_collection(self, _name):
        return _FakeCollection()


chromadb_module = types.ModuleType("chromadb")
chromadb_module.PersistentClient = _FakeClient
sys.modules.setdefault("chromadb", chromadb_module)

mempalace_module = types.ModuleType("mempalace")
searcher_module = types.ModuleType("mempalace.searcher")
searcher_module.search_memories = lambda **_kwargs: {"results": []}
sys.modules.setdefault("mempalace", mempalace_module)
sys.modules.setdefault("mempalace.searcher", searcher_module)

from app.main import app


def test_healthz():
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_drawer_write_requires_internal_key():
    client = TestClient(app)
    response = client.post(
        "/v1/drawers",
        json={
            "text": "hello",
            "wing": "public-playbooks",
            "room": "playbooks",
            "source_file": "test://case",
        },
    )
    assert response.status_code == 401
