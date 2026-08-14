"""Arma el dato real y especifico de marca que ancla el primer mensaje.

Nunca fabrica especificidad: si no se encuentra un detalle concreto scrapeado del
sitio, cae a un fallback armado solo con columnas ya confiables del excel de
ScoutClub (categoria, AOV, Meta Ads activo), y queda marcado como "generic" para
que se note en la revision en vez de pasar por un dato inventado.

El texto sale en ingles y suena como algo que escribiria una persona ("been looking
at X lately, yours caught my eye"), no como una linea de apertura de plantilla.
"""
from __future__ import annotations

from models import AllianceLead, Hook
from scraping_lite import find_flagship_product_title


def build_hook(lead: AllianceLead) -> Hook:
    product_title = find_flagship_product_title(lead.website)
    if product_title:
        return Hook(
            text=f"noticed the {product_title} in {lead.company_name}'s lineup",
            confidence="specific",
            basis="product_page_title",
        )

    if lead.categoria_mtway:
        text = f"been looking at premium {lead.categoria_mtway.lower()} brands lately and yours caught my eye"
        basis = "categoria_mtway"
    elif lead.meta_ads_activo == "Yes":
        text = f"been seeing {lead.company_name}'s ads out there lately and it caught my eye"
        basis = "meta_ads_activo"
    elif lead.aov_estimado:
        text = "been looking at premium brands in your price range lately and yours caught my eye"
        basis = "aov_estimado"
    else:
        text = f"been checking out what {lead.company_name} is building lately and it caught my eye"
        basis = "company_name_only"

    return Hook(text=text, confidence="generic", basis=basis)
