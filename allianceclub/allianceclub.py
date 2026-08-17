#!/usr/bin/env python3
"""AllianceClub: prepara tandas de outreach de LinkedIn (Waalaxy) e ingiere sus
resultados.

Uso:
    python3 allianceclub.py prepare --cap 100 --period-days 30
    python3 allianceclub.py ingest-waalaxy-export --export path/al/export.csv
    python3 allianceclub.py report
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "voiceclub"))

from ingest_waalaxy_export import (
    DEFAULT_ACCEPTED_VALUES,
    DEFAULT_COL_LINKEDIN,
    DEFAULT_COL_STATUS,
    DEFAULT_REPLIED_VALUES,
    run_ingest,
)
from prepare_batch import run_prepare
from report import compute_variant_report, compute_tone_report, format_report, format_tone_report

DEFAULT_NUEVOS_LEADS = "../scoutclub_nuevos_leads_template.xlsx"
DEFAULT_REFERENCIA = "../scoutclub_referencia_522.xlsx"
DEFAULT_DEDUP_STORE = "data/dedup_store.json"
DEFAULT_QUOTA_LOG = "data/quota_log.json"
DEFAULT_OUTPUT_DIR = "."
DEFAULT_CAP = 100
DEFAULT_PERIOD_DAYS = 30


def setup_logging(name: str) -> tuple[logging.Logger, str]:
    os.makedirs("logs", exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = f"logs/allianceclub_{name}_{timestamp}.log"
    logger = logging.getLogger("allianceclub")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(fh)
    return logger, log_path


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AllianceClub - outreach de LinkedIn via Waalaxy")
    sub = p.add_subparsers(dest="command", required=True)

    prep = sub.add_parser("prepare", help="Arma la tanda para revisar e importar a Waalaxy")
    prep.add_argument("--nuevos-leads", default=DEFAULT_NUEVOS_LEADS)
    prep.add_argument("--referencia", default=DEFAULT_REFERENCIA)
    prep.add_argument("--dedup-store", default=DEFAULT_DEDUP_STORE)
    prep.add_argument("--quota-log", default=DEFAULT_QUOTA_LOG)
    prep.add_argument("--cap", type=int, default=DEFAULT_CAP, help="Cupo de conexiones del plan Waalaxy vigente")
    prep.add_argument("--period-days", type=int, default=DEFAULT_PERIOD_DAYS, help="Ventana del cupo, en dias")
    prep.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    prep.add_argument("--dry-run", action="store_true")

    ing = sub.add_parser("ingest-waalaxy-export", help="Procesa un export de Waalaxy (aceptadas/respondidas)")
    ing.add_argument("--export", required=True, help="CSV exportado desde Waalaxy")
    ing.add_argument("--dedup-store", default=DEFAULT_DEDUP_STORE)
    ing.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    ing.add_argument("--col-linkedin", default=DEFAULT_COL_LINKEDIN)
    ing.add_argument("--col-status", default=DEFAULT_COL_STATUS)
    ing.add_argument("--replied-values", default=",".join(DEFAULT_REPLIED_VALUES))
    ing.add_argument("--accepted-values", default=",".join(DEFAULT_ACCEPTED_VALUES))

    rep = sub.add_parser("report", help="Reporte de aceptacion/respuesta por variante de CTA (A/B testing)")
    rep.add_argument("--dedup-store", default=DEFAULT_DEDUP_STORE)

    return p


def cmd_prepare(args: argparse.Namespace) -> None:
    logger, log_path = setup_logging("prepare")
    result = run_prepare(
        nuevos_leads_path=args.nuevos_leads,
        referencia_path=args.referencia,
        dedup_store_path=args.dedup_store,
        quota_log_path=args.quota_log,
        cap=args.cap,
        period_days=args.period_days,
        output_dir=args.output_dir,
        logger=logger,
        dry_run=args.dry_run,
    )

    print("\n=== Resumen AllianceClub - prepare ===")
    print(f"Candidatos en ambas fuentes:      {result.total_candidates}")
    print(f"Saltados (ya en dedup store):     {result.skipped_dedup}")
    print(f"Cupo restante antes de la tanda:  {result.quota_remaining_before}")
    print(f"Saltados (sin cupo):              {result.skipped_no_quota}")
    print(f"Leads en esta tanda:              {len(result.batch)}")
    specific = sum(1 for bl in result.batch if bl.hook.confidence == "specific")
    generic = len(result.batch) - specific
    print(f"  Gancho especifico:              {specific}")
    print(f"  Gancho generico (revisar):      {generic}")
    if result.review_path:
        print(f"Excel de revision: {result.review_path}")
        print(f"CSV para importar a Waalaxy: {result.waalaxy_csv_path}")
        print("Revisa el excel ANTES de importar el CSV a Waalaxy.")
    elif args.dry_run:
        print("Dry-run: no se escribieron archivos ni se actualizo dedup/cupo.")
    else:
        print("No hay leads nuevos para esta tanda, no se escribio nada.")
    print(f"Log completo en: {log_path}")


def cmd_ingest(args: argparse.Namespace) -> None:
    logger, log_path = setup_logging("ingest")
    result = run_ingest(
        export_csv_path=args.export,
        dedup_store_path=args.dedup_store,
        output_dir=args.output_dir,
        logger=logger,
        col_linkedin=args.col_linkedin,
        col_status=args.col_status,
        replied_values=[v.strip() for v in args.replied_values.split(",") if v.strip()],
        accepted_values=[v.strip() for v in args.accepted_values.split(",") if v.strip()],
    )

    print("\n=== Resumen AllianceClub - ingest-waalaxy-export ===")
    print(f"Filas leidas:            {result.rows_read}")
    print(f"No encontradas en dedup: {result.not_in_dedup}")
    print(f"Marcadas aceptadas:      {result.marked_accepted}")
    print(f"Marcadas respondidas:    {result.marked_replied}")
    if result.pendientes_path:
        print(f"Pendientes de manejo manual actualizado en: {result.pendientes_path}")
    print(f"Log completo en: {log_path}")


def cmd_report(args: argparse.Namespace) -> None:
    stats = compute_variant_report(args.dedup_store)
    print("\n=== Reporte AllianceClub - variantes de CTA ===")
    print(format_report(stats))

    tone_stats = compute_tone_report(args.dedup_store)
    print("\n=== Reporte AllianceClub - tono (VoiceClub: club vs advisory) ===")
    print(format_tone_report(tone_stats))


def main() -> None:
    args = build_arg_parser().parse_args()
    if args.command == "prepare":
        cmd_prepare(args)
    elif args.command == "ingest-waalaxy-export":
        cmd_ingest(args)
    elif args.command == "report":
        cmd_report(args)


if __name__ == "__main__":
    main()
