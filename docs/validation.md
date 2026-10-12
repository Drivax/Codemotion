# Rapport de validation — 12 octobre 2026

Travail réalisé dans le dépôt local CodeMotion. Aucun commit distant, push ou pull request. Le dépôt de validation RL a été lu sans modification ; le navigateur a importé une copie des fichiers retenus dans le répertoire temporaire ignoré `work/` de CodeMotion.

## Contrôles réellement exécutés

| Contrôle | Résultat |
|---|---|
| Pytest backend | **44 tests passants** |
| Ruff, backend et scripts | passant |
| mypy | passant, 13 fichiers source |
| TypeScript strict | passant |
| ESLint TypeScript et hooks React | passant |
| Vitest / React Testing Library | **8 tests passants** |
| Next.js build de production | passant |
| Playwright / Chromium | **3 scénarios passants**, backend réel |
| npm audit, toutes dépendances | **0 vulnérabilité signalée** |
| npm audit, production seulement | **0 vulnérabilité signalée** |
| Cohérence des graphes | aucune arête pendante sur les exemples et le benchmark réel |

Environnement observé : Windows, Python 3.12.14, Node.js 24.18.0, Chromium fourni par Playwright 1.64.0. La CI Linux est configurée mais n’a pas été exécutée sur GitHub. Aucun test macOS n’est revendiqué.

Avertissements non bloquants observés : dépréciation de l’alias BlockingPortal dans les dépendances de TestClient, futur changement du chargeur de configuration Vite, variables NO_COLOR/FORCE_COLOR dans Playwright. Ils ne sont pas masqués.

## Parcours E2E

1. Import réel de `examples/object-oriented`, sélection de Car, lecture des attributs, vérification des nœuds/arêtes visibles et de Monaco, ouverture de drive, pas avant/arrière, play/pause et retour à l’inspecteur. Les requêtes API sont volontairement coupées après chargement du flux pour vérifier la lecture locale.
2. Import réel de `branching`, arrêt obligatoire au choix True/False ; import de `loops`, choix d’une itération symbolique, retour au nœud de boucle et sortie explicite.
3. Exemple multi-module, ouverture de process, navigation dans normalize puis retour au flux appelant.

Les captures `object-inspector.png` et `data-flow-player.png` proviennent de ces parcours. Les nœuds sont réellement affichés : une première capture vide avait révélé un défaut de conservation des dimensions React Flow, corrigé avec une assertion de visibilité supplémentaire.

## Import GitHub réel

Dépôt : `https://github.com/pallets/itsdangerous`.
Révision observée : `672971d66a2ef9f85151e53283113f33d642dabd`.
Téléchargement HTTPS, validation de l’archive et analyse de **15 fichiers Python** réussis. Le source n’a pas été exécuté. L’import a été testé avant la dernière correction interne du rattachement des appels ; le pipeline réseau n’a pas changé ensuite.

## Mesures du moteur

Mesures d’un passage, sans cache de résultat, après les dernières corrections. `discovery_ms` correspond au filtrage/chargement de la collection de contenus en mémoire, pas à toute l’énumération disque. Le temps de sérialisation JSON et de transport n’est pas inclus dans `total_ms`.

| Cas | Fichiers | Analyse | Nœuds | Arêtes | JSON complet |
|---|---:|---:|---:|---:|---:|
| Synthétique 10 | 10 | 12 ms | 111 | 240 | 0,14 MB |
| Synthétique 100 | 100 | 121 ms | 1 101 | 2 400 | 1,38 MB |
| Synthétique 500 | 500 | 629 ms | 5 501 | 12 000 | 6,91 MB |
| Projet RL réel | 123 | 11,69 s | 34 994 | 103 224 | 57,04 MB |

Le cas réel détecte **78 classes**, **681 fonctions/méthodes**, 12 448 sites d’appels, dont 1 760 résolus et 238 candidats ; aucune erreur de parsing. Les autres appels restent externes ou indéterminés. Les fichiers de tests présents dans le dépôt font partie de cette mesure. Les résultats ne signifient pas une compréhension exhaustive du projet.

Voir `benchmarks.json` pour les durées de chaque phase et les hashes exacts des snapshots.

## Affichage navigateur

Mesure avec serveurs locaux de développement, cache backend initialement vide. Durée depuis l’envoi du dossier jusqu’à visibilité du nœud sélectionné, incluant transport, analyse en processus, sérialisation, réponses API et disposition. La seconde mesure part de la dernière réponse de métadonnées de symboles : elle ne constitue pas un benchmark pur de React.

| Cas | Import → nœud visible | Dernière réponse symboles → visible | Nœuds affichés initialement |
|---|---:|---:|---:|
| 10 fichiers | 1,58 s | 670 ms | 10 |
| 100 fichiers | 1,45 s | 486 ms | 1 |
| 500 fichiers | 4,43 s | 1 741 ms | 1 |
| Projet RL | 19,09 s | 1 041 ms | 3 |

Le focus automatique des grands projets réduit volontairement le sous-graphe initial ; on peut le désactiver. Aucun pageerror JavaScript observé sur ces quatre imports. Ces mesures ont été capturées avant la dernière correction du rattachement des appels synthétiques, sans modification ultérieure du rendu. Voir `browser-benchmarks.json`.

Le graphe complet n’est pas intégralement rendu : la limitation de nœuds et le focus sont nécessaires à la lisibilité. Les durées sont propres à cette machine et à ce passage ; aucune garantie universelle de performance n’en est déduite.

## Reproduire

Depuis la racine, sous Windows :

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check backend scripts
.\.venv\Scripts\python.exe -m mypy backend/app
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run test
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e
.\.venv\Scripts\python.exe scripts/benchmark.py
```

Le lanceur global est `.venv\Scripts\python.exe scripts/check.py --e2e`.
Le benchmark accepte `--repository <dossier>` et le lit uniquement. Les instructions multiplateformes et l’installation des navigateurs de test figurent dans le README.

## Périmètre livré et suite

Les trois phases existent : moteur/API, Object Inspector et Data Flow Player. Les fonctionnalités principales sont raccordées à de vraies données source. Scripts d’installation/lancement/test, exemples, schéma, CI, captures et documentation sont présents.

Les limites fonctionnelles et les fonctionnalités restantes sont détaillées dans `limitations.md` : CFG des exceptions/context managers/match, résolution dynamique/alias/MRO/réexports, navigation sémantique Monaco, encodages locaux historiques, persistance et très grands graphes. Il s’agit d’une V1 d’analyse statique explicite, pas d’une implémentation complète de toutes les sémantiques Python.

## Inspection du projet réel dans l’interface

La classe `CreditLimitEnv` a été ouverte dans l’Object Inspector : 11 méthodes et 19 attributs observés. Sa méthode `step` a été ouverte dans le Data Flow Player : **39 opérations**, **43 liens de contrôle** et **71 dépendances de données**. Le lecteur s’arrête bien sur la condition `self._done` et propose True/False sans choisir automatiquement.

La capture `real-repository.png` et les métadonnées `real-validation.json` proviennent de ce parcours réel, après la dernière correction du moteur. La présence d’un CFG sans diagnostic local sur cette méthode ne garantit pas une résolution complète de tous ses appels ou effets externes.
