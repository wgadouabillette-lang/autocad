"""Schemas Pydantic : le contrat partage entre le noyau, l'agent IA et le frontend.

Un document CAD = une liste ordonnee de *features* parametriques (l'historique).
Le noyau rejoue cet historique pour produire un solide, puis le tessellise
(maillage) pour l'affichage temps reel dans le viewport 3D.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  Feature tree
# --------------------------------------------------------------------------- #
class Feature(BaseModel):
    """Une operation de l'historique parametrique.

    `type` determine l'interpretation de `params`. Types supportes :
      - box        {w, d, h}
      - cylinder   {r, h}
      - sphere     {r}
      - extrude    {profile, distance, operation}  profile = sketch 2D
      - hole       {x, y, diameter, depth, through, plane}
      - fillet     {radius}
      - chamfer    {distance}
      - shell      {thickness}
      - pattern_linear   {count, dx, dy, dz, feature}
      - pattern_circular {count, axis, angle, feature}
    """

    id: str
    type: str
    name: str = ""
    suppressed: bool = False
    params: Dict[str, Any] = Field(default_factory=dict)


class Document(BaseModel):
    name: str = "Untitled"
    units: str = "mm"
    features: List[Feature] = Field(default_factory=list)
    # Metadonnees libres (materiau, notes IA, etc.)
    meta: Dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
#  Rendu
# --------------------------------------------------------------------------- #
class Mesh(BaseModel):
    """Maillage triangulaire pret pour Three.js (BufferGeometry)."""

    positions: List[float] = Field(default_factory=list)  # x,y,z * N
    normals: List[float] = Field(default_factory=list)
    indices: List[int] = Field(default_factory=list)


class BBox(BaseModel):
    min: List[float] = Field(default_factory=lambda: [0, 0, 0])
    max: List[float] = Field(default_factory=lambda: [0, 0, 0])


class MassProps(BaseModel):
    volume_mm3: float = 0.0
    area_mm2: float = 0.0
    mass_g: float = 0.0
    material: str = "aluminium"
    center_of_mass: List[float] = Field(default_factory=lambda: [0, 0, 0])
    watertight: bool = False


class RebuildResult(BaseModel):
    ok: bool = True
    mesh: Mesh = Field(default_factory=Mesh)
    bbox: BBox = Field(default_factory=BBox)
    mass: MassProps = Field(default_factory=MassProps)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
#  Requetes API
# --------------------------------------------------------------------------- #
class RebuildRequest(BaseModel):
    document: Document
    material: str = "aluminium"


class AgentImage(BaseModel):
    mime: str = "image/png"
    data_b64: str = ""


class AgentRequest(BaseModel):
    """Commande en langage naturel a executer sur le document courant."""

    document: Document
    prompt: str
    material: str = "aluminium"
    ai_model: str = "auto"  # auto | grok | claude-opus-4-7 | claude-opus-4-8
    work_mode: str = "agent"  # agent | render | plan | interrogation | multitask
    images: List[AgentImage] = Field(default_factory=list)


class AgentAction(BaseModel):
    kind: str            # "add" | "remove" | "modify" | "info" | "export" | "noop"
    description: str
    feature_ids: List[str] = Field(default_factory=list)


class AgentResponse(BaseModel):
    document: Document
    message: str
    actions: List[AgentAction] = Field(default_factory=list)
    rebuild: RebuildResult = Field(default_factory=RebuildResult)
    source: str = "rules"   # "rules" | "xai" | "openai" | "anthropic"
    ai_model_fallback: bool = False
    effective_ai_model: str = "auto"


class TextToCadRequest(BaseModel):
    prompt: str
    material: str = "aluminium"
    ai_model: str = "auto"
    work_mode: str = "agent"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    prompt: str
    messages: List[ChatMessage] = Field(default_factory=list)
    ai_model: str = "auto"


class ChatResponse(BaseModel):
    message: str
    source: str = "rules"
    ai_model_fallback: bool = False
    effective_ai_model: str = "auto"


class AnalysisRequest(BaseModel):
    document: Document
    material: str = "aluminium"
    load_n: float = 0.0          # charge appliquee (Newtons) pour estimation contrainte
    min_wall_mm: float = 1.2     # epaisseur mini pour impression 3D


class AnalysisIssue(BaseModel):
    severity: str   # "info" | "warning" | "error"
    message: str
    suggestion: str = ""


class AnalysisResponse(BaseModel):
    printability_score: int = 100
    issues: List[AnalysisIssue] = Field(default_factory=list)
    mass: MassProps = Field(default_factory=MassProps)
    stress_estimate_mpa: Optional[float] = None
    safety_factor: Optional[float] = None
    summary: str = ""
