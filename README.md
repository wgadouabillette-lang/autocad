# Hall

> Atelier d'analyse de dessins techniques 2D : import PDF/image/scan, détection des contours
> et perçages, visualisation annotée. Le mode 3D est désactivé pour l'instant.

C'est une **fondation complète et fonctionnelle** qui implémente l'architecture
visée (Frontend CAD → Moteur 3D → Agent IA → Vision IA → LLM). Ce n'est pas
encore un remplaçant de SolidWorks/Fusion — mais c'est un socle réel, testé et
extensible, pas une maquette.

**Guide utilisateur v1 :** [docs/GUIDE_UTILISATEUR.md](docs/GUIDE_UTILISATEUR.md)

---

## Workflows (mode 2D)

| # | Workflow | Où | État |
|---|----------|-----|------|
| 1 | **Import** PDF / image / scan | Panel → Import | ✅ |
| 2 | **Visualisation 2D** annotée (contours, trous) | Viewport central | ✅ |
| 3 | **Assistant** : questions sur le dessin | Panel → Assistant | ✅ |

Le viewport 3D, les primitives CAO, l'export mesh et l'analyse ingénierie sont **désactivés** le temps du focus 2D.

---

## Architecture

```
Frontend (React) — viewport 2D + panel import
        │  HTTP /api
        ▼
Backend FastAPI (Python)
        ├── vision/   Analyse de dessins (OpenCV + PyMuPDF)
        └── ai/       Agent IA (optionnel, pour l'assistant)
```

---

## Démarrage rapide (Windows)

Prérequis : **Python 3.11+** et **Node.js 18+**.

```bat
setup.bat   :: installe backend (venv) + frontend
start.bat   :: lance les deux serveurs et ouvre le navigateur
```

Puis ouvrez **http://localhost:5173**.

### macOS / Linux

```bash
./setup.sh
./start.sh
```

---

## Interface v1

```
┌──────────────────────────────────────────────────────────────┐
│ Header : fichier · undo · primitives · export · chat         │
├──────────────────────────────────────────────────────────────┤
│                      Viewport 3D                             │
└──────────────────────────────────────────────────────────────┘
                                     │ Panel IA (slide droite) │
```

### Header (actions)

| Icône | Action |
|-------|--------|
| Document + | Nouveau document |
| Dossier ↑ | Ouvrir `.forma.json` |
| Disquette | Sauvegarde rapide (autosave) |
| Undo / Redo | Annuler / rétablir |
| Boîte / Cylindre / Trou | Création manuelle |
| Télécharger | Export STL/OBJ/3MF/GLB/PLY |
| Dossier ↓ | Enregistrer le projet |
| Chat | Ouvrir le panel IA |
| Paramètres | Matériau, LLM, exemples |

---

## Agent IA : avec ou sans LLM

L'agent fonctionne **sans aucune clé API** grâce à un moteur de règles
déterministe. Pour activer un **LLM** (dont **Grok / xAI** en local) :

```bash
cd backend
cp .env.example .env
# Éditer .env et coller votre clé :
#   XAI_API_KEY=xai-...
#   FORMA_LLM_PROVIDER=xai
pip install -r requirements.txt
pip install -r requirements-cad.txt
```

- **`@Modelling` + image** → Grok vision lit le plan et génère le modèle 3D (`/api/agent`)
- Modèle **vide** (texte seul) → génération par règles (`/api/text-to-cad`)
- Modèle **existant** → modifications (`/api/agent`)

Dans le panel IA, choisir le modèle **Grok** ou **Auto** (avec `XAI_API_KEY`, Auto utilise Grok).

---

## Charte graphique

Palette **gris semi-foncé** unifiée (header, panneaux, viewport) :

| Rôle | Hex |
|------|-----|
| Fond principal | `#242424` |
| Header & panneaux | `#2e2e2e` |
| Surfaces / cartes | `#383838` |
| Bordures | `#4a4a4a` → `#5a5a5a` |
| Texte | `#d4d4d4` / `#909090` |
| Accent / actions | `#a8a8a8` → `#787878` |

---

## Stack technique

**Backend** : FastAPI · trimesh · shapely · manifold3d · scipy · OpenCV · PyMuPDF
**Frontend** : React · TypeScript · Vite · Three.js (react-three-fiber + drei) · Tailwind · Zustand

---

## Limites & v1.1

- **Export 2D / plans** (3D → dessin) : prévu v1.1
- **Congés / chanfreins** : approximés (pas de B-Rep réel)
- **OCR des cotes** : prochaine étape sur l'import
- **STEP B-Rep** : via CadQuery optionnel

---

## Structure

```
autocad/
├── backend/app/
│   ├── main.py            FastAPI
│   ├── api/routes.py      endpoints
│   ├── engine/            noyau géométrique + export
│   ├── ai/                agent, text-to-cad, analyse, LLM
│   └── vision/            analyse de dessins
├── frontend/src/
│   ├── App.tsx            layout shell
│   ├── components/
│   │   ├── Toolbar.tsx    header
│   │   ├── Viewport.tsx   3D
│   │   ├── ChatPanel.tsx  panel IA (Assistant / 2D-3D / Ingénierie)
│   │   └── StatusBar.tsx  dimensions & alertes
│   └── store/useStore.ts  état global
├── docs/GUIDE_UTILISATEUR.md
├── setup.bat / start.bat
└── setup.sh  / start.sh
```
