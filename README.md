# CodeMotion

Explorez les objets et les chemins de données d’un projet Python dans une application web locale.
CodeMotion analyse l’AST : il **n’exécute jamais le code du projet importé**. Les deux vues utilisent les mêmes symboles et positions source.

![Object Inspector — capture réelle](docs/object-inspector.png)

## Disponible dans cette version

- Import d’un dossier depuis le navigateur, avec `.gitignore` et exclusions usuelles ; import HTTPS d’un dépôt GitHub public à une révision identifiée.
- Classes, méthodes, fonctions imbriquées, paramètres, décorateurs, annotations, attributs de classe et d’instance.
- Imports internes/externes, héritage, instanciations, appels individuels et résumé des relations. Statuts `resolved`, `candidate`, `unresolved`, `external` visibles.
- **Object Inspector** : graphe déplaçable, zoom, minimap, filtres, focus, recherche, membres et relations cliquables.
- **Data Flow Player / Static Flow** : graphe de contrôle, dépendances définition–usage, versions symboliques, lecture/pause, pas précédent/suivant, vitesse et historique.
- Choix explicite des branches et d’une itération **symbolique** de boucle. Aucun résultat d’exécution ni nombre d’itérations inventé.
- Navigation dans les fonctions appelées, bornée à huit appels imbriqués, indépendamment de l’historique ; retour au contexte précédent.
- Monaco en lecture seule, distribué localement, synchronisé avec la sélection. Thèmes sombre/clair, panneaux redimensionnables, réduction des animations selon les préférences système.
- Jobs isolés annulables, limites de ressources, diagnostics par fichier, cache mémoire par contenu, snapshots persistants et exports versionnés.

## Exploration V2

- Graphes contrôle/données/combinés, filtre par variable, masquage de `self`, orientation et positions conservées.
- Arbre repliable avec révélation du symbole, favoris, recherche globale **Ctrl+K** (symboles, fichiers via leur chemin, texte et commandes).
- Inspection libre indépendante du lecteur ; retour à l’étape active et pile des appelants.
- Références sémantiques depuis Monaco (clic ou **F12**), définitions/usages et transmission des arguments.
- Packages/dossiers agrégés, voisinage entrant/sortant à profondeur réglable et limites affichées.
- Impact et preuves source, chemins entre symboles, cycles d’imports et métriques architecturales configurables.
- **Sessions** : snapshots récents sur disque, parcours nommés, restauration, renommage, suppression et comparaison.
- **Exporter** : PNG, SVG, JSON, Mermaid, Markdown du parcours et lien direct local.
- Panneaux repliables, redimensionnables et maximisables ; thèmes clair/sombre et tiroirs sur petit écran.
- Import GitHub public avec branche, tag ou SHA ; réanalyse du contenu du snapshot.

Guide des parcours, API et formats : [Exploration V2](docs/exploration-v2.md). Résultats et captures : [Validation V2](docs/validation-v2.md). Les limites restantes sont détaillées dans [limitations](docs/limitations.md).

## Installation

Prérequis : **Python 3.11+**, **Node.js 24**, npm. Internet est nécessaire pour installer les dépendances ; après installation, les dossiers locaux et les exemples fonctionnent hors ligne. Aucun compte, LLM, abonnement, Docker ou clé API.

### Windows / PowerShell

Depuis le dossier du projet :

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -e . --no-deps
npm.cmd ci --prefix frontend
node frontend/scripts/copy-monaco.mjs
.\.venv\Scripts\python.exe scripts/run.py
```

Si `python` ouvre le Microsoft Store, utilisez un Python installé (`py -3.12`, par exemple) pour la première commande. L’environnement `.venv` créé dans le dossier de travail est déjà utilisable sur la machine de développement.

### Linux / macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install -e . --no-deps
npm ci --prefix frontend
node frontend/scripts/copy-monaco.mjs
.venv/bin/python scripts/run.py
```

Ouvrir **http://127.0.0.1:3000**. Documentation API : **http://127.0.0.1:8000/docs**.
`Ctrl+C` dans le lanceur arrête les deux processus. Ils écoutent sur `127.0.0.1`.

Pour lancer séparément :

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
npm.cmd --prefix frontend run dev
```

Pour le build de production : `npm run build --prefix frontend`, puis `python scripts/run.py --production` avec le Python de `.venv`.

## Démonstration

1. Cliquer **Explore the example**, ou importer `examples/object-oriented`.
2. Sélectionner `Car` : voir `wheels`, `engine`, `speed` et l’instanciation de `Engine` observée dans `__init__`.
3. Sélectionner `drive`, puis **Explore Data Flow**.
4. Avancer vers `status = self.engine.start()`. L’appel vers `start` reste candidat : l’attribut est mutable.
5. Utiliser **Inspect Object / Function** pour revenir. L’onglet Data Flow conserve le parcours.
6. Importer `branching` et choisir `True` ou `False`. Dans `loops`, choisir **Body (symbolic)** puis **Exit**.

![Static Flow — capture réelle](docs/data-flow-player.png)

Les exemples sont de vrais fichiers Python analysés par le même moteur que vos projets. Aucun graphe JSON factice n’alimente l’application.

## Architecture

```text
backend/app/
  analysis/    chargement, AST, symboles/imports, classes, contrôle/données, graphe
  models/      schéma Pydantic versionné
  services/    processus d’analyse, annulation et cache borné
  main.py      API FastAPI et contrôle des requêtes
frontend/src/
  components/  explorateur, canvas React Flow, inspecteurs, Monaco, lecteur
  lib/         types, client API, navigation déterministe du lecteur
examples/      cinq projets Python reproductibles
tests/e2e/     parcours Playwright utilisant le backend réel
scripts/       lancement, vérifications, benchmark
docs/          architecture, limites, mesures, schéma et captures réelles
```

Stack : Python AST, FastAPI, Pydantic, pathspec, httpx ; Next.js, React, TypeScript strict, React Flow, Dagre, Monaco, Lucide. État React et transitions CSS : pas de gestionnaire global ou bibliothèque d’animation supplémentaire nécessaire à cette version.

Le moteur est indépendant de React et ne dépend d’aucune IA. La lecture d’un flux déjà chargé et de sa source fonctionne sans API ; entrer dans une fonction non mise en cache nécessite le backend.

## Vérification

```powershell
.\.venv\Scripts\python.exe scripts/check.py
cd frontend
npx playwright install chromium
cd ..
.\.venv\Scripts\python.exe scripts/check.py --e2e
```

Sous Linux/macOS, remplacer le chemin Python par `.venv/bin/python`.
Les commandes individuelles figurent dans [le rapport de validation](docs/validation.md).
La CI fournie lance Ruff, mypy, Pytest, TypeScript, ESLint, Vitest, le build Next et Playwright sans secret. Le workflow est écrit localement ; aucun push ni aucune PR n’a été effectué.

Les versions npm sont verrouillées dans `frontend/package-lock.json` ; les dépendances Python, y compris celles de développement, dans `requirements.lock`. Le script `postinstall` copie Monaco localement ; la commande explicite est fournie si les scripts npm sont désactivés.

## Exactitude et limites

Il s’agit d’une **analyse statique partielle**, pas d’un débogueur ni d’une trace d’exécution.
Les valeurs concrètes sont généralement inconnues. Un littéral affiché est le littéral à sa définition, pas une garantie de valeur ultérieure.
Les types annotés et les récepteurs inférés ne sont pas des preuves d’exécution. Les imports dynamiques, la réflexion, le monkey patching, les mutations via alias et les extensions natives restent partiellement ou totalement indéterminés.

`try`, `with` et `match` sont des opérations opaques avec diagnostic, pas des graphes de contrôle détaillés. Le moteur ne calcule pas un MRO C3 complet, n’implémente pas une SSA complète et ne propage pas de valeurs entre fonctions. La navigation interprocédurale ouvre leurs graphes statiques séparés.

Voir [les limites détaillées](docs/limitations.md), [le moteur](docs/analysis-engine.md), [la sécurité et l’API](docs/architecture.md), [l’inspecteur](docs/object-inspector.md) et [le lecteur](docs/data-flow-player.md).

## Performances et évolution

Les mesures réellement exécutées sur 10, 100, 500 fichiers synthétiques et un projet RL de 123 fichiers sont conservées dans [docs/benchmarks.json](docs/benchmarks.json). Elles dépendent du matériel et de la complexité du code ; ce ne sont pas des garanties.

Priorités suivantes : CFG détaillé des exceptions et context managers, résolution des réexportations et du MRO, inférence sensible aux chemins, exploration incrémentale au-delà de 5 000 symboles de graphe, persistance du cache et tests multi-navigateurs.

Licence MIT. Aucun dépôt utilisateur analysé n’est modifié.
