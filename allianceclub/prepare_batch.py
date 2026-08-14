"""Orquesta la preparacion de una tanda de AllianceClub: carga leads de las dos
fuentes, excluye ya procesados, prioriza, corta al cupo vigente, arma gancho +
mensaje por lead, y escribe los dos archivos de salida (revision + import Waalaxy)."""
from __future__ import annotations

import csv
import logging
import os
from dataclasses import dataclass

import openpyxl

from dedup_store import DedupStore
from hooks import build_hook
from lead_sources import load_all_candidates, normalize_linkedin_url
from message import TAHA_CALENDAR_LINK, build_message
from models import BatchLead
from quota import QuotaLog

REVIEW_HEADERS = [
    "Company Name",
    "Founder",
    "Title",
    "LinkedIn Url",
    "Fuente",
    "Score/Veredicto ICP",
    "Gancho",
    "Confianza gancho",
    "Mensaje completo",
    "CTA Variant",
    "Call Link (Taha)",
]

WAALAXY_HEADERS = [
    "First Name",
    "Last Name",
    "Company Name",
    "LinkedIn Url",
    "Mensaje",
    "Call Link (Taha)",
]


@dataclass
class PrepareResult:
    total_candidates: int
    skipped_dedup: int
    skipped_no_quota: int
    batch: list[BatchLead]
    quota_remaining_before: int
    quota_used_after: int
    review_path: str | None
    waalaxy_csv_path: str | None


def run_prepare(
    nuevos_leads_path: str,
    referencia_path: str,
    dedup_store_path: str,
    quota_log_path: str,
    cap: int,
    period_days: int,
    output_dir: str,
    logger: logging.Logger,
    dry_run: bool = False,
) -> PrepareResult:
    candidates = load_all_candidates(nuevos_leads_path, referencia_path)
    logger.info("Candidatos cargados de ambas fuentes: %d", len(candidates))

    dedup = DedupStore(dedup_store_path)
    quota = QuotaLog(quota_log_path)
    remaining_before = quota.remaining(cap, period_days)
    logger.info("Cupo restante en la ventana de %d dias (cap=%d): %d", period_days, cap, remaining_before)

    seen_in_batch: set[str] = set()
    eligible = []
    skipped_dedup = 0
    for lead in candidates:
        key = normalize_linkedin_url(lead.linkedin_url)
        if not key:
            continue
        if key in seen_in_batch:
            continue
        if key in dedup:
            skipped_dedup += 1
            logger.info("SALTADO (dedup, estado previo=%s): %s", dedup.get(key), key)
            continue
        seen_in_batch.add(key)
        eligible.append(lead)

    eligible.sort(key=lambda lead: lead.priority_key)

    to_send = eligible[:remaining_before]
    skipped_no_quota = max(0, len(eligible) - len(to_send))
    if skipped_no_quota:
        logger.info("SALTADOS por cupo agotado: %d leads elegibles no entraron en esta tanda", skipped_no_quota)

    batch: list[BatchLead] = []
    for lead in to_send:
        hook = build_hook(lead)
        msg, cta_variant_id = build_message(lead, hook)
        batch.append(
            BatchLead(
                lead=lead,
                hook=hook,
                message=msg,
                cta_variant_id=cta_variant_id,
                call_link=TAHA_CALENDAR_LINK,
            )
        )
        logger.info(
            "Gancho %s (%s) para %s: %s | CTA variant: %s",
            hook.confidence,
            hook.basis,
            lead.company_name,
            hook.text,
            cta_variant_id,
        )

    review_path = None
    waalaxy_csv_path = None
    if not dry_run and batch:
        os.makedirs(output_dir, exist_ok=True)
        review_path = os.path.join(output_dir, "AllianceClub - tanda para revision.xlsx")
        waalaxy_csv_path = os.path.join(output_dir, "AllianceClub - waalaxy_import.csv")
        _write_review_excel(batch, review_path)
        _write_waalaxy_csv(batch, waalaxy_csv_path)

        for bl in batch:
            key = normalize_linkedin_url(bl.lead.linkedin_url)
            dedup.mark(
                key,
                status="queued",
                company_name=bl.lead.company_name,
                hook_confidence=bl.hook.confidence,
                cta_variant_id=bl.cta_variant_id,
            )
        quota.record_batch(len(batch))

    return PrepareResult(
        total_candidates=len(candidates),
        skipped_dedup=skipped_dedup,
        skipped_no_quota=skipped_no_quota,
        batch=batch,
        quota_remaining_before=remaining_before,
        quota_used_after=len(batch),
        review_path=review_path,
        waalaxy_csv_path=waalaxy_csv_path,
    )


def _write_review_excel(batch: list[BatchLead], path: str) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Tanda AllianceClub"
    ws.append(REVIEW_HEADERS)
    for bl in batch:
        lead = bl.lead
        score_o_veredicto = lead.score_icp if lead.source == "nuevos_leads" else lead.veredicto_icp
        ws.append(
            [
                lead.company_name,
                lead.full_name,
                lead.title,
                lead.linkedin_url,
                lead.source,
                score_o_veredicto,
                bl.hook.text,
                bl.hook.confidence,
                bl.message,
                bl.cta_variant_id,
                bl.call_link,
            ]
        )
    wb.save(path)


def _write_waalaxy_csv(batch: list[BatchLead], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(WAALAXY_HEADERS)
        for bl in batch:
            lead = bl.lead
            writer.writerow(
                [
                    lead.first_name,
                    lead.last_name,
                    lead.company_name,
                    lead.linkedin_url,
                    bl.message,
                    bl.call_link,
                ]
            )
