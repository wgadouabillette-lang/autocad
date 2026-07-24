"""Localisation des prix USD vers la devise de présentation du client."""
from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Cache taux (base USD) — TTL 1 h.
_RATES_CACHE: Dict[str, Any] = {"at": 0.0, "rates": {}}
_RATES_TTL_SEC = 3600.0

# Pays → devise de présentation (ISO 4217).
_COUNTRY_CURRENCY: Dict[str, str] = {
    "US": "USD",
    "CA": "CAD",
    "GB": "GBP",
    "AU": "AUD",
    "NZ": "NZD",
    "JP": "JPY",
    "CH": "CHF",
    "SE": "SEK",
    "NO": "NOK",
    "DK": "DKK",
    "PL": "PLN",
    "CZ": "CZK",
    "HU": "HUF",
    "RO": "RON",
    "BG": "BGN",
    "TR": "TRY",
    "MX": "MXN",
    "BR": "BRL",
    "AR": "ARS",
    "CL": "CLP",
    "CO": "COP",
    "PE": "PEN",
    "IN": "INR",
    "SG": "SGD",
    "HK": "HKD",
    "KR": "KRW",
    "TW": "TWD",
    "TH": "THB",
    "MY": "MYR",
    "PH": "PHP",
    "ID": "IDR",
    "VN": "VND",
    "ZA": "ZAR",
    "AE": "AED",
    "SA": "SAR",
    "IL": "ILS",
    "EG": "EGP",
    # Zone euro
    "AT": "EUR",
    "BE": "EUR",
    "CY": "EUR",
    "DE": "EUR",
    "EE": "EUR",
    "ES": "EUR",
    "FI": "EUR",
    "FR": "EUR",
    "GR": "EUR",
    "HR": "EUR",
    "IE": "EUR",
    "IT": "EUR",
    "LT": "EUR",
    "LU": "EUR",
    "LV": "EUR",
    "MT": "EUR",
    "NL": "EUR",
    "PT": "EUR",
    "SI": "EUR",
    "SK": "EUR",
}

# Devises sans décimales.
_ZERO_DECIMAL = {"JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"}


def country_from_locale(locale: Optional[str]) -> Optional[str]:
    """Extrait le pays depuis `fr-CA`, `en_CA`, `fr-ca`, etc."""
    raw = (locale or "").strip().replace("_", "-")
    if not raw or "-" not in raw:
        return None
    region = raw.split("-", 1)[1].upper()
    return region if len(region) == 2 and region.isalpha() else None


def resolve_presentment_currency(
    *,
    currency: Optional[str] = None,
    country: Optional[str] = None,
    locale: Optional[str] = None,
) -> str:
    """Résout la devise d'affichage.

    Le pays (souvent dérivé du fuseau côté client) prime sur une devise
    explicite USD quand le pays n'est pas US — évite d'afficher du USD
    pour un Canadien dont le navigateur est en `en-US`.
    """
    cc = (country or "").strip().upper() or country_from_locale(locale)
    from_country = _COUNTRY_CURRENCY.get(cc) if cc else None
    explicit = (currency or "").strip().upper()
    if explicit and len(explicit) == 3 and explicit.isalpha():
        # Si le client envoie USD mais le pays dit CAD/EUR/…, suivre le pays.
        if explicit == "USD" and from_country and from_country != "USD":
            return from_country
        return explicit
    if from_country:
        return from_country
    return "USD"


def _fetch_usd_rates() -> Dict[str, float]:
    now = time.time()
    cached = _RATES_CACHE.get("rates") or {}
    if cached and now - float(_RATES_CACHE.get("at") or 0) < _RATES_TTL_SEC:
        return dict(cached)

    # Frankfurter (BCE) — pas de clé API. Repli open.er-api.
    rates: Dict[str, float] = {"USD": 1.0}
    for url in (
        "https://api.frankfurter.app/latest?from=USD",
        "https://open.er-api.com/v6/latest/USD",
    ):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "HallBilling/1"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                import json

                payload = json.loads(resp.read().decode("utf-8"))
            if "rates" in payload and isinstance(payload["rates"], dict):
                for key, value in payload["rates"].items():
                    try:
                        rates[str(key).upper()] = float(value)
                    except (TypeError, ValueError):
                        continue
                rates["USD"] = 1.0
                _RATES_CACHE["rates"] = rates
                _RATES_CACHE["at"] = now
                return dict(rates)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            logger.debug("FX fetch failed (%s): %s", url, exc)
            continue

    logger.warning("Unable to fetch FX rates — falling back to USD only.")
    return {"USD": 1.0}


def convert_usd_cents(usd_cents: int, currency: str) -> tuple[int, float, bool]:
    """Retourne (montant_local_en_minor_units, taux, ok).

    `ok` est False si le taux FX est indisponible — l'appelant doit rester en USD.
    """
    cur = (currency or "USD").strip().upper() or "USD"
    if cur == "USD":
        return max(0, int(usd_cents)), 1.0, True
    rates = _fetch_usd_rates()
    if cur not in rates:
        return max(0, int(usd_cents)), 1.0, False
    try:
        rate = float(rates[cur])
    except (TypeError, ValueError):
        return max(0, int(usd_cents)), 1.0, False
    if rate <= 0:
        return max(0, int(usd_cents)), 1.0, False
    usd = max(0, int(usd_cents)) / 100.0
    local = usd * rate
    if cur in _ZERO_DECIMAL:
        return int(round(local)), rate, True
    return int(round(local * 100)), rate, True


def format_money(amount_cents: int, currency: str, *, locale: Optional[str] = None) -> str:
    """Formatage simple et stable (sans dépendance babel)."""
    cur = (currency or "USD").strip().upper() or "USD"
    loc = (locale or "").strip().lower().replace("_", "-")
    if cur in _ZERO_DECIMAL:
        whole = max(0, int(amount_cents))
        if loc.startswith("fr"):
            return f"{whole} {cur}"
        return f"{cur} {whole}"

    dollars = max(0, int(amount_cents)) / 100.0
    if loc.startswith("fr"):
        # 75,15 $ CA
        formatted = f"{dollars:,.2f}".replace(",", "X").replace(".", ",").replace("X", " ")
        if cur == "USD":
            return f"{formatted} $ US"
        if cur == "CAD":
            return f"{formatted} $ CA"
        if cur == "EUR":
            return f"{formatted} €"
        return f"{formatted} {cur}"

    symbol = {"USD": "$", "CAD": "CA$", "EUR": "€", "GBP": "£", "AUD": "A$", "CHF": "CHF "}.get(cur)
    if symbol:
        if symbol.endswith(" "):
            return f"{symbol}{dollars:,.2f}"
        return f"{symbol}{dollars:,.2f}"
    return f"{dollars:,.2f} {cur}"


def localize_usd_amount(
    usd_cents: int,
    *,
    currency: Optional[str] = None,
    country: Optional[str] = None,
    locale: Optional[str] = None,
) -> Dict[str, Any]:
    """Convertit un montant USD vers la devise de présentation."""
    presentment = resolve_presentment_currency(currency=currency, country=country, locale=locale)
    local_cents, rate, ok = convert_usd_cents(usd_cents, presentment)
    if not ok:
        presentment = "USD"
        local_cents = max(0, int(usd_cents))
        rate = 1.0
    usd_label = format_money(usd_cents, "USD", locale=locale)
    local_label = format_money(local_cents, presentment, locale=locale)
    return {
        "currency": presentment,
        "amountCents": local_cents,
        "amountLabel": local_label,
        "usdCents": max(0, int(usd_cents)),
        "usdLabel": usd_label,
        "fxRate": rate,
        "converted": presentment != "USD",
    }
