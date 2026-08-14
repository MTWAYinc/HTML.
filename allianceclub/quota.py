"""Tracking del cupo de conexiones usado, para no exceder el limite del plan de Waalaxy
vigente (el cupo es un parametro, no un numero fijo: Sindy lo ajusta segun el plan que
tenga activo en Waalaxy en cada momento)."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone


class QuotaLog:
    def __init__(self, path: str):
        self.path = path
        self._entries: list[dict] = []
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                self._entries = json.load(f)
        else:
            self._entries = []

    def used_in_period(self, period_days: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
        total = 0
        for entry in self._entries:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts >= cutoff:
                total += entry["count"]
        return total

    def remaining(self, cap: int, period_days: int) -> int:
        return max(0, cap - self.used_in_period(period_days))

    def record_batch(self, count: int) -> None:
        if count <= 0:
            return
        self._entries.append(
            {"timestamp": datetime.now(timezone.utc).isoformat(), "count": count}
        )
        self._flush()

    def _flush(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        dir_ = os.path.dirname(self.path) or "."
        fd, tmp_path = tempfile.mkstemp(dir=dir_, prefix=".quota_log_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self._entries, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, self.path)
        except BaseException:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
