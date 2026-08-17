"""Dataclasses compartidos entre los modulos de AllianceClub."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AllianceLead:
    """Lead normalizado desde cualquiera de las dos fuentes de ScoutClub."""

    company_name: str
    first_name: str
    last_name: str
    title: str
    email: str
    linkedin_url: str
    website: str
    country: str
    categoria_mtway: str
    source: str  # "nuevos_leads" | "referencia_522"
    score_icp: int | None = None  # solo nuevos_leads
    meta_ads_activo: str = ""  # solo nuevos_leads: "Yes" | "No" | ""
    aov_estimado: str = ""  # solo nuevos_leads
    veredicto_icp: str = ""  # solo referencia_522: "ICP directo" | "ICP probable"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def priority_key(self) -> tuple:
        """Orden de prioridad: nuevos_leads con score alto primero, despues
        referencia_522 por veredicto (directo antes que probable)."""
        if self.source == "nuevos_leads":
            return (0, -(self.score_icp or 0))
        veredicto_rank = 0 if self.veredicto_icp == "ICP directo" else 1
        return (1, veredicto_rank)


@dataclass
class Hook:
    text: str
    confidence: str  # "specific" | "generic"
    basis: str  # de donde salio, para auditoria en el excel de revision


@dataclass
class MessageResult:
    """Salida de message.py::build_message: el mensaje final ya armado mas
    toda la metadata de variantes que hay que persistir en el dedup store."""

    message: str
    hook: Hook
    cta_variant_id: str = ""  # A/B de fraseo del CTA de llamada con Taha, ver message.py
    tone_variant_id: str = ""  # "club" | "advisory" de VoiceClub, ver voiceclub/tone.py


@dataclass
class BatchLead:
    """Un AllianceLead ya con gancho y mensaje armados, listo para revision."""

    lead: AllianceLead
    hook: Hook
    message: str
    cta_variant_id: str = ""  # A/B de fraseo del CTA de llamada con Taha, ver message.py
    tone_variant_id: str = ""  # "club" | "advisory" de VoiceClub, ver voiceclub/tone.py
    # Reservado para cuando ShowUpClub conecte el booking real de Taha (nunca de
    # Sindy). Vacio hasta entonces.
    call_link: str = ""
