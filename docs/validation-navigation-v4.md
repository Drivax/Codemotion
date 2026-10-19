# Validation navigation et accueil — 19 octobre 2026

Travail local, sans commit, push ni PR.

## Livré

- Accueil documentaire à l’import des snapshots contenant du Markdown, quatre raccourcis et rendu des listes simples, tableaux, citations et blocs de code.
- Modes Comprendre, Explorer et Suivre un parcours ; réglages avancés du graphe repliés.
- Douze onglets de définition au maximum, contexte mémorisé par symbole, trente éléments récents, aperçu source au survol et au focus clavier (Échap ferme).
- Génération de guides depuis plusieurs sections du document, notes, progression persistante et relations statiques directes entre étapes.
- Comparaison documentaire entre snapshots locaux, suggestions de cibles par nom, choix explicite de chaque cible et copie du guide réparé sans écrasement de l’original.

## Vérifications

- Backend : 80 tests réussis, 1 ignoré ; Ruff et mypy réussis.
- Frontend : 32 tests réussis ; TypeScript et ESLint réussis.
- Navigateur : 16 scénarios réussis dans la suite complète ; le dernier a échoué sur un sélecteur de test « Fermer » devenu ambigu avec les onglets, puis a réussi après précision du sélecteur. Les 17 scénarios sont donc validés, dont le snapshot RL.
- Build Next.js de production réussi.
- Captures desktop inspectées : navigation-v4-home.png et navigation-v4-tabs.png. Le scénario documentaire mobile a également réussi.

Le nouveau scénario navigation-v4.spec.ts couvre le rendu Markdown, un guide multi-sections, une annotation conservée, la progression, la relation CALLS, l’aperçu clavier, les onglets et le déplacement main.py vers new.py avec réparation explicite. Il vérifie que l’ancien guide conserve sa note et sa progression.

## Limites

Le rendu n’est pas un moteur CommonMark complet (listes simples, pas de tables imbriquées ni d’extensions HTML). L’index documentaire reste borné et signale les comparaisons partielles. Une mention absente peut avoir été supprimée ou sortir du périmètre indexé. Les suggestions de migration utilisent les noms et ne constituent jamais une preuve d’identité. La section documentaire d’origine est conservée comme provenance ; si elle a disparu, l’ouverture le signale. Les relations affichées sont directes et orientées, avec leur statut de résolution ; aucune exécution Python n’a lieu. Onglets et récents restent en mémoire pour le snapshot courant ; guides, annotations et progression sont sauvegardés et exportables.
