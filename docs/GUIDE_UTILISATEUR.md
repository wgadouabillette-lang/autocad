# Guide utilisateur Hall v1

## Démarrer

1. Lancer `setup.bat` puis `start.bat` (Windows) ou `./setup.sh` puis `./start.sh` (macOS/Linux).
2. Ouvrir **http://localhost:5173**.
3. Si une sauvegarde automatique existe, choisir **Reprendre** ou **Nouvelle session**.

## Interface

```
┌─────────────────────────────────────────────────────────────┐
│ Header : fichier · undo · primitives · export · chat        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Viewport 3D                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                                    │ Panel IA (slide droite) │
```

## Créer une pièce manuellement

1. Cliquer **Boîte**, **Cylindre** ou **Trou** dans la header.
2. La pièce apparaît dans le viewport 3D.
3. Pour modifier les paramètres, utiliser l'assistant IA ou réimporter depuis un projet.

## Utiliser l'assistant IA

1. Cliquer l'icône **chat** (header droite).
2. Mode **Assistant** dans la capsule en bas du panel.
3. Modèle vide → génération complète (text-to-CAD).
4. Modèle existant → modifications (agent).

Exemples : « Crée une bride Ø120 avec 6 trous M8 », « Passe l'épaisseur à 12 mm ».

## Importer une pièce 3D déjà faite

1. Panneau gauche → onglet **Éléments**.
2. **Importer une pièce 3D** et choisir un fichier mesh.
3. Hallts acceptés : **STL, OBJ, PLY, OFF, GLB, GLTF, 3MF** (unités supposées en mm).

C’est le format le plus courant quand une pièce vient d’un autre logiciel (SolidWorks, Fusion 360, FreeCAD, Onshape, imprimante 3D, etc.) : on **exporte en STL ou OBJ**, puis on l’ouvre ici.

**STEP / IGES** (fichiers « CAO pro » natifs) : pas encore en import direct — exportez d’abord en STL depuis votre logiciel source.

**Projet Hall** : fichier `.forma.json` (historique paramétrique + chat) via enregistrement / ouverture projet.

## Importer un dessin 2D

1. Ouvrir le panel IA.
2. Choisir le mode **2D-3D** dans la capsule.
3. Déposer un PDF ou une image.
4. Cliquer **Analyser & convertir en 3D**.

## Analyse ingénierie

1. Panel IA → mode **Ingénierie**.
2. Renseigner charge et paroi minimale.
3. Lancer l'analyse pour obtenir score d'imprimabilité et estimation de contrainte.

## Sauvegarder et exporter

| Action | Bouton | Résultat |
|--------|--------|----------|
| Sauvegarde rapide | Disquette | `localStorage` (autosave) |
| Enregistrer projet | Dossier ↓ | Fichier `.forma.json` |
| Ouvrir projet | Dossier ↑ | Charge un `.forma.json` |
| Exporter 3D | Télécharger | STL, OBJ, 3MF, GLB, PLY |
| Nouveau document | Document + | Réinitialise le projet |

## Raccourcis header

- **Annuler / Rétablir** : historique des modifications du modèle.
- **Paramètres** : matériau, statut LLM, exemples de pièces.

## v1.1 prévu

- **Export 2D / plans techniques** (3D → dessin) — pipeline à concevoir côté backend.
- OCR des cotes sur import.
- Export STEP B-Rep exact (CadQuery optionnel).
