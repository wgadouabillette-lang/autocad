"""Agent IA : transforme une instruction en operations CAD et les applique.

Pipeline :
  1. Si un LLM est configure, on lui demande un JSON d'operations.
  2. Sinon (ou en cas d'echec), un moteur de regles deterministe couvre les
     cas courants (trous, perçages repetes, conges, coque, dimensions...).
  3. Les operations sont appliquees uniformement au document, puis le solide
     est reconstruit.

C'est le moteur du workflow #3 (« Ajoute 8 trous M8 espaces sur cette bride »).
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Tuple

from app.ai import llm, models, quota, text_to_cad
from app.ai.face_reference import (
    filter_operations_for_faces,
    parse_face_references,
    z_top_for_hole,
)
from app.ai.modelling import (
    ensure_render_operations,
    is_text_render_spec,
    run_modelling_pipeline,
    run_text_render_pipeline,
)
from app.ai.knowledge import (
    detect_material,
    detect_thread,
    find_count,
    find_named,
)
from app.engine.kernel import rebuild
from app.models.schemas import (
    AgentAction,
    AgentResponse,
    Document,
    Feature,
)


def _uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


# --------------------------------------------------------------------------- #
#  Application uniforme des operations (LLM ou regles)
# --------------------------------------------------------------------------- #
def apply_operations(doc: Document, operations: List[dict]) -> Tuple[Document, List[AgentAction]]:
    actions: List[AgentAction] = []
    feats = list(doc.features)
    by_id = {f.id: i for i, f in enumerate(feats)}

    for op in operations:
        kind = op.get("op", "noop")

        if kind == "add" and "feature" in op:
            f = Feature(**op["feature"])
            if not f.id:
                f.id = _uid(f.type)
            feats.append(f)
            by_id[f.id] = len(feats) - 1
            actions.append(AgentAction(kind="add", description=f"Added: {f.name or f.type}", feature_ids=[f.id]))

        elif kind == "modify" and op.get("feature_id") in by_id:
            idx = by_id[op["feature_id"]]
            feats[idx].params.update(op.get("params", {}))
            actions.append(AgentAction(kind="modify", description=f"Modified: {feats[idx].name}", feature_ids=[feats[idx].id]))

        elif kind == "remove" and op.get("feature_id") in by_id:
            idx = by_id[op["feature_id"]]
            removed = feats.pop(idx)
            by_id = {f.id: i for i, f in enumerate(feats)}
            actions.append(AgentAction(kind="remove", description=f"Removed: {removed.name}", feature_ids=[removed.id]))

        elif kind == "set_material":
            doc.meta["material"] = op.get("material", "aluminium")
            actions.append(AgentAction(kind="modify", description=f"Material: {op.get('material')}"))

    doc.features = feats
    return doc, actions


# --------------------------------------------------------------------------- #
#  Point d'entree
# --------------------------------------------------------------------------- #
def _augment_prompt(prompt: str, work_mode: str) -> str:
    if (
        "[FACE CONSTRAINT" in prompt
        or "[CONSIGNE FACES" in prompt
        or "[REFERENCE FACE" in prompt
        or "[RÉFÉRENCE FACE" in prompt
    ):
        prompt = (
            "[FACE CONSTRAINT — SYSTEM REMINDER]\n"
            "Faces have been selected on the model (see REFERENCE FACE below). "
            "Modify ONLY these areas. Do not change the rest of the part.\n\n"
            + prompt
        )
    mode = (work_mode or "agent").strip().lower()
    if mode == "plan":
        return (
            "[MODE PLAN] Propose a structured action plan in English. "
            "Do not modify the document: return \"operations\": [].\n\n"
            + prompt
        )
    if mode == "interrogation":
        return (
            "[INTERROGATION MODE] Answer the question without modifying the document: "
            "\"operations\": [].\n\n"
            + prompt
        )
    if mode == "multitask":
        return (
            "[MULTITASK MODE] Break the request into sub-tasks, then execute them "
            "via operations if needed.\n\n"
            + prompt
        )
    if mode == "render":
        return (
            "[RENDER MODE — MODEL FROM DRAWING]\n"
            "Mission: reconstruct the actual 3D part from the attached image/plan.\n"
            "REQUIRED — exhaustive dimensional survey before any geometry:\n"
            "- Read ALL visible dimensions: lengths, widths, Ø, R, M, angles, depths, "
            "center distances, PCD, hole positions.\n"
            "- Fill dimensions_catalog (one entry per readable annotation).\n"
            "- Cross-check all views; chain dimensions; verify sum of thicknesses = height.\n"
            "- Each visible detail (boss, pocket, hole, shoulder) = dedicated stage or hole.\n"
            "Forbidden: generic rectangular block if the drawing shows more detail.\n"
            "Do not guess — flag uncertainties.\n\n"
            + prompt
        )
    if mode == "agent":
        return (
            "[AGENT MODE — SIMPLE CAD TASKS]\n"
            "Interpret the requested shape precisely (ball→sphere, cube→box, cylinder→cylinder, "
            "plate→extrude). Empty document: one suitable primitive, never a plate by default "
            "if another shape is requested.\n\n"
            + prompt
        )
    return prompt


def _mutates_document(work_mode: str) -> bool:
    return (work_mode or "agent").strip().lower() in ("agent", "multitask", "render")


def run(
    doc: Document,
    prompt: str,
    material: str = "aluminium",
    ai_model: str = "auto",
    work_mode: str = "agent",
    images: Optional[List[dict]] = None,
) -> AgentResponse:
    source = "rules"
    message = ""
    operations: Optional[List[dict]] = None
    ai_model_fallback = False
    mode = (work_mode or "agent").strip().lower()
    image_payload = models.decode_images(images)
    text_render = mode == "render" and is_text_render_spec(prompt)
    modelling = mode == "render" and (bool(image_payload) or text_render)
    mutates = _mutates_document(work_mode) or modelling
    llm_prompt = _augment_prompt(prompt, work_mode)
    selected_faces = parse_face_references(prompt)
    face_mode = bool(selected_faces)

    if mode == "render" and not image_payload and not text_render:
        return AgentResponse(
            document=doc,
            message=(
                "Render mode requires a drawing image or a detailed text description "
                "(dimensions, holes, etc.) — attach an image with the + button "
                "or describe the part more precisely."
            ),
            actions=[],
            rebuild=rebuild(doc, doc.meta.get("material", material)),
            source="rules",
        )

    if llm.available():
        context = _context(doc, selected_faces)
        system_override = None
        if face_mode and not modelling:
            system_override = llm.SYSTEM_PROMPT + llm.FACE_CONSTRAINT_APPEND
        model_id = models.resolve_model(
            ai_model,
            prompt,
            has_images=bool(image_payload),
            modelling=modelling,
            work_mode=mode,
        )

        def _invoke_llm(resolved_model_id: str) -> llm.LlmResult:
            if modelling and image_payload:
                return run_modelling_pipeline(
                    llm_prompt, context, image_payload, resolved_model_id
                )
            if modelling and text_render:
                return run_text_render_pipeline(llm_prompt, context, resolved_model_id)
            return llm.complete_json(
                llm_prompt,
                context,
                resolved_model_id,
                images=image_payload or None,
                system_override=system_override,
                modelling=False,
            )

        llm_result = _invoke_llm(model_id)
        llm_result, ai_model_fallback = quota.maybe_retry_auto_model(
            ai_model,
            llm_result,
            lambda: _invoke_llm(
                quota.resolve_auto_model_id(
                    prompt,
                    has_images=bool(image_payload),
                    modelling=modelling,
                    work_mode=mode,
                )
            ),
        )
        provider = llm.active_provider() or "llm"

        if llm_result.data:
            data = llm_result.data
            message = data.get("message", "") or message
            if ai_model_fallback:
                message = quota.prepend_fallback_notice(message)
            if mutates and isinstance(data.get("operations"), list):
                operations = data["operations"]
            elif not mutates:
                operations = []
            if modelling:
                analysis = data.get("_analysis")
                if isinstance(analysis, dict):
                    pname = analysis.get("part_name")
                    if pname and not doc.features:
                        doc.name = str(pname)
                    operations = ensure_render_operations(operations, analysis)
            source = provider
        elif modelling:
            operations = []
            source = provider
            message = llm_result.error or (
                "Grok image analysis failed. Check the image (min. 8×8 px, readable drawing) "
                "and try again."
            )

    if operations is None and not modelling:
        if mutates:
            message, operations = _rule_engine(doc, prompt, selected_faces)
        else:
            message = _info_only_message(doc, prompt, work_mode)
            operations = []
        source = "rules"
    elif operations is None and modelling:
        operations = []
        if not message:
            message = (
                "Image analysis: set XAI_API_KEY in backend/.env and restart the server."
            )
        source = "rules"

    if not mutates:
        operations = []

    if face_mode and mutates:
        res_pre = rebuild(doc, doc.meta.get("material", material))
        ops_before = len(operations or [])
        operations = filter_operations_for_faces(
            operations or [],
            selected_faces,
            res_pre.bbox.min,
            res_pre.bbox.max,
        )
        if ops_before > 0 and not operations:
            message = (message or "") + (
                " Operations outside the selected faces were ignored."
            )
        if not operations and _prompt_asks_holes(prompt):
            fm, fo = _face_rule_engine(doc, prompt, selected_faces)
            if fo:
                message = fm
                operations = fo

    doc, actions = apply_operations(doc, operations or [])
    mat = doc.meta.get("material", material)
    result = rebuild(doc, mat)

    if modelling and not actions:
        hint = (
            " No geometry was applied — check that the image is a readable drawing "
            "with dimensions, or try again with a sharper photo."
        )
        if hint.strip() not in (message or ""):
            message = (message or "Render analysis complete.") + hint
    elif not message:
        message = "Operation completed." if actions else "I couldn't interpret the request."

    return AgentResponse(
        document=doc,
        message=message,
        actions=actions,
        rebuild=result,
        source=source,
        ai_model_fallback=ai_model_fallback,
        effective_ai_model="auto" if ai_model_fallback else ai_model,
    )


def _info_only_message(doc: Document, prompt: str, work_mode: str) -> str:
    mode = (work_mode or "agent").strip().lower()
    n = len(doc.features)
    if mode == "plan":
        return (
            f"Plan (offline mode): the document has {n} feature(s). "
            f"Connect an API key for a detailed plan. Request: {prompt[:200]}"
        )
    return (
        f"The document has {n} feature(s). "
        f"Q&A mode — connect an LLM for a detailed answer. "
        f"Question: {prompt[:200]}"
    )


def _context(doc: Document, selected_faces=None) -> str:
    lines = [f"Document '{doc.name}' ({len(doc.features)} features):"]
    for f in doc.features:
        lines.append(f"- {f.id} [{f.type}] {f.name} params={f.params}")
    res = rebuild(doc, doc.meta.get("material", "aluminium"))
    lines.append(f"BBox min={res.bbox.min} max={res.bbox.max}")
    if selected_faces:
        lines.append(
            "\n[SELECTED FACES — LOCAL MODIFICATIONS ONLY]"
        )
        for i, face in enumerate(selected_faces, 1):
            cx, cy, cz = face.centroid
            nx, ny, nz = face.normal
            lines.append(
                f"- Face {i}: {face.label} | ref=({cx:.2f},{cy:.2f},{cz:.2f}) mm "
                f"| normal=({nx:.3f},{ny:.3f},{nz:.3f})"
            )
        lines.append(
            "Only add holes (hole/pattern) at the x,y reference points above. "
            "No fillet, shell, modify, or global remove."
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
#  Moteur de regles (fallback sans LLM)
# --------------------------------------------------------------------------- #
def _rule_engine(
    doc: Document, prompt: str, selected_faces=None
) -> Tuple[str, List[dict]]:
    faces = selected_faces if selected_faces is not None else parse_face_references(prompt)
    if faces:
        return _face_rule_engine(doc, prompt, faces)

    low = prompt.lower()
    res = rebuild(doc, doc.meta.get("material", "aluminium"))
    bbox = res.bbox
    has_body = res.ok and any(res.bbox.max[i] > res.bbox.min[i] for i in range(3))

    # --- materiau ---
    mat = detect_material(prompt)
    if mat and not any(k in low for k in ["trou", "perç", "perc", "hole", "congé", "conge", "chanfrein"]):
        return f"Material set to {mat}.", [{"op": "set_material", "material": mat}]

    # --- creation d'une nouvelle piece ---
    if any(k in low for k in ["crée", "cree", "créer", "creer", "nouveau", "génère", "genere", "create", "new part"]) \
            and not has_body:
        new_doc = text_to_cad.generate(prompt, doc.meta.get("material", "aluminium"))
        ops = [{"op": "add", "feature": f.model_dump()} for f in new_doc.features]
        return f"Generated model: {new_doc.name}.", ops

    # --- perçages / trous (cas phare) ---
    if any(k in low for k in ["trou", "perç", "perc", "hole", "perage", "vis", "boulon"]):
        return _holes_rule(prompt, bbox, has_body)

    # --- congé / chanfrein ---
    if any(k in low for k in ["congé", "conge", "arrondi", "fillet"]):
        r = find_named(prompt, "rayon", "radius", "congé", "conge") or 3
        return (f"Fillet R{r:g} added (approximate — see README for B-Rep kernel).",
                [{"op": "add", "feature": {"id": _uid("fillet"), "type": "fillet", "name": f"Fillet R{r:g}", "params": {"radius": r}}}])
    if any(k in low for k in ["chanfrein", "chamfer"]):
        c = find_named(prompt, "chanfrein", "chamfer", "distance") or 2
        return (f"Chamfer {c:g} mm added (approximate).",
                [{"op": "add", "feature": {"id": _uid("chamfer"), "type": "chamfer", "name": f"Chamfer {c:g}", "params": {"distance": c}}}])

    # --- coque / évidement ---
    if any(k in low for k in ["coque", "évide", "evide", "creuse", "shell", "hollow"]):
        th = find_named(prompt, "paroi", "épaisseur", "epaisseur", "wall", "thickness") or 2.5
        return (f"Shell {th:g} mm applied.",
                [{"op": "add", "feature": {"id": _uid("shell"), "type": "shell", "name": f"Shell {th:g}mm", "params": {"thickness": th}}}])

    # --- modification de dimension ---
    if any(k in low for k in ["change", "modifie", "augmente", "réduit", "reduit", "passe", "mets", "set"]):
        return _modify_rule(doc, prompt)

    # --- suppression ---
    if any(k in low for k in ["supprime", "enlève", "enleve", "retire", "delete", "remove"]) and doc.features:
        target = doc.features[-1]
        if "trou" in low or "hole" in low:
            for f in reversed(doc.features):
                if f.type in ("hole", "pattern_circular", "pattern_linear"):
                    target = f
                    break
        return f"Removed: {target.name or target.type}.", [{"op": "remove", "feature_id": target.id}]

    return ("I can: create a part, add holes (e.g. '8 evenly spaced M8 holes'), "
            "fillets/chamfers, a shell, modify a dimension, or change the material.", [])


def _face_rule_engine(
    doc: Document, prompt: str, faces: List
) -> Tuple[str, List[dict]]:
    """Règles déterministes limitées aux faces sélectionnées."""
    low = prompt.lower()
    res = rebuild(doc, doc.meta.get("material", "aluminium"))
    bbox = res.bbox
    has_body = res.ok and any(res.bbox.max[i] > res.bbox.min[i] for i in range(3))

    if any(k in low for k in ["trou", "perç", "perc", "hole", "perage", "vis", "boulon"]):
        return _holes_rule_for_faces(prompt, faces, bbox, has_body)

    if any(k in low for k in ["supprime", "enlève", "enleve", "retire", "delete", "remove"]):
        return _remove_hole_near_faces(doc, prompt, faces)

    return (
        "Faces are selected: only local holes/drilling on these areas "
        "are allowed (no fillet, shell, or global modification). "
        "E.g.: 'add an M8 hole here'.",
        [],
    )


def _prompt_asks_holes(prompt: str) -> bool:
    low = prompt.lower()
    return any(
        k in low
        for k in ["trou", "perç", "perc", "hole", "perage", "vis", "boulon"]
    )


def _remove_hole_near_faces(doc, prompt: str, faces) -> Tuple[str, List[dict]]:
    from app.ai.face_reference import max_xy_tolerance_mm, nearest_face_xy

    low = prompt.lower()
    if "trou" not in low and "hole" not in low:
        return (
            "With a face selection, only removing a local hole is supported.",
            [],
        )
    res = rebuild(doc, doc.meta.get("material", "aluminium"))
    tol = max_xy_tolerance_mm(res.bbox.min, res.bbox.max)
    for f in reversed(doc.features):
        if f.type != "hole":
            continue
        x = float(f.params.get("x", 0))
        y = float(f.params.get("y", 0))
        _, d = nearest_face_xy(x, y, faces)
        if d <= tol:
            return f"Hole removed near the selected face.", [
                {"op": "remove", "feature_id": f.id}
            ]
    return ("No hole found on the selected face(s).", [])


def _holes_rule_for_faces(prompt, faces, bbox, has_body: bool) -> Tuple[str, List[dict]]:
    low = prompt.lower()
    thread = detect_thread(prompt)
    dia = thread[1] if thread else (find_named(prompt, "diametre", "diamètre", "diameter", "ø") or 6.6)
    label = thread[0] if thread else f"Ø{dia:g}"

    if not has_body:
        return ("No solid body: create a part first.", [])

    z_top = float(bbox.max[2])
    count = find_count(prompt)
    circular = any(
        k in low
        for k in ["répart", "repart", "également", "egalement", "cercle", "circ", "espac"]
    )
    linear = any(k in low for k in ["ligne", "rangée", "rangee", "linéaire", "lineaire", "row"])
    primary = faces[0]
    cx, cy, _ = primary.centroid
    z_hole = z_top_for_hole(primary, z_top)

    if circular and (count or len(faces) == 1):
        n = count or 6
        span = max(
            float(bbox.max[0]) - float(bbox.min[0]),
            float(bbox.max[1]) - float(bbox.min[1]),
            20.0,
        )
        bolt_r = (find_named(prompt, "entraxe", "bcd") or 0) / 2 or span * 0.15
        feat = {
            "id": _uid("pat"),
            "type": "pattern_circular",
            "name": f"{n} holes {label} on selected face",
            "params": {
                "count": n,
                "angle": 360,
                "full": True,
                "cx": cx,
                "cy": cy,
                "feature": {
                    "id": _uid("h"),
                    "type": "hole",
                    "name": f"Hole {label}",
                    "params": {
                        "x": cx + bolt_r,
                        "y": cy,
                        "diameter": dia,
                        "through": True,
                        "z_top": z_hole,
                    },
                },
            },
        }
        return (
            f"{n} holes {label} evenly spaced on the selected face (center {cx:.1f}, {cy:.1f} mm).",
            [{"op": "add", "feature": feat}],
        )

    if linear and count:
        n = count
        pitch = find_named(prompt, "pas", "espacement", "pitch", "spacing") or 20.0
        x0 = cx - pitch * (n - 1) / 2
        feat = {
            "id": _uid("pat"),
            "type": "pattern_linear",
            "name": f"{n} holes {label} on selected face",
            "params": {
                "count": n,
                "dx": pitch,
                "dy": 0,
                "dz": 0,
                "feature": {
                    "id": _uid("h"),
                    "type": "hole",
                    "name": f"Hole {label}",
                    "params": {
                        "x": x0,
                        "y": cy,
                        "diameter": dia,
                        "through": True,
                        "z_top": z_hole,
                    },
                },
            },
        }
        return (
            f"{n} holes {label} aligned on the selected face.",
            [{"op": "add", "feature": feat}],
        )

    if len(faces) > 1:
        ops = []
        for face in faces:
            fx, fy, _ = face.centroid
            zh = z_top_for_hole(face, z_top)
            ops.append(
                {
                    "op": "add",
                    "feature": {
                        "id": _uid("hole"),
                        "type": "hole",
                        "name": f"Hole {label}",
                        "params": {
                            "x": fx,
                            "y": fy,
                            "diameter": dia,
                            "through": True,
                            "z_top": zh,
                        },
                    },
                }
            )
        return (
            f"{len(faces)} holes {label} on the {len(faces)} selected faces.",
            ops,
        )

    fx, fy, _ = primary.centroid
    return (
        f"Hole {label} on the selected face ({fx:.1f}, {fy:.1f} mm).",
        [
            {
                "op": "add",
                "feature": {
                    "id": _uid("hole"),
                    "type": "hole",
                    "name": f"Hole {label}",
                    "params": {
                        "x": fx,
                        "y": fy,
                        "diameter": dia,
                        "through": True,
                        "z_top": z_hole,
                    },
                },
            }
        ],
    )


def _holes_rule(prompt: str, bbox, has_body: bool) -> Tuple[str, List[dict]]:
    low = prompt.lower()
    thread = detect_thread(prompt)
    dia = thread[1] if thread else (find_named(prompt, "diametre", "diamètre", "diameter", "ø") or 6.6)
    label = thread[0] if thread else f"Ø{dia:g}"

    if not has_body:
        return ("No solid present: create a part first (e.g. 'create a Ø120 flange').", [])

    cx = (bbox.min[0] + bbox.max[0]) / 2
    cy = (bbox.min[1] + bbox.max[1]) / 2
    z_top = bbox.max[2]
    rx = (bbox.max[0] - bbox.min[0]) / 2
    ry = (bbox.max[1] - bbox.min[1]) / 2
    radius = min(rx, ry)

    count = find_count(prompt)
    circular = any(k in low for k in ["répart", "repart", "également", "egalement", "cercle", "circ", "bride", "flange", "espac"])
    linear = any(k in low for k in ["ligne", "rangée", "rangee", "linéaire", "lineaire", "row"])
    grid = any(k in low for k in ["grille", "grid", "matrice"])

    if circular and (count or "bride" in low):
        n = count or 6
        bolt_r = (find_named(prompt, "entraxe", "bcd") or radius * 1.5) / 2 if find_named(prompt, "entraxe", "bcd") else radius * 0.72
        feat = {
            "id": _uid("pat"), "type": "pattern_circular",
            "name": f"{n} holes {label} evenly spaced",
            "params": {
                "count": n, "angle": 360, "full": True, "cx": cx, "cy": cy,
                "feature": {
                    "id": _uid("h"), "type": "hole", "name": f"Hole {label}",
                    "params": {"x": cx + bolt_r, "y": cy, "diameter": dia, "through": True, "z_top": z_top},
                },
            },
        }
        return f"{n} holes {label} evenly spaced on a circle (bolt circle Ø {2*bolt_r:.1f} mm).", [{"op": "add", "feature": feat}]

    if linear and count:
        n = count
        pitch = find_named(prompt, "pas", "espacement", "pitch", "spacing") or (2 * rx / (n + 1))
        x0 = cx - pitch * (n - 1) / 2
        feat = {
            "id": _uid("pat"), "type": "pattern_linear",
            "name": f"{n} holes {label} in a row",
            "params": {
                "count": n, "dx": pitch, "dy": 0, "dz": 0,
                "feature": {"id": _uid("h"), "type": "hole", "name": f"Hole {label}",
                            "params": {"x": x0, "y": cy, "diameter": dia, "through": True, "z_top": z_top}},
            },
        }
        return f"{n} holes {label} aligned (pitch {pitch:.1f} mm).", [{"op": "add", "feature": feat}]

    # single hole at center
    return f"Hole {label} added at center.", [{
        "op": "add",
        "feature": {"id": _uid("hole"), "type": "hole", "name": f"Hole {label}",
                    "params": {"x": cx, "y": cy, "diameter": dia, "through": True, "z_top": z_top}},
    }]


def _modify_rule(doc: Document, prompt: str) -> Tuple[str, List[dict]]:
    if not doc.features:
        return ("Nothing to modify.", [])
    target = doc.features[-1]
    val = find_named(prompt, "largeur", "hauteur", "épaisseur", "epaisseur", "diametre", "diamètre",
                     "rayon", "longueur", "profondeur", "width", "height", "thickness", "radius")
    if val is None:
        return ("Specify the dimension (e.g. 'set thickness to 10 mm').", [])
    low = prompt.lower()
    key = None
    for kw, k in [("largeur", "w"), ("width", "w"), ("hauteur", "h"), ("height", "h"),
                  ("épaisseur", "distance"), ("epaisseur", "distance"), ("thickness", "distance"),
                  ("diametre", "diameter"), ("diamètre", "diameter"), ("rayon", "r"), ("radius", "r"),
                  ("longueur", "h"), ("profondeur", "d")]:
        if kw in low:
            key = k
            break
    if key is None:
        return ("Dimension not recognized.", [])
    # adapte la cle au type
    if target.type in ("box",) and key == "distance":
        key = "h"
    if target.type == "cylinder" and key in ("w", "d"):
        key = "r"
        val = val / 2
    return (f"{target.name or target.type} : {key} = {val:g}.",
            [{"op": "modify", "feature_id": target.id, "params": {key: val}}])
