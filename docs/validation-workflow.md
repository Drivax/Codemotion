# Validation du workflow — 17 octobre 2026

Travail local dans CodeMotion. Aucun commit, push ou PR. Le projet RL a été lu via son snapshot existant ; son code n’a pas été exécuté.

## Livré

1. Pause lors de l’inspection et du changement de contexte, pile d’appels visible, retour à l’étape et aux filtres de l’appelant.
2. Voisinage à deux liens de contrôle autour de l’étape active, alternatives des branches conservées, liens secondaires atténués et cadrage après montage des cartes.
3. Suivi ordonné des variables sur le parcours choisi, séparé des possibilités statiques et des passages d’arguments.
4. Enregistrement local de parcours nommés, comparaison A/B des passages par opération et dernières définitions, restauration après rechargement.
5. Navigation source sur déclarations et paramètres, Unicode et signatures multilignes ; choix explicite entre cibles ambiguës.
6. Commandes et infobulles françaises, sélection multiple d’export, liens internes uniquement, formats PNG/SVG/JSON/Markdown/Mermaid conservés.

## Commandes et résultats

| Vérification | Résultat |
| --- | --- |
| `.venv/Scripts/python.exe -m ruff check backend scripts` | OK |
| `.venv/Scripts/python.exe -m mypy backend/app` | OK, 16 fichiers |
| `.venv/Scripts/python.exe -m pytest -q` | 58 réussis, 1 ignoré : création de symlink Windows indisponible |
| `npm.cmd --prefix frontend run test` | 23 réussis, 5 fichiers |
| `npm.cmd --prefix frontend run lint` | OK |
| `npm.cmd --prefix frontend run build` | Production et TypeScript OK |
| `npm.cmd --prefix frontend run test:e2e` puis reprises ciblées | 12 scénarios distincts validés au total |
| `git diff --check` | OK ; avertissements de conversion LF/CRLF seulement |

Les reprises ciblées ont corrigé deux défauts observés : mise en pause perturbant une case à cocher, puis lien direct dans le même onglet sans restauration. Le test final vérifie deux nœuds dans le JSON exporté, leurs liens internes et la persistance des deux parcours après rechargement.

Les nouveaux scénarios valident : pause après inspection sur un intervalle de lecture, retour d’appel avec restauration des filtres, comparaison de branches opposées, sauvegarde/restauration A/B, export multisélection, F12 sur une déclaration et un paramètre, et trois cibles d’un alias appelable sans navigation automatique.

Les scénarios préexistants restent validés : dossiers, source, lecture hors ligne, branches/boucles, appels, sessions, liens absents, réponses tardives, clavier, mobile et cinq formats d’export.

## Projet réel et captures

`CreditLimitEnv.step` : 39 opérations dans le flux complet, 5 dans le voisinage affiché de `decision_pd`. Analyse statique sur le snapshot `8e409ee6ccd42af6faf8dbd6`, contenant 123 fichiers.

- [Vue de proximité sur le projet RL](v2-real-flow-light.png)
- [Comparaison de deux parcours](parcours-comparaison.png)
- [Variable : parcours et possibilités statiques](variables-parcours.png)
- [Interface sur écran étroit](v2-mobile-light.png)

Les captures desktop et mobile ont été inspectées. Les tests utilisent Chromium sous Windows ; Linux/macOS et lecteurs d’écran ne font pas l’objet d’une certification dans cette validation.

## Limites explicites

La comparaison porte sur une même fonction d’un même snapshot, au maximum 20 variantes locales de 2 000 étapes. Elle compare des parcours hypothétiques et des définitions symboliques, pas des valeurs d’exécution. L’analyse dynamique des alias et mutations reste partielle. Les diagnostics techniques bruts et le code Python conservent leur langue d’origine. Les exports images sont des rendus simplifiés du sous-graphe sélectionné.

Voir [le guide](exploration-v2.md) pour les commandes et formats persistants, et [les limites](limitations.md) pour les budgets détaillés.
