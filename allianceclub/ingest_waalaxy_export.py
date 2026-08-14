"""Ingesta el CSV que Sindy exporta desde Waalaxy despues de correr una campana
(aceptadas / respondidas), actualiza el dedup store por LinkedIn URL, y agrega
cualquier lead que respondio a la hoja de pendientes de manejo manual.

El nombre y los valores exactos de las columnas del export de Waalaxy no se pueden
confirmar hasta que la cuenta exista, asi que el mapeo es configurable por CLI en
vez de asumido: ver --col-linkedin, --col-status, --replied-values, --accepted-values
en allianceclub.py. Ajustar los defaults de este archivo con el primer export real.
"""
from __future__ import annotations

import csv
import logging
import os
from dataclasses import dataclass

import openpyxl

from dedup_store import DedupStore
from lead_sources import normalize_linkedin_url


PENDIENTES_HEADERS = [
    "Company Name",
    "LinkedIn Url",
    "Estado Waalaxy (crudo)",
    "Detectado como",
]

DEFAULT_COL_LINKEDIN = "LinkedIn Url"
DEFAULT_COL_STATUS = "Status"
DEFAULT_REPLIED_VALUES = ["replied", "responded"]
DEFAULT_ACCEPTED_VALUES = ["accepted", "connected"]


@dataclass
class IngestResult:
    rows_read: int = 0
    not_in_dedup: int = 0
    marked_accepted: int = 0
    marked_replied: int = 0
    pendientes_path: str | None = None


def run_ingest(
    export_csv_path: str,
    dedup_store_path: str,
    output_dir: str,
    logger: logging.Logger,
    col_linkedin: str = DEFAULT_COL_LINKEDIN,
    col_status: str = DEFAULT_COL_STATUS,
    replied_values: list[str] | None = None,
    accepted_values: list[str] | None = None,
) -> IngestResult:
    replied_values = replied_values if replied_values is not None else DEFAULT_REPLIED_VALUES
    accepted_values = accepted_values if accepted_values is not None else DEFAULT_ACCEPTED_VALUES
    dedup = DedupStore(dedup_store_path)
    result = IngestResult()
    replied_rows: list[dict] = []

    with open(export_csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if col_linkedin not in (reader.fieldnames or []):
            raise ValueError(
                f"Columna '{col_linkedin}' no encontrada en el export. "
                f"Columnas disponibles: {reader.fieldnames}"
            )
        for row in reader:
            result.rows_read += 1
            key = normalize_linkedin_url(row.get(col_linkedin, ""))
            if not key:
                continue
            raw_status = (row.get(col_status) or "").strip()
            status_lower = raw_status.lower()

            if key not in dedup:
                result.not_in_dedup += 1
                logger.warning("Lead no encontrado en dedup store (se ignora): %s", key)
                continue

            if status_lower in [v.lower() for v in replied_values]:
                dedup.mark(key, status="replied", waalaxy_raw_status=raw_status)
                result.marked_replied += 1
                replied_rows.append(
                    {
                        "company_name": (dedup.get(key) or {}).get("company_name", ""),
                        "linkedin_url": row.get(col_linkedin, ""),
                        "raw_status": raw_status,
                        "detected_as": "replied",
                    }
                )
                logger.info("RESPONDIO: %s (%s)", key, raw_status)
            elif status_lower in [v.lower() for v in accepted_values]:
                dedup.mark(key, status="accepted", waalaxy_raw_status=raw_status)
                result.marked_accepted += 1
                logger.info("ACEPTADA: %s (%s)", key, raw_status)
            else:
                dedup.mark(key, waalaxy_raw_status=raw_status)
                logger.info("Estado sin mapear para %s: '%s' (se guarda crudo, no dispara accion)", key, raw_status)

    if replied_rows:
        result.pendientes_path = _append_pendientes(replied_rows, output_dir)

    return result


def _append_pendientes(rows: list[dict], output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "AllianceClub - pendientes de manejo manual.xlsx")

    if os.path.exists(path):
        wb = openpyxl.load_workbook(path)
        ws = wb.active
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Pendientes"
        ws.append(PENDIENTES_HEADERS)

    for row in rows:
        ws.append([row["company_name"], row["linkedin_url"], row["raw_status"], row["detected_as"]])

    wb.save(path)
    return path
