# Validation locale — workflow et moteur 2.1

Validation réalisée sous Windows, le 17 octobre 2026. Travail local, sans commit, push ni PR.

## Vérifications

- Ruff : succès sur backend et scripts.
- mypy : succès, 16 fichiers.
- Pytest : 72 tests réussis, 1 ignoré (test de lien symbolique Windows).
- TypeScript et ESLint : succès.
- Vitest : 28 tests réussis, 6 fichiers.
- Next.js : build de production réussi.
- Playwright / Chromium : 14 scénarios réussis dans une même exécution, dont le projet RL déjà archivé.
- `git diff --check` : succès (avertissements de conversion LF/CRLF uniquement).

## Régressions couvertes

Les tests Python couvrent le passage par finally pour return/break/continue, le retour qui remplace un retour précédent, les handlers et else, l’ordre inverse des sorties de contextes, les captures/gardes de match, except* signalé opaque, les chaînes et cycles de réexportations et les alias de modules conditionnels. La comparaison détecte les opérations changées même lorsque leurs identifiants restent identiques, ainsi que les appelants d’une fonction supprimée.

Les tests frontend couvrent l’arrêt avant une écriture ou un appel, la reprise après arrêt, le filtrage par variable, les métadonnées de sauvegarde invalides, la fusion sans écrasement et la compatibilité de chaque frame d’appel.

Le scénario navigateur de sauvegarde enregistre une session, télécharge le JSON, efface le stockage navigateur, supprime exclusivement son snapshot de test, importe le fichier et restaure le parcours et les points d’arrêt. Il a révélé puis vérifié la correction du rechargement de la fonction déjà ouverte. Un autre scénario vérifie les fonctions modifiées, les appelants impactés et une session marquée à reconstruire.

Le lanceur Python commun au fichier Windows a démarré les deux services en production, annoncé leur disponibilité et a été arrêté avec Ctrl+C pendant les vérifications. Le double-clic graphique et l’ouverture automatique du navigateur par --open n’ont pas été automatisés.

## Captures inspectées

- [Arrêt avant un appel](workflow-v3-breakpoint.png)
- [Comparaison de versions](workflow-v3-versions.png)
- [Lecteur mobile](player-workflow-mobile.png)

## Limites conservées

Analyse exclusivement statique. Exceptions implicites regroupées à l’entrée du try ; except* opaque ; échecs d’entrée et suppression d’exception des contextes non déterminés ; protocoles des motifs non évalués. Réexportations explicites bornées à 100 passes. Compatibilité conservatrice par flux entier, sans migration automatique.

Sauvegarde locale avec sources : 120 Mo au total, 40 Mo par snapshot, 30 sessions/snapshots, 4 Mo de métadonnées ; quota du navigateur et budget disque de 256 Mo applicables. La restauration de plusieurs snapshots n’est pas transactionnelle ; les sessions ne sont fusionnées qu’après cette étape. Les conflits de moteur préservent les données déjà présentes.
