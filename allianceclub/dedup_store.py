"""Store JSON persistente de leads (por LinkedIn URL) ya procesados por AllianceClub."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone


class DedupStore:
    def __init__(self, path: str):
        self.path = path
        self._data: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            self._data = {}

    def __contains__(self, linkedin_url: str) -> bool:
        return linkedin_url in self._data

    def get(self, linkedin_url: str) -> dict | None:
        return self._data.get(linkedin_url)

    def values(self):
        return self._data.values()

    def mark(self, linkedin_url: str, **fields) -> None:
        record = self._data.get(linkedin_url) or {
            "first_marked_at": datetime.now(timezone.utc).isoformat(),
            "source": "allianceclub_run",
        }
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        record.update(fields)
        self._data[linkedin_url] = record
        self._flush()

    def _flush(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        dir_ = os.path.dirname(self.path) or "."
        fd, tmp_path = tempfile.mkstemp(dir=dir_, prefix=".dedup_store_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False, default=str)
            os.replace(tmp_path, self.path)
        except BaseException:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

    def __len__(self) -> int:
        return len(self._data)
