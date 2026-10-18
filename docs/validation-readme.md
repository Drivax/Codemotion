# Navigation documentaire — validation du 18 octobre 2026

Implémentation locale, sans commit, push ou PR. Les changements préexistants ont été conservés.

## Résultat

Le README et les fichiers Markdown sont conservés dans le snapshot. La vue Comprendre le projet présente un sommaire, une recherche, des liens locaux et des mentions de symboles interactives. Les cibles ambiguës demandent un choix ; les liens absents ou interdits restent visibles. Documentation du symbole retrouve les mentions du symbole sélectionné. Le contexte documentaire est conservé pendant les allers-retours vers le code.

Les guides sont générés à partir d’une section, puis personnalisables (ajout explicite, retrait, remontée d’étape, duplication). Ils sont nommés et sauvegardés par snapshot avec leur position de reprise. Les sauvegardes de Sessions les incluent. L’historique restaure source, sélection, étape, filtres et cadrage du graphe.

## Vérifications exécutées

- Ruff et mypy : succès, 17 fichiers Python typés.
- Pytest : 79 tests réussis, 1 ignoré (liens symboliques Windows).
- TypeScript et ESLint : succès.
- Vitest : 31 tests réussis, 7 fichiers.
- Next.js : build de production réussi.
- Playwright : 16 scénarios réussis dans une exécution complète. Les 2 scénarios documentaires ont également été rejoués avec succès après le dernier ajout du chargement à la demande.
- `git diff --check` : succès ; avertissements LF/CRLF uniquement.

Les tests couvrent import Markdown et gitignore, absence de parsing Python des documents, ancres et lignes, symboles ambigus, liens mal formés/interdits, budgets, architecture sans faux modules Markdown, priorité d’un document hors budget initial, persistance et validation des guides, reprise après rechargement, retour au cadrage précédent et navigation mobile.

## Projet RL réel

Import en lecture seule de Dynamic-Credit-Limit-Optimization-with-RL-, sans exécuter son code ni modifier le dépôt. Le nouveau snapshot `e460fb3e9ea1f9637f9223b5` contient ses sources et sa documentation. L’index initial a fourni 20 documents, 143 sections et 204 références, dont 73 reliées à des fichiers, symboles ou dossiers. Cet index est partiel : les budgets sont signalés, et le sélecteur permet de prioriser à la demande les autres documents archivés. La hiérarchie Python répond normalement.

Les mesures sont conservées dans [validation-readme-real.json](validation-readme-real.json). Le hash correspond à l’état local importé, sans révision Git distante revendiquée.

## Captures inspectées

- [README interactif](readme-navigation.png)
- [Vue mobile](readme-navigation-mobile.png)

## Limites

Markdown simplifié, sans interprétation active du HTML ni chargement d’images distantes. Pas de tableau riche, de liens de référence ou d’ancres HTML complets. Les commandes ouvrent des fichiers : elles ne sont pas exécutées. Les mentions ne prouvent pas des appels ; les guides ne sont pas des traces d’exécution. Un fichier non importé peut apparaître absent alors qu’il existe dans le dépôt. Les anciens snapshots nécessitent un nouvel import pour récupérer leur Markdown.
