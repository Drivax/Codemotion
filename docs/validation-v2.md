# Validation CodeMotion V2

Validation locale Windows / Chromium, finalisée le 13 octobre 2026. Aucun commit, push ou PR. Le projet RL a été lu pour l’analyse AST ; aucun de ses scripts ni dépendances n’a été exécuté/installé.

## Vérifications

| Commande / contrôle | Résultat |
| --- | --- |
| `.venv/Scripts/python.exe -m ruff check backend scripts` | OK |
| `.venv/Scripts/python.exe -m mypy backend/app` | OK, 16 fichiers |
| `.venv/Scripts/python.exe -m pytest -q` | 57 réussis, 1 ignoré (création de symlink indisponible sous Windows) |
| `npm.cmd --prefix frontend run test` | 14 réussis, 4 fichiers |
| `npm.cmd --prefix frontend run typecheck` / TypeScript du build | OK |
| `npm.cmd --prefix frontend run lint` | OK |
| `npm.cmd --prefix frontend run build` | Build production OK |
| `npm.cmd --prefix frontend run test:e2e` | 7 parcours généraux réussis |
| `npm.cmd --prefix frontend run test:e2e -- --grep "real project snapshot"` | Parcours réel supplémentaire réussi, 5 exports vérifiés |
| Reprise ciblée après ajustement responsive | Recherche/clavier/mobile et scénario réel réussis |
| Lanceur sur port occupé | Refus explicite, aucun processus arrêté |
| Ctrl+C puis relancement | API arrêtée, ports 3000/8000 libérés, nouveau lancement réussi |

La suite comprend désormais 8 scénarios navigateur ; le scénario réel est ignoré si son snapshot optionnel n’est pas installé. Pour le préparer : `.venv/Scripts/python.exe scripts/validate_real_project.py` avec l’API démarrée et le dossier RL présent.

Les tests couvrent l’import, classes/source, lecture hors ligne déjà chargée, branches et boucles explicites, navigation interfonction, inspection sans déplacement du lecteur, session restaurée, liens directs, snapshot manquant, réponse réseau tardive, recherche clavier, références et petit écran. Le backend vérifie notamment ambiguïtés d’alias appelables, deux définitions atteignantes, coordonnées UTF-16, agrégation des preuves, pagination au-delà de 5 000 nœuds, archives invalides/éviction et comparaison de versions.

Avertissements non bloquants : dépréciation Starlette/AnyIO et futur chargeur natif de configuration Vite. Un chargement Monaco transitoire observé pendant des redémarrages a disparu après rechargement ; les parcours source sur le build de production passent.

## Projet réel

`Dynamic-Credit-Limit-Optimization-with-RL-`, snapshot `8e409ee6ccd42af6faf8dbd6` : 123 fichiers, 34 994 nœuds, 103 224 relations. Import initial mesuré : 19,76 s ; analyse : 13,02 s. Détail dans [validation-v2.json](validation-v2.json). Ces mesures sont ponctuelles sur cette machine, pas un benchmark universel.

Vérification interactive : groupes du projet, recherche `CreditLimitEnv.step`, ouverture directe du flux (39 opérations), branche `self._done`, choix False, suivi de `decision_pd`, liaison au paramètre de `calculate_reward`, ouverture de cette fonction et de ses appelants, retour à l’étape 9, sauvegarde et restauration après rechargement. La session nommée `CreditLimitEnv.step — decision_pd` a été enregistrée dans le navigateur de validation.

Export réel : signatures PNG/SVG, JSON de snapshot, Mermaid et Markdown contenant `decision_pd` vérifiés dans le test. Les exemples sont conservés dans [exports](exports/). L’export PNG/SVG est un rendu simplifié, pas une capture du site.

## Captures inspectées

- [Flux réel sombre](v2-real-flow-dark.png) : étape `decision_pd`, inspecteur et source synchronisée.
- [Flux réel clair](v2-real-flow-light.png).
- [Écran étroit clair](v2-mobile-light.png) : commandes accessibles, tiroirs indépendants, graphe recentré.
- [Graphe simple et inspecteur](object-inspector.png).
- [Lecteur sur exemple](data-flow-player.png).

Les captures ont permis de corriger deux problèmes réels : tiroirs superposés au redimensionnement et commandes mobiles rognées. La version finale conserve un défilement horizontal du code source, normal pour les lignes longues.

## Limites et périmètre

L’analyse reste statique et partielle. La traduction complète, les références sur tous les tokens de déclaration, la sélection multiple d’export, la virtualisation intégrale et la validation Linux/macOS ne sont pas livrées. Les heuristiques d’impact/tests/cycles n’offrent pas une preuve runtime. Voir [limitations.md](limitations.md) pour les budgets et les limites précises, et [exploration-v2.md](exploration-v2.md) pour les API/formats.
