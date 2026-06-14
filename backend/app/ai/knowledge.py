"""Connaissances d'ingenierie : filetages, materiaux, helpers de parsing.

Utilise par l'agent IA (mode regles) et par le generateur text-to-CAD.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

# Diametre de percage pour vis metrique (trou de passage, jeu moyen) en mm
METRIC_CLEARANCE = {
    "M2": 2.4, "M2.5": 2.9, "M3": 3.4, "M4": 4.5, "M5": 5.5,
    "M6": 6.6, "M8": 9.0, "M10": 11.0, "M12": 13.5, "M16": 17.5, "M20": 22.0,
}

# Filetage : diametre de l'avant-trou (taraudage)
METRIC_TAP = {
    "M2": 1.6, "M2.5": 2.05, "M3": 2.5, "M4": 3.3, "M5": 4.2,
    "M6": 5.0, "M8": 6.8, "M10": 8.5, "M12": 10.2, "M16": 14.0, "M20": 17.5,
}

# Standards VESA (entraxe carre, en mm)
VESA = {
    "75": 75.0, "100": 100.0, "200": 200.0, "75x75": 75.0, "100x100": 100.0,
}

MATERIAL_KEYWORDS = {
    "aluminium": ["alu", "aluminium", "aluminum"],
    "acier": ["acier", "steel", "fer"],
    "inox": ["inox", "stainless", "304", "316"],
    "titane": ["titane", "titanium"],
    "laiton": ["laiton", "brass"],
    "pla": ["pla"],
    "abs": ["abs"],
    "petg": ["petg"],
    "nylon": ["nylon", "pa6", "pa12"],
}


def detect_material(text: str) -> Optional[str]:
    low = text.lower()
    for mat, kws in MATERIAL_KEYWORDS.items():
        if any(k in low for k in kws):
            return mat
    return None


def detect_thread(text: str) -> Optional[Tuple[str, float, float]]:
    """Detecte un filetage type 'M8'. Retourne (label, clearance, tap)."""
    m = re.search(r"\bM\s?(\d+(?:\.\d+)?)\b", text, re.IGNORECASE)
    if not m:
        return None
    label = "M" + m.group(1)
    return label, METRIC_CLEARANCE.get(label, float(m.group(1)) + 1.0), \
        METRIC_TAP.get(label, float(m.group(1)) * 0.8)


def first_int(text: str, default: int = 1) -> int:
    nums = re.findall(r"\b(\d+)\b", text)
    return int(nums[0]) if nums else default


def find_count(text: str) -> Optional[int]:
    """Cherche un nombre de trous/elements : '8 trous', 'x6', '4 percages'."""
    low = text.lower()
    m = re.search(r"(\d+)\s*(?:x\s*)?(?:trous?|per[cç]ages?|holes?|vis|elements?)", low)
    if m:
        return int(m.group(1))
    m = re.search(r"\bx\s*(\d+)\b", low)
    if m:
        return int(m.group(1))
    return None


def find_dimensions(text: str) -> list:
    """Extrait les dimensions type '100x60x10' ou '100 x 60'."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)", text)
    if m:
        return [float(m.group(1)), float(m.group(2)), float(m.group(3))]
    m = re.search(r"(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)", text)
    if m:
        return [float(m.group(1)), float(m.group(2))]
    return []


def find_named(text: str, *names: str) -> Optional[float]:
    """Cherche 'diametre 80', 'rayon=10', 'epaisseur 5 mm', 'largeur de 100'."""
    for nm in names:
        m = re.search(
            rf"{nm}\s*(?:de|:|=|à|a)?\s*(\d+(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        if m:
            return float(m.group(1))
    return None


def inches_from_text(text: str) -> Optional[float]:
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:pouces?|inch|\"|in\b)", text, re.IGNORECASE)
    return float(m.group(1)) if m else None
