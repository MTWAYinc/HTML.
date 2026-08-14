"""Arma el primer mensaje de LinkedIn en tono 'MTWAY Club': invitacion, exclusividad,
nunca generico ni de venta directa. Corto y directo (2 lineas: saludo+gancho, y CTA),
siempre bajo 4 lineas, sin guiones largos.

El mensaje sale en ingles porque el universo de leads (founders D2C en US/UK/AU/CA)
es angloparlante. El CTA de cierre siempre deriva la llamada a Taha (CPO), nunca a
Sindy: ninguna llamada del sistema MTWAY la atiende Sindy.

El CTA tiene varias variantes con id fijo (A/B testing de tono): cada mensaje queda
etiquetado con el id de la variante que uso, y ese id se guarda en el dedup store
junto con el estado (accepted/replied) para poder despues comparar que variante
convierte mejor. Ver report.py.
"""
from __future__ import annotations

import hashlib

from models import AllianceLead, Hook

# Reservado para cuando se conecte ShowUpClub y pueda popular el link real de
# booking de Taha. Nunca debe apuntar al calendario de Sindy.
TAHA_CALENDAR_LINK = ""

CTA_VARIANTS: list[tuple[str, str]] = [
    ("cta_quick_call", "Up for a quick call with Taha, our CPO, to see if it's a fit?"),
    ("cta_15min", "Worth 15 minutes with Taha, our CPO, to see if it makes sense?"),
    ("cta_would_love", "Taha (our CPO) would love to chat, if you're open to it?"),
]


def _pick_cta(seed: str) -> tuple[str, str]:
    idx = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % len(CTA_VARIANTS)
    return CTA_VARIANTS[idx]


def build_message(lead: AllianceLead, hook: Hook) -> tuple[str, str]:
    """Devuelve (mensaje, cta_variant_id)."""
    first_name = lead.first_name or "there"
    greeting = f"Hi {first_name}, {hook.text}." if lead.first_name else f"Hi, {hook.text}."
    variant_id, cta = _pick_cta(lead.linkedin_url + "cta")
    return "\n".join([greeting, cta]), variant_id
