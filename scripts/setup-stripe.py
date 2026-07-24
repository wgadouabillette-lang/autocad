#!/usr/bin/env python3
"""Crée les produits/prix Stripe Hall (Pro + usage à la demande) et met à jour backend/.env."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Dict, Optional

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
ENV_FILE = BACKEND_DIR / ".env"

PRODUCT_META_KEY = "forma_billing"
PRO_META_VALUE = "pro"
ON_DEMAND_META_VALUE = "on_demand"
ENTERPRISE_META_VALUE = "enterprise"


def _load_dotenv() -> None:
    env_path = ENV_FILE
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _require_stripe(*, allow_missing_key: bool = False):
    try:
        import stripe
    except ImportError as exc:
        print("Installez stripe : cd backend && .venv/bin/pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(1) from exc
    api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    if not api_key and not allow_missing_key:
        print("Définissez STRIPE_SECRET_KEY dans backend/.env ou l'environnement.", file=sys.stderr)
        raise SystemExit(1)
    if api_key:
        stripe.api_key = api_key
    return stripe


def _find_product(stripe, meta_value: str):
    products = stripe.Product.list(active=True, limit=100)
    for product in products.auto_paging_iter():
        metadata = product.get("metadata") or {}
        if metadata.get(PRODUCT_META_KEY) == meta_value:
            return product
    return None


def _find_price(
    stripe,
    product_id: str,
    *,
    metered: bool,
    amount_cents: int | None = None,
    currency: str | None = None,
):
    prices = stripe.Price.list(product=product_id, active=True, limit=100)
    cur = (currency or "").strip().lower() or None
    for price in prices.auto_paging_iter():
        recurring = price.get("recurring") or {}
        usage_type = recurring.get("usage_type")
        if metered and usage_type != "metered":
            continue
        if not metered and usage_type not in (None, "licensed"):
            continue
        if amount_cents is not None and int(price.get("unit_amount") or 0) != int(amount_cents):
            continue
        if cur and str(price.get("currency") or "").lower() != cur:
            continue
        return price
    return None


def _ensure_product(stripe, *, name: str, description: str, meta_value: str, dry_run: bool):
    if not dry_run:
        existing = _find_product(stripe, meta_value)
    else:
        existing = None
    if existing:
        print(f"Produit existant : {existing['name']} ({existing['id']})")
        return existing
    if dry_run:
        print(f"[dry-run] Créerait le produit {name}")
        return {"id": f"prod_dry_{meta_value}"}

    product = stripe.Product.create(
        name=name,
        description=description,
        metadata={PRODUCT_META_KEY: meta_value},
    )
    print(f"Produit créé : {product['name']} ({product['id']})")
    return product


def _ensure_pro_price(stripe, product_id: str, amount_cents: int, currency: str, dry_run: bool):
    existing = (
        None
        if dry_run
        else _find_price(
            stripe,
            product_id,
            metered=False,
            amount_cents=amount_cents,
            currency=currency,
        )
    )
    if existing:
        print(f"Prix Pro existant : {existing['id']} ({existing['unit_amount']} {existing['currency']})")
        return existing
    if dry_run:
        print(f"[dry-run] Créerait le prix Pro {amount_cents} {currency}/mois")
        return {"id": "price_dry_pro"}

    # Archive l'ancien prix licencié s'il a un autre montant (Stripe n'autorise pas l'édition).
    outdated = _find_price(stripe, product_id, metered=False)
    if outdated and int(outdated.get("unit_amount") or 0) != int(amount_cents):
        try:
            stripe.Price.modify(outdated["id"], active=False)
            print(
                f"Ancien prix Pro archivé : {outdated['id']} "
                f"({outdated['unit_amount']} {outdated['currency']})"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"Impossible d'archiver {outdated['id']}: {exc}")

    price = stripe.Price.create(
        product=product_id,
        currency=currency,
        unit_amount=amount_cents,
        recurring={"interval": "month"},
        metadata={"forma_billing": PRO_META_VALUE},
    )
    print(f"Prix Pro créé : {price['id']} ({amount_cents / 100:.2f} {currency.upper()}/mois)")
    return price


def _ensure_on_demand_price(
    stripe,
    product_id: str,
    unit_amount_cents: int,
    currency: str,
    dry_run: bool,
):
    existing = None if dry_run else _find_price(stripe, product_id, metered=True)
    if existing:
        print(f"Prix on-demand existant : {existing['id']}")
        return existing
    if dry_run:
        print(f"[dry-run] Créerait le prix metered on-demand ({unit_amount_cents} {currency}/unité)")
        return {"id": "price_dry_on_demand"}

    price = stripe.Price.create(
        product=product_id,
        currency=currency,
        unit_amount=unit_amount_cents,
        billing_scheme="per_unit",
        recurring={
            "interval": "month",
            "usage_type": "metered",
            "aggregate_usage": "sum",
        },
        metadata={"forma_billing": ON_DEMAND_META_VALUE},
    )
    print(f"Prix on-demand créé : {price['id']} ({unit_amount_cents / 100:.2f} {currency.upper()}/unité)")
    return price


def _upsert_env(updates: Dict[str, str], dry_run: bool) -> None:
    lines: list[str] = []
    if ENV_FILE.is_file():
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()

    index = {
        line.split("=", 1)[0].strip(): i
        for i, line in enumerate(lines)
        if "=" in line and not line.strip().startswith("#")
    }
    missing = [key for key in updates if key not in index]
    if missing:
        if lines and lines[-1].strip():
            lines.append("")
        lines.append("# --- Stripe (généré par scripts/setup-stripe.py) ---")

    for key, value in updates.items():
        entry = f"{key}={value}"
        if key in index:
            lines[index[key]] = entry
        else:
            lines.append(entry)

    if dry_run:
        print("[dry-run] Mettrait à jour backend/.env :")
        for key, value in updates.items():
            print(f"  {key}={value}")
        return

    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    ENV_FILE.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Mis à jour : {ENV_FILE}")


def _ensure_enterprise_seat_price(
    stripe,
    product_id: str,
    amount_cents: int,
    currency: str,
    dry_run: bool,
):
    existing = None if dry_run else _find_price(stripe, product_id, metered=False)
    if existing:
        print(
            f"Prix Entreprise existant : {existing['id']} "
            f"({existing['unit_amount']} {existing['currency']}/siège/mois)"
        )
        return existing
    if dry_run:
        print(f"[dry-run] Créerait le prix Entreprise {amount_cents} {currency}/siège/mois")
        return {"id": "price_dry_enterprise"}

    price = stripe.Price.create(
        product=product_id,
        currency=currency,
        unit_amount=amount_cents,
        recurring={"interval": "month"},
        metadata={"forma_billing": ENTERPRISE_META_VALUE},
    )
    print(
        f"Prix Entreprise créé : {price['id']} "
        f"({amount_cents / 100:.2f} {currency.upper()}/siège/mois)"
    )
    return price


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure les produits/prix Stripe pour Hall.")
    parser.add_argument("--dry-run", action="store_true", help="Affiche les actions sans appeler Stripe.")
    parser.add_argument("--no-env", action="store_true", help="Ne modifie pas backend/.env.")
    parser.add_argument("--currency", default=os.getenv("STRIPE_CURRENCY", "usd"))
    parser.add_argument(
        "--pro-amount",
        type=int,
        default=int(os.getenv("STRIPE_PRO_AMOUNT_CENTS", "2500")),
        help="Montant Pro en centimes (défaut : 2500 = 25,00 $).",
    )
    parser.add_argument(
        "--on-demand-unit",
        type=int,
        default=int(os.getenv("STRIPE_ON_DEMAND_UNIT_CENTS", "1")),
        help="Prix unitaire on-demand en centimes (défaut : 1 = 0,01 $/unité, aligné sur l'usage IA retail).",
    )
    parser.add_argument(
        "--enterprise-seat-amount",
        type=int,
        default=int(os.getenv("STRIPE_ENTERPRISE_SEAT_AMOUNT_CENTS", "1800")),
        help="Montant Entreprise par siège en centimes (défaut : 1800 = 18,00 $).",
    )
    args = parser.parse_args()

    _load_dotenv()
    stripe = _require_stripe(allow_missing_key=args.dry_run)

    pro_product = _ensure_product(
        stripe,
        name="Hall Pro",
        description="Abonnement mensuel — assistant IA, connecteurs, AI Notes et Follow-up.",
        meta_value=PRO_META_VALUE,
        dry_run=args.dry_run,
    )
    on_demand_product = _ensure_product(
        stripe,
        name="Hall — Usage à la demande",
        description="Add-on metered — crédits IA facturés au fil des requêtes (Pro requis).",
        meta_value=ON_DEMAND_META_VALUE,
        dry_run=args.dry_run,
    )
    enterprise_product = _ensure_product(
        stripe,
        name="Hall Entreprise",
        description="Abonnement mensuel par siège — pool IA partagé pour un workspace.",
        meta_value=ENTERPRISE_META_VALUE,
        dry_run=args.dry_run,
    )

    pro_price = _ensure_pro_price(
        stripe,
        pro_product["id"],
        args.pro_amount,
        args.currency,
        args.dry_run,
    )
    on_demand_price = _ensure_on_demand_price(
        stripe,
        on_demand_product["id"],
        args.on_demand_unit,
        args.currency,
        args.dry_run,
    )
    enterprise_price = _ensure_enterprise_seat_price(
        stripe,
        enterprise_product["id"],
        args.enterprise_seat_amount,
        args.currency,
        args.dry_run,
    )

    print("")
    print("IDs à utiliser :")
    print(f"  STRIPE_PRO_PRICE_ID={pro_price['id']}")
    print(f"  STRIPE_ON_DEMAND_PRICE_ID={on_demand_price['id']}")
    print(f"  STRIPE_ENTERPRISE_SEAT_PRICE_ID={enterprise_price['id']}")
    print("")
    print("Étape suivante — webhook local :")
    print("  stripe listen --forward-to http://127.0.0.1:8000/api/billing/webhook")
    print("Puis copiez whsec_... dans STRIPE_WEBHOOK_SECRET.")
    print("")
    print("Documentation : docs/STRIPE_BILLING.md")

    if not args.no_env and not args.dry_run:
        _upsert_env(
            {
                "STRIPE_PRO_PRICE_ID": str(pro_price["id"]),
                "STRIPE_PRO_AMOUNT_CENTS": str(args.pro_amount),
                "STRIPE_PRO_PRICE_LABEL": f"${args.pro_amount / 100:.0f} / month"
                if args.pro_amount % 100 == 0
                else f"${args.pro_amount / 100:.2f} / month",
                "STRIPE_ON_DEMAND_PRICE_ID": str(on_demand_price["id"]),
                "STRIPE_ENTERPRISE_SEAT_PRICE_ID": str(enterprise_price["id"]),
                "STRIPE_ENTERPRISE_SEAT_AMOUNT_CENTS": str(args.enterprise_seat_amount),
                "STRIPE_ENTERPRISE_SEAT_PRICE_LABEL": (
                    f"${args.enterprise_seat_amount / 100:.0f} / seat"
                    if args.enterprise_seat_amount % 100 == 0
                    else f"${args.enterprise_seat_amount / 100:.2f} / seat"
                ),
            },
            dry_run=False,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
