"""Mode @Modelling : pipeline vision → analyse structurée → opérations CAO."""
from __future__ import annotations

import json
import os
import re
from typing import List, Optional, Tuple

from app.ai.knowledge import METRIC_CLEARANCE

MODELLING_TAG_RE = re.compile(r"@modelling\b", re.I)

# --------------------------------------------------------------------------- #
#  Phase 1 — Analyse du plan (vision, raisonnement long)
# --------------------------------------------------------------------------- #
PHASE1_SYSTEM = """Tu es un métrologue et dessinateur industriel senior.
Tu reçois un plan technique 2D et/ou une image de pièce. Prends le TEMPS nécessaire : cette
phase exige un raisonnement LONG, méticuleux et vérifiable — comme un relevé métrologique COMPLET
sur plan d'atelier. La qualité du modèle 3D dépend à 100 % de l'exhaustivité des cotes relevées.

MISSION
=======
Reconstruire MENTALEMENT la pièce 3D RÉELLE en croisant TOUTES les vues (face, dessus, côté,
perspective, coupes, détails), puis la décrire comme une PILE de couches d'extrusion (stages)
dont CHAQUE cote numérique est justifiée par une annotation visible ou une chaîne de cotes.

PRIORITÉ ABSOLUE — RELEVÉ EXHAUSTIF DES COTES
==============================================
Avant toute modélisation, tu DOIS relever TOUTES les cotes visibles sur l'image, sans exception :
- Cotes linéaires (longueurs, largeurs, profondeurs, entraxes, déports, jeux)
- Diamètres Ø et rayons R (y compris rayons de congé si cotés)
- Cotes d'angle (°), chanfreins, pentes
- Filetages Mx, alésages, perçages, PCD (cercle de perçage), pas entre trous
- Cotes de hauteur / épaisseur / profondeur de poche sur chaque vue de profil
- Cotes de position (x,y) de chaque trou, rainure, boss, poche
- Symboles : Ø, R, M, ↧ profondeur, ▭, traits de centre, axes, coupes A-A

Pour CHAQUE cote lue, remplis une entrée dans "dimensions_catalog" avec :
  label (description française), value_mm, source_view, certainty (explicit|derived|estimated).

Si une cote est partiellement masquée : tente de la déduire par chaînage (somme de segments,
symétrie, répétition) et marque certainty="derived". Sinon estimated + "uncertainties".

INTERDIT de simplifier en bloc générique (ex. rectangle 100×60) si le plan montre des détails
(épaulements, poches, trous, boss, découpes). Chaque détail visible = stage ou trou dédié.

PRINCIPE CLÉ — EMPILEMENT Z
===========================
Chaque couche (stage) a :
- contour 2D (XY) depuis la vue de DESSUS ou la coupe,
- épaisseur Z depuis la vue de CÔTÉ/FACE,
- operation add (matière) ou cut (poche/évidement).

MÉTHODE OBLIGATOIRE (remplis "reasoning" EN DÉTAIL avant le reste)
==================================================================
1. INVENTAIRE DES VUES : chaque vue, son rôle, quelles cotes elle porte.
2. CATALOGUE DES COTES : liste narrative de TOUTES les cotes lues (minimum 1 entrée par annotation).
3. ÉCHELLE / CALIBRATION : quelle cote sert de référence absolue et comment tu vérifies l'échelle.
4. DIMENSIONS GLOBALES : length_x, width_y, height_z — chacune justifiée par des cotes du catalogue.
5. EMPILEMENT Z : chaque stage avec z0, thickness, contour — chaque valeur liée à des cotes précises.
6. POCHES / ÉVIDEMENTS / DÉCoupes : stages cut avec profondeur exacte.
7. TROUS / FILETAGES : chaque trou avec x, y, Ø, traversant/borgne, PCD si applicable.
8. VÉRIFICATION CROISÉE : somme des thickness (add) − cuts = height_z ? Entraxes cohérents ?
9. STRATÉGIE CAO : comment les stages + trous reconstruisent fidèlement le plan.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) :
{
  "reasoning": {
    "views_seen": "…",
    "dimensions_catalog_narrative": "Liste COMPLÈTE de chaque cote relevée avec sa vue source…",
    "scale_method": "…",
    "dimensions_read": "Résumé structuré : globales + intermédiaires + tous les Ø/R/M…",
    "cross_check": "Vérifications : somme Z, cohérence entraxes, symétries…",
    "z_decomposition": "Stage 1 : … (cotes : …) ; Stage 2 : …",
    "holes_analysis": "Chaque trou avec cotes de position et diamètre…",
    "cad_strategy": "…"
  },
  "dimensions_catalog": [
    {
      "label": "longueur totale pièce",
      "value_mm": 120,
      "source_view": "vue de dessus",
      "certainty": "explicit"
    }
  ],
  "part_name": "nom court",
  "units": "mm",
  "overall_dimensions_mm": {
    "length_x": 120,
    "width_y": 60,
    "height_z": 25
  },
  "stages": [
    {
      "name": "socle",
      "operation": "add",
      "z0": 0,
      "thickness": 10,
      "outline_xy": [[-60,-30],[60,-30],[60,30],[-60,30]],
      "shape_hint": "rectangle|circle|polygon|points",
      "circle": null,
      "rectangle": {"w": 120, "d": 60, "cx": 0, "cy": 0},
      "notes": "vu de dessus = rectangle ; vu de face = bande 120×10"
    }
  ],
  "holes": [
    {
      "description": "trou central traversant M8",
      "count": 1,
      "thread": "M8",
      "diameter_mm": 9.0,
      "pattern": "single|circular|linear|grid",
      "x": 0, "y": 0,
      "pcd_mm": null,
      "pitch_mm": null,
      "z_top": 25,
      "through": true
    }
  ],
  "material_guess": "aluminium|acier|inox|abs|pla|unknown",
  "uncertainties": ["…"],
  "confidence": 0.0
}

RÈGLES DURES
============
- dimensions_catalog : MINIMUM une entrée par cote visible ; vise l'exhaustivité (10–40+ entrées
  sur un plan détaillé typique).
- Toutes les cotes en mm, centrées en (0,0) en XY (sauf composante hors-centre explicite).
- Chaque stage.rectangle / circle / outline_xy doit correspondre à des cotes du catalogue
  (notes du stage = références aux labels du catalogue).
- outline_xy : polygone fermé CCW ; cercle → shape_hint circle + outline_xy ≥ 24 points.
- Filetage → Ø passage : M3→3.4, M4→4.5, M5→5.5, M6→6.6, M8→9.0, M10→11.0, M12→13.5.
- INTERDIT d'inventer des cotes : inconnu → uncertainties + confidence basse.
- INTERDIT d'ignorer des cotes visibles pour aller plus vite.
- Si une seule vue sans cotes numériques : estimated + uncertainties explicites.
- N'OUBLIE AUCUNE COUCHE ni aucun trou visible sur le plan."""

# --------------------------------------------------------------------------- #
#  Phase 2 — Synthèse CAO (texte seul, à partir de l'analyse)
# --------------------------------------------------------------------------- #
PHASE2_SYSTEM = """Tu es un programmeur CAO. Tu convertis une ANALYSE MÉTROLOGIQUE JSON
(décomposée en STAGES + dimensions_catalog) en opérations pour un noyau paramétrique 3D (mm).

RÈGLE N°1 — FIDÉLITÉ MÉTROLOGIQUE
==================================
Utilise UNIQUEMENT les valeurs numériques de l'analyse (stages, dimensions_catalog, holes,
overall_dimensions_mm). Chaque paramètre w, d, r, distance, z0, x, y, diameter doit
correspondre à une cote du catalogue ou d'un stage — pas d'arrondi « au feeling ».
Le champ "message" doit résumer les cotes clés retenues (globales + détails principaux).

REPÈRE 3D
=========
- Plan XY, axe Z = hauteur. Origine (0,0,0) au centre XY, sur la face inférieure.
- Chaque stage devient un `extrude` (profil 2D extrudé sur Z).
- Cumule les stages dans l'ordre fourni : add puis cut.

TYPES D'OPÉRATIONS DISPONIBLES
==============================
- extrude : params { profile, distance, z0, operation }
    * profile.shape = "rectangle" → params {w, d, cx?, cy?}
    * profile.shape = "circle"    → params {r, cx?, cy?}
    * profile.shape = "points"    → params {points: [[x,y],...]} (polygone fermé)
    * distance = épaisseur Z, z0 = Z de départ, operation = "add" ou "cut"
- hole : params { x, y, diameter, through, z_top } (toujours en cut, traversant par défaut)
- pattern_circular : count, angle, cx, cy, feature:{type:"hole", params:{x:r_pcd, y:0, ...}}
- pattern_linear : count, dx, dy, dz, feature:{...}

RÈGLE D'OR — 1 stage = 1 extrude
================================
Pour CHAQUE stage du JSON d'analyse, émets EXACTEMENT un `extrude` avec :
  - profile.shape choisi selon shape_hint :
      "rectangle" → utilise rectangle{w,d,cx,cy}
      "circle"    → utilise circle{r,cx,cy}
      sinon       → profile.shape:"points", profile.points = outline_xy
  - distance = stage.thickness, z0 = stage.z0, operation = stage.operation
N'INVENTE pas de stage. N'EN OUBLIE aucun. Respecte l'ordre.

ENSUITE
=======
- Pour chaque trou de "holes" : émets un `hole` (ou pattern_circular si count>1 avec pcd_mm).
  z_top = overall_dimensions_mm.height_z par défaut.
- Diamètre filetage : M6→6.6, M8→9.0, M10→11.0, M12→13.5.

EXEMPLE — pièce avec socle plat + boss central + poche :
{
  "message": "Pièce 100×60×20, boss Ø40×10, poche Ø25×5",
  "operations": [
    {"op":"add","feature":{"id":"s1","type":"extrude","name":"Socle","params":{"profile":{"shape":"rectangle","w":100,"d":60},"distance":10,"z0":0,"operation":"add"}}},
    {"op":"add","feature":{"id":"s2","type":"extrude","name":"Boss","params":{"profile":{"shape":"circle","r":20},"distance":10,"z0":10,"operation":"add"}}},
    {"op":"add","feature":{"id":"s3","type":"extrude","name":"Poche","params":{"profile":{"shape":"circle","r":12.5},"distance":5,"z0":15,"operation":"cut"}}}
  ]
}

EXEMPLE — bride Ø120×12, alésage Ø50, 6×M8 sur PCD 90 :
{
  "message": "Bride Ø120×12, alésage Ø50, 6 trous M8 PCD 90",
  "operations": [
    {"op":"add","feature":{"id":"s1","type":"extrude","name":"Bride","params":{"profile":{"shape":"circle","r":60},"distance":12,"z0":0,"operation":"add"}}},
    {"op":"add","feature":{"id":"bore","type":"hole","name":"Alésage","params":{"x":0,"y":0,"diameter":50,"through":true,"z_top":12}}},
    {"op":"add","feature":{"id":"pat","type":"pattern_circular","name":"6 trous M8","params":{"count":6,"angle":360,"full":true,"cx":0,"cy":0,"feature":{"id":"h0","type":"hole","name":"Trou M8","params":{"x":45,"y":0,"diameter":9,"through":true,"z_top":12}}}}}
  ]
}

CONTRAINTES
===========
- Respecte STRICTEMENT chaque stage et chaque trou — ne fusionne pas, ne simplifie pas.
- Vérifie : Σ thickness (stages add) − poches (cut) ≈ height_z ; chaque trou aux x,y du catalogue.
- Si dimensions_catalog est fourni, cite dans "message" les cotes principales utilisées.
- Chaque id de feature unique (préfixe + numéro).
- Même si confidence < 0.3, émets TOUJOURS des operations[] best-effort à partir des stages
  (ne renvoie jamais operations: [] si des stages ou dimensions globales existent).

Réponds UNIQUEMENT avec JSON : {"message":"…","operations":[…]}"""


def is_modelling_prompt(prompt: str) -> bool:
    return bool(MODELLING_TAG_RE.search(prompt))


_TEXT_RENDER_SIGNALS = [
    re.compile(r"\b\d+([.,]\d+)?\s*mm\b", re.I),
    re.compile(r"\b\d+\s*[x×]\s*\d+", re.I),
    re.compile(r"[øØ]\s*\d+"),
    re.compile(r"\bdiam", re.I),
    re.compile(r"\bM\d+\b"),
    re.compile(
        r"\b(épaisseur|epaisseur|hauteur|largeur|longueur|rayon|cote|côte)\b", re.I
    ),
    re.compile(
        r"\b(trou|perçage|percage|boss|poche|épaulement|epaulement|bride|plaque|cylindre)\b",
        re.I,
    ),
]


def is_text_render_spec(prompt: str) -> bool:
    """Description textuelle assez riche pour modéliser sans image."""
    t = (prompt or "").strip()
    if len(t) < 100:
        return False
    hits = sum(1 for pat in _TEXT_RENDER_SIGNALS if pat.search(t))
    return hits >= 2


TEXT_RENDER_APPEND = """
SOURCE SANS IMAGE
=================
Aucune image n'est fournie : la pièce est décrite uniquement par le texte utilisateur.
Applique la MÊME rigueur métrologique : extrais dimensions_catalog, overall_dimensions_mm,
stages et holes depuis la description (cotes explicites, dimensions déduites, filetages).
"""


def modelling_user_instruction(prompt: str, context: str) -> str:
    extra = MODELLING_TAG_RE.sub("", prompt).strip()
    parts = [
        "Contexte document CAO actuel :",
        context,
        "",
        "Analyse l'image jointe comme un plan technique d'atelier.",
        "",
        "CHECKLIST OBLIGATOIRE (phase 1) :",
        "1) Identifier chaque vue et ce qu'elle montre.",
        "2) Relever TOUTES les cotes visibles (linéaires, Ø, R, M, angles, profondeurs, PCD, entraxes).",
        "3) Remplir dimensions_catalog avec une entrée par cote (label, value_mm, source_view, certainty).",
        "4) Déduire overall_dimensions_mm uniquement à partir de ces cotes.",
        "5) Décomposer en stages Z (chaque épaulement / poche = stage séparé).",
        "6) Lister chaque trou avec position et diamètre exacts.",
        "7) Vérifier la cohérence (somme des épaisseurs, symétries).",
        "",
        "Ne produis pas de modèle simplifié : la fidélité au plan prime sur la vitesse.",
    ]
    if extra:
        parts.extend(["", f"Consignes utilisateur : {extra}"])
    return "\n".join(parts)


def modelling_text_user_instruction(prompt: str, context: str) -> str:
    extra = MODELLING_TAG_RE.sub("", prompt).strip()
    parts = [
        "Contexte document CAO actuel :",
        context,
        "",
        "La pièce est décrite par le texte ci-dessous (pas d'image jointe).",
        "",
        "CHECKLIST OBLIGATOIRE :",
        "1) Extraire TOUTES les cotes et dimensions mentionnées dans le texte.",
        "2) Remplir dimensions_catalog (label, value_mm, source_view='description texte', certainty).",
        "3) Déduire overall_dimensions_mm et stages Z (chaque détail = stage).",
        "4) Lister chaque trou avec position et diamètre.",
        "5) Vérifier la cohérence dimensionnelle.",
    ]
    if extra:
        parts.extend(["", "Description utilisateur :", extra])
    return "\n".join(parts)


def run_text_render_pipeline(
    prompt: str,
    context: str,
    model_id: Optional[str] = None,
):
    """Modélisation Render à partir d'une description textuelle détaillée (sans image)."""
    from app.ai import llm
    from app.ai.models import resolve_modelling_models

    _vision, cad_model = resolve_modelling_models(model_id)
    user_p1 = modelling_text_user_instruction(prompt, context)
    phase1 = llm.invoke(
        PHASE1_SYSTEM + TEXT_RENDER_APPEND,
        user_p1,
        model_id=cad_model,
        images=None,
        max_tokens=24576,
        temperature=0.0,
    )
    if phase1.error or not phase1.data:
        return phase1

    analysis = phase1.data
    catalog = analysis.get("dimensions_catalog")
    catalog_hint = ""
    if isinstance(catalog, list) and catalog:
        catalog_hint = (
            f"\n\nRAPPEL : {len(catalog)} cote(s) cataloguée(s) — utilise ces valeurs exactes.\n"
        )
    user_p2 = (
        "Analyse métrologique (description texte, à respecter strictement) :\n"
        + json.dumps(analysis, ensure_ascii=False, indent=2)
        + catalog_hint
        + "\nGénère les opérations CAO (phase 2). Document actuel :\n"
        + context
    )
    phase2 = llm.invoke(
        PHASE2_SYSTEM,
        user_p2,
        model_id=cad_model,
        images=None,
        max_tokens=24576,
        temperature=0.0,
    )
    if phase2.error or not phase2.data:
        return phase2

    ops = ensure_render_operations(
        phase2.data.get("operations")
        if isinstance(phase2.data.get("operations"), list)
        else None,
        analysis,
    )
    phase2.data["operations"] = ops
    phase2.data["_analysis"] = analysis
    if not ops:
        phase2.data["message"] = (
            (phase2.data.get("message") or "Text analysis complete")
            + " — could not generate geometry: add more dimensions."
        )
    summary = _format_user_message(analysis, phase2.data)
    summary += f" [Texte · CAO: {cad_model}]"
    phase2.data["message"] = summary
    return phase2


def _two_phase_enabled() -> bool:
    return os.getenv("FORMA_MODELLING_TWO_PHASE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def run_modelling_pipeline(
    prompt: str,
    context: str,
    images: List[Tuple[str, str]],
    model_id: Optional[str] = None,
):
    """Analyse vision puis synthèse CAO (2 appels LLM)."""
    from app.ai import llm
    from app.ai.models import resolve_modelling_models

    vision_model, cad_model = resolve_modelling_models(model_id)

    if not images:
        return llm.complete_json(
            prompt,
            context,
            model_id,
            images=None,
            system_override=PHASE2_SYSTEM,
        )

    if not _two_phase_enabled():
        result = llm.complete_json(
            prompt,
            context,
            model_id,
            images=images,
            system_override=PHASE1_SYSTEM + "\n\nEnsuite, inclus aussi operations[] dans le même JSON.",
        )
        if result.data and isinstance(result.data, dict):
            analysis = result.data
            result.data["operations"] = ensure_render_operations(
                result.data.get("operations")
                if isinstance(result.data.get("operations"), list)
                else None,
                analysis,
            )
            result.data["_analysis"] = analysis
        return result

    user_p1 = modelling_user_instruction(prompt, context)
    phase1 = llm.invoke(
        PHASE1_SYSTEM,
        user_p1,
        model_id=vision_model,
        images=images,
        max_tokens=24576,
        temperature=0.0,
    )
    if phase1.error or not phase1.data:
        return phase1

    analysis = phase1.data
    catalog = analysis.get("dimensions_catalog")
    catalog_hint = ""
    if isinstance(catalog, list) and catalog:
        catalog_hint = (
            f"\n\nRAPPEL : {len(catalog)} cote(s) cataloguée(s) — utilise ces valeurs "
            "exactes pour chaque paramètre géométrique.\n"
        )
    user_p2 = (
        "Analyse métrologique du plan (à respecter strictement, cote par cote) :\n"
        + json.dumps(analysis, ensure_ascii=False, indent=2)
        + catalog_hint
        + "\nGénère les opérations CAO (phase 2). Chaque extrude et trou doit refléter "
        "fidèlement les cotes du catalogue et des stages. Document actuel :\n"
        + context
    )
    phase2 = llm.invoke(
        PHASE2_SYSTEM,
        user_p2,
        model_id=cad_model,
        images=None,
        max_tokens=24576,
        temperature=0.0,
    )
    if phase2.error or not phase2.data:
        return phase2

    ops = ensure_render_operations(
        phase2.data.get("operations")
        if isinstance(phase2.data.get("operations"), list)
        else None,
        analysis,
    )
    phase2.data["operations"] = ops
    phase2.data["_analysis"] = analysis

    if not ops:
        phase2.data["message"] = (
            (phase2.data.get("message") or "Analysis complete")
            + " — could not generate geometry: drawing unreadable or no usable dimensions."
        )

    summary = _format_user_message(analysis, phase2.data)
    summary += f" [Vision: {vision_model} · CAO: {cad_model}]"
    phase2.data["message"] = summary
    phase2.data["_models"] = {"vision": vision_model, "cad": cad_model}
    return phase2


def _format_user_message(analysis: dict, cad: dict) -> str:
    name = analysis.get("part_name") or "Part"
    conf = analysis.get("confidence")
    lines = [cad.get("message") or f"Model: {name}."]
    reasoning = analysis.get("reasoning") or {}
    if isinstance(reasoning, dict):
        strat = reasoning.get("cad_strategy") or reasoning.get("part_classification")
        if strat:
            lines.append(f"Strategy: {strat}")
    catalog = analysis.get("dimensions_catalog")
    if isinstance(catalog, list) and catalog:
        samples = [
            f"{e.get('label', '?')}={e.get('value_mm')}mm"
            for e in catalog[:12]
            if isinstance(e, dict) and e.get("value_mm") is not None
        ]
        if samples:
            extra = f" (+{len(catalog) - len(samples)} more)" if len(catalog) > len(samples) else ""
            lines.append("Dimensions read: " + ", ".join(samples) + extra)
    dims = analysis.get("overall_dimensions_mm") or {}
    dim_parts = [f"{k}={v}" for k, v in dims.items() if v is not None]
    if dim_parts:
        lines.append("Bounding box: " + ", ".join(dim_parts))
    if conf is not None:
        lines.append(f"Analysis confidence: {float(conf):.0%}")
    unc = analysis.get("uncertainties") or []
    if unc:
        lines.append("Uncertainties: " + "; ".join(str(u) for u in unc[:3]))
    return " ".join(lines)


def ensure_render_operations(
    operations: Optional[List[dict]], analysis: dict
) -> List[dict]:
    """Construit des opérations CAO exploitables pour le mode Render."""
    ops = normalize_operations(list(operations or []), analysis)
    if ops:
        return _append_holes_if_missing(ops, analysis)

    stages = _extract_stages(analysis)
    if stages:
        built = [_stage_to_operation(stage, i) for i, stage in enumerate(stages)]
        ops = normalize_operations(built, analysis)
        if ops:
            return _append_holes_if_missing(ops, analysis)

    fallback = _fallback_body_from_dimensions(analysis)
    if fallback:
        ops = normalize_operations(fallback, analysis)
        if ops:
            return _append_holes_if_missing(ops, analysis)

    return []


def _fallback_body_from_dimensions(analysis: dict) -> List[dict]:
    dims = analysis.get("overall_dimensions_mm") or {}
    try:
        lx = float(dims.get("length_x") or 0)
        wy = float(dims.get("width_y") or 0)
        hz = float(dims.get("height_z") or 0)
    except (TypeError, ValueError):
        return []
    if lx <= 0 or wy <= 0 or hz <= 0:
        return []
    name = str(analysis.get("part_name") or "Body")
    return [
        {
            "op": "add",
            "feature": {
                "id": "render-body-1",
                "type": "extrude",
                "name": name,
                "params": {
                    "profile": {"shape": "rectangle", "w": lx, "d": wy},
                    "distance": hz,
                    "z0": 0,
                    "operation": "add",
                },
            },
        }
    ]


def _append_holes_if_missing(ops: List[dict], analysis: dict) -> List[dict]:
    has_hole = any(
        _feature_of(op).get("type") in ("hole", "pattern_circular", "pattern_linear")
        for op in ops
    )
    if has_hole:
        return ops
    body_z = _infer_body_height(ops, analysis, _extract_stages(analysis))
    return ops + _holes_from_analysis(analysis, body_z)


def _holes_from_analysis(analysis: dict, body_z: float) -> List[dict]:
    holes = analysis.get("holes")
    if not isinstance(holes, list):
        return []
    out: List[dict] = []
    for i, hole in enumerate(holes):
        if not isinstance(hole, dict):
            continue
        try:
            count = int(hole.get("count") or 1)
            dia = float(hole.get("diameter_mm") or hole.get("diameter") or 6.6)
            x = float(hole.get("x") or 0)
            y = float(hole.get("y") or 0)
            z_top = float(hole.get("z_top") or body_z)
            through = bool(hole.get("through", True))
            pcd = hole.get("pcd_mm")
            pattern = str(hole.get("pattern") or "single").lower()
        except (TypeError, ValueError):
            continue

        label = str(hole.get("description") or f"Trou {i + 1}")
        if count > 1 and pcd and pattern in ("circular", "circle"):
            r_pcd = float(pcd) / 2
            out.append(
                {
                    "op": "add",
                    "feature": {
                        "id": f"hole-pat-{i + 1}",
                        "type": "pattern_circular",
                        "name": label,
                        "params": {
                            "count": count,
                            "angle": 360,
                            "full": True,
                            "cx": x,
                            "cy": y,
                            "feature": {
                                "id": f"hole-{i + 1}-tpl",
                                "type": "hole",
                                "name": "Trou",
                                "params": {
                                    "x": r_pcd,
                                    "y": 0,
                                    "diameter": dia,
                                    "through": through,
                                    "z_top": z_top,
                                },
                            },
                        },
                    },
                }
            )
        else:
            out.append(
                {
                    "op": "add",
                    "feature": {
                        "id": f"hole-{i + 1}",
                        "type": "hole",
                        "name": label,
                        "params": {
                            "x": x,
                            "y": y,
                            "diameter": dia,
                            "through": through,
                            "z_top": z_top,
                        },
                    },
                }
            )
    return out


def normalize_operations(operations: List[dict], analysis: dict) -> List[dict]:
    """Garantit que toutes les couches (stages) de l'analyse sont matérialisées.

    Si la phase 2 a oublié des stages, on les complète à partir de `analysis.stages`.
    Si la phase 2 a complètement zappé (operations vides ou trop génériques), on
    reconstruit l'historique à partir des stages.
    """
    operations = operations or []
    stages = _extract_stages(analysis)
    body_z = _infer_body_height(operations, analysis, stages)

    rebuilt = list(operations)

    # Si on a des stages mais aucun extrude/cylinder/box dans operations → on injecte.
    has_body = any(_is_body_feature(_feature_of(op)) for op in rebuilt)
    if stages and not has_body:
        stage_ops = [_stage_to_operation(stage, i) for i, stage in enumerate(stages)]
        rebuilt = stage_ops + rebuilt

    # Si on a + de stages que de bodies, complète avec ceux qui manquent (par index)
    elif stages:
        body_count = sum(1 for op in rebuilt if _is_body_feature(_feature_of(op)))
        if body_count < len(stages):
            missing = stages[body_count:]
            extra_ops = [
                _stage_to_operation(stage, body_count + i)
                for i, stage in enumerate(missing)
            ]
            # injecte les stages manquants juste après le dernier body
            insert_at = _last_body_index(rebuilt) + 1
            rebuilt = rebuilt[:insert_at] + extra_ops + rebuilt[insert_at:]

    out: List[dict] = []
    for op in rebuilt:
        if op.get("op") != "add":
            out.append(op)
            continue
        feat = op.get("feature") or {}
        feat = _normalize_feature(feat, body_z)
        if feat.get("type") == "pattern_circular":
            feat = _normalize_pattern(feat, body_z)
        out.append({**op, "feature": feat})
    return out


# --- Stages ------------------------------------------------------------- #
def _extract_stages(analysis: dict) -> List[dict]:
    stages = analysis.get("stages") if isinstance(analysis, dict) else None
    if not isinstance(stages, list) or not stages:
        return []
    cleaned: List[dict] = []
    for s in stages:
        if not isinstance(s, dict):
            continue
        try:
            thickness = float(s.get("thickness", 0))
        except (TypeError, ValueError):
            continue
        if thickness <= 0:
            continue
        try:
            z0 = float(s.get("z0", 0))
        except (TypeError, ValueError):
            z0 = 0.0
        op = (s.get("operation") or "add").lower()
        if op not in ("add", "cut"):
            op = "add"
        cleaned.append({
            "name": str(s.get("name") or "Stage"),
            "operation": op,
            "z0": z0,
            "thickness": thickness,
            "shape_hint": (s.get("shape_hint") or "").lower(),
            "rectangle": s.get("rectangle") if isinstance(s.get("rectangle"), dict) else None,
            "circle": s.get("circle") if isinstance(s.get("circle"), dict) else None,
            "outline_xy": s.get("outline_xy") if isinstance(s.get("outline_xy"), list) else None,
        })
    return cleaned


def _stage_profile(stage: dict) -> dict:
    hint = stage.get("shape_hint") or ""
    rect = stage.get("rectangle")
    circle = stage.get("circle")
    outline = stage.get("outline_xy")

    if hint == "rectangle" and rect:
        return {
            "shape": "rectangle",
            "w": float(rect.get("w", rect.get("width", 50))),
            "d": float(rect.get("d", rect.get("depth", 50))),
            "cx": float(rect.get("cx", 0)),
            "cy": float(rect.get("cy", 0)),
        }
    if hint == "circle" and circle:
        return {
            "shape": "circle",
            "r": float(circle.get("r", circle.get("radius", 25))),
            "cx": float(circle.get("cx", 0)),
            "cy": float(circle.get("cy", 0)),
        }
    pts = _clean_points(outline)
    if pts:
        return {"shape": "points", "points": pts}
    # fallback rectangle
    if rect:
        return {
            "shape": "rectangle",
            "w": float(rect.get("w", 50)),
            "d": float(rect.get("d", 50)),
            "cx": float(rect.get("cx", 0)),
            "cy": float(rect.get("cy", 0)),
        }
    if circle:
        return {
            "shape": "circle",
            "r": float(circle.get("r", 25)),
            "cx": float(circle.get("cx", 0)),
            "cy": float(circle.get("cy", 0)),
        }
    raise ValueError("Stage sans profil exploitable")


def _stage_to_operation(stage: dict, index: int) -> dict:
    profile = _stage_profile(stage)
    return {
        "op": "add",
        "feature": {
            "id": f"stage-{index + 1}",
            "type": "extrude",
            "name": stage.get("name") or f"Stage {index + 1}",
            "params": {
                "profile": profile,
                "distance": stage["thickness"],
                "z0": stage["z0"],
                "operation": stage["operation"],
            },
        },
    }


def _clean_points(points: Optional[List]) -> List[List[float]]:
    if not isinstance(points, list) or len(points) < 3:
        return []
    out: List[List[float]] = []
    for p in points:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            continue
        try:
            out.append([float(p[0]), float(p[1])])
        except (TypeError, ValueError):
            continue
    return out if len(out) >= 3 else []


def _feature_of(op: dict) -> dict:
    if not isinstance(op, dict):
        return {}
    return op.get("feature") or {}


def _is_body_feature(feat: dict) -> bool:
    return feat.get("type") in ("box", "cylinder", "extrude")


def _last_body_index(ops: List[dict]) -> int:
    last = -1
    for i, op in enumerate(ops):
        if _is_body_feature(_feature_of(op)):
            last = i
    return last


def _infer_body_height(
    operations: List[dict], analysis: dict, stages: Optional[List[dict]] = None
) -> float:
    if stages:
        return max(s["z0"] + s["thickness"] for s in stages if s["operation"] == "add")
    for op in operations:
        f = op.get("feature") or {}
        t = f.get("type")
        p = f.get("params") or {}
        if t == "cylinder":
            return float(p.get("h", p.get("height", 0)))
        if t == "extrude":
            return float(p.get("distance", 0))
    dims = analysis.get("overall_dimensions_mm") or {}
    for key in ("height_z", "height_or_thickness", "thickness"):
        h = dims.get(key)
        if h is not None:
            try:
                return float(h)
            except (TypeError, ValueError):
                pass
    return 10.0


def _normalize_feature(feat: dict, body_z: float) -> dict:
    t = feat.get("type")
    p = dict(feat.get("params") or {})
    if t == "hole":
        p = _normalize_hole_params(p, body_z)
    feat = {**feat, "params": p}
    return feat


def _normalize_pattern(feat: dict, body_z: float) -> dict:
    p = dict(feat.get("params") or {})
    sub = p.get("feature")
    if isinstance(sub, dict):
        sp = dict(sub.get("params") or {})
        sp = _normalize_hole_params(sp, body_z)
        p["feature"] = {**sub, "params": sp}
    return {**feat, "params": p}


def _normalize_hole_params(p: dict, body_z: float) -> dict:
    dia = float(p.get("diameter", 6.6))
    name = str(p.get("name", "")) + str(p.get("label", ""))
    for label, clearance in METRIC_CLEARANCE.items():
        if label.lower() in name.lower():
            dia = clearance
            break
    m = re.search(r"\bM\s?(\d+)\b", name, re.I)
    if m:
        label = "M" + m.group(1)
        dia = METRIC_CLEARANCE.get(label, dia)
    p["diameter"] = dia
    p.setdefault("through", True)
    p["z_top"] = float(p.get("z_top", body_z))
    return p


# Legacy export for llm.py
MODELLING_SYSTEM_PROMPT = PHASE1_SYSTEM
