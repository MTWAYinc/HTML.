"""Arma el primer mensaje de LinkedIn. El hook (que decir sobre la marca, con
que evidencia) lo arma VoiceClub (ver voiceclub/composer.py, el motor de 8
pasos del Copy Operating System); este archivo se queda con el glue especifico
de AllianceClub que VoiceClub no posee: el saludo y el CTA de cierre, que
siempre deriva la llamada a Taha (CPO), nunca a Sindy.

Mensaje corto y directo (2 lineas: saludo+gancho, y CTA), siempre bajo 4
lineas: por eso solo se usa la primera frase del parrafo de hook+insight que
arma VoiceClub (pensado para email, mas largo), no el parrafo completo.

El CTA tiene varias variantes con id fijo (A/B testing de fraseo, independiente
del tono de VoiceClub): cada mensaje queda etiquetado con el id de la variante
de CTA Y con el tono (club/advisory), guardados juntos en el dedup store para
poder comparar despues que combinacion convierte mejor. Ver report.py.
"""
from __future__ import annotations

import hashlib

from composer import compose
from angles_brand import classify_brand_angle
from evidence import Evidence

from models import AllianceLead, Hook, MessageResult

TAHA_CALENDAR_LINK = "https://cal.com/mtway.inc/elite-brands"

CTA_VARIANTS: list[tuple[str, str]] = [
    ("cta_quick_call", "Up for a quick call with Taha, our CPO, to see if it's a fit?"),
    ("cta_15min", "Worth 15 minutes with Taha, our CPO, to see if it makes sense?"),
    ("cta_would_love", "Taha (our CPO) would love to chat, if you're open to it?"),
]


def _pick_cta(seed: str) -> tuple[str, str]:
    idx = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % len(CTA_VARIANTS)
    return CTA_VARIANTS[idx]


def _first_sentence(text: str) -> str:
    first = text.split(". ")[0].strip()
    if not first.endswith((".", "!", "?")):
        first += "."
    return first


def _confidence_label(voice_confidence: str) -> str:
    return "specific" if voice_confidence in ("high", "medium") else "generic"


def _evidence_from_lead(lead: AllianceLead, product_title: str) -> Evidence:
    return Evidence(
        company_name=lead.company_name,
        first_name=lead.first_name,
        country=lead.country,
        domain="brand",
        category=lead.categoria_mtway,
        meta_ads_active=lead.meta_ads_activo,
        aov_estimado=lead.aov_estimado,
        score_icp=lead.score_icp,
        product_title=product_title,
        veredicto_icp=lead.veredicto_icp,
    )


def build_message(lead: AllianceLead, product_title: str, tone: str) -> MessageResult:
    voice = compose(
        _evidence_from_lead(lead, product_title),
        tone,
        classify_brand_angle,
        lead_id=lead.linkedin_url,
        channel="linkedin",
        touch=1,
        include_cta=False,  # el CTA sigue siendo el de llamada con Taha, no el de VoiceClub
    )
    hook_line = _first_sentence(voice.hook_text)
    hook = Hook(
        text=hook_line,
        confidence=_confidence_label(voice.confidence),
        basis=",".join(voice.evidence_used) or "company_name_only",
    )

    first_name = lead.first_name or "there"
    greeting = f"Hi {first_name}, {hook_line}" if lead.first_name else f"Hi, {hook_line}"
    cta_variant_id, cta = _pick_cta(lead.linkedin_url + "cta")

    return MessageResult(
        message="\n".join([greeting, cta]),
        hook=hook,
        cta_variant_id=cta_variant_id,
        tone_variant_id=tone,
    )
