"""Reporte simple de A/B testing de tono: por cada cta_variant_id, cuantos
mensajes se armaron, cuantos aceptaron la conexion y cuantos respondieron,
segun lo que haya quedado registrado en el dedup store."""
from __future__ import annotations

from dataclasses import dataclass

from dedup_store import DedupStore


@dataclass
class VariantStats:
    variant_id: str
    total: int = 0
    accepted: int = 0
    replied: int = 0

    @property
    def acceptance_rate(self) -> float:
        return (self.accepted / self.total) if self.total else 0.0

    @property
    def reply_rate(self) -> float:
        return (self.replied / self.total) if self.total else 0.0


def compute_variant_report(dedup_store_path: str) -> list[VariantStats]:
    dedup = DedupStore(dedup_store_path)
    stats: dict[str, VariantStats] = {}

    for record in dedup.values():
        variant_id = record.get("cta_variant_id") or "(sin variante)"
        s = stats.setdefault(variant_id, VariantStats(variant_id=variant_id))
        s.total += 1
        status = record.get("status")
        if status in ("accepted", "replied"):
            s.accepted += 1
        if status == "replied":
            s.replied += 1

    return sorted(stats.values(), key=lambda s: s.variant_id)


def format_report(stats: list[VariantStats]) -> str:
    if not stats:
        return "Todavia no hay leads en el dedup store para reportar."

    lines = [
        f"{'Variante':<18} {'Enviados':>9} {'Aceptaron':>10} {'Respondieron':>13} {'% Acept.':>9} {'% Resp.':>8}"
    ]
    lines.append("-" * len(lines[0]))
    for s in stats:
        lines.append(
            f"{s.variant_id:<18} {s.total:>9} {s.accepted:>10} {s.replied:>13} "
            f"{s.acceptance_rate * 100:>8.1f}% {s.reply_rate * 100:>7.1f}%"
        )
    return "\n".join(lines)
