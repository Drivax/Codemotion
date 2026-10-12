# Limites connues et travail restant

## Exactitude de l’analyse

- Pas d’exécution, d’évaluation de constantes calculées, de profils runtime ou d’interprétation Python.
- Pas de dispatch dynamique complet, réflexion, monkey patching, effets natifs ou propagation fiable des mutations via alias.
- Inférence de type sensible à la portée, non sensible au chemin. Les annotations ne garantissent pas les types runtime.
- Héritage multiple conservateur, sans algorithme complet de MRO C3 ; candidats lorsque plusieurs bases fournissent un membre.
- Réexportations de packages, imports `*`, `importlib`, modifications de `sys.path` et configurations de packaging inhabituelles peuvent rester indéterminés.
- Les appels des décorateurs, valeurs par défaut et annotations ne sont pas attribués au flux du corps de fonction ; ces expressions restent dans les métadonnées/source.
- Exceptions implicites non développées. `try`, `with`, `match` sont des opérations opaques avec continuation possible et diagnostic, pas des CFG internes détaillés.
- Lambdas, compréhensions, générateurs et ordonnancement asynchrone n’ont pas de modèle interprocédural complet. Les corps/suspensions peuvent être partiels.
- Dépendances par noms/attributs explicites, pas d’analyse heap/alias complète ; aucun calcul de valeur interprocédural.
- `*args` et `**kwargs`, signatures modifiées par décorateurs et appels dynamiques limitent le binding des arguments.
- Une relation resolved désigne une liaison statique identifiable dans le sous-ensemble traité, jamais une garantie sur tous les comportements runtime Python.
- Les schémas centraux sont typés ; les métadonnées extensibles ne sont pas un système de types complet pour Python.

## Import et limites opérationnelles

- Le sélecteur navigateur vise les dossiers desktop compatibles `webkitdirectory` (testé avec Chromium). Le frontend lit les contenus en UTF-8 ; les encodages historiques nécessitent conversion avant import local. Le téléchargement GitHub utilise la détection d’encodage Python.
- Les règles `.gitignore` usuelles et imbriquées sont appliquées avec pathspec ; les interactions complexes de réinclusion entre répertoires ignorés ne reproduisent pas tous les cas de Git.
- GitHub utilise la révision courante résolue vers un SHA. Pas de sélection de branche/tag dans l’interface, ni d’accès aux dépôts privés.
- Cache volatil, six snapshots et budget 80 MB de JSON. Les projets très riches peuvent dépasser ce budget malgré un source inférieur à 20 MB.
- Le timeout tue le worker ; aucune limite mémoire OS stricte n’est configurée. Les plafonds d’entrée/AST/graphes réduisent la charge mais ne constituent pas une garantie mémoire système.

## Interface et perspectives

- Vue initiale limitée à 60 nœuds ; graphe réseau chargé limité à 5 000 symboles. Détails et sources à la demande, sans streaming incrémental complet du graphe.
- Historique de symboles et de lecture en mémoire ; pas de sauvegarde des positions, de session, de favoris ou de cache sur disque.
- Source → graphe par plage de déclaration, pas par résolution sémantique du mot cliqué. Pas de menu de cibles ambiguës dans Monaco.
- Pas de représentation autonome de chaque package et de chaque instance runtime ; les sites d’instanciation sont des CallSite avec arête INSTANTIATES.
- Tests réels exécutés sur Windows/Chromium. Les scripts et la CI Linux sont fournis, mais l’exécution macOS/Linux n’a pas été observée dans cette session.
- La première version couvre les trois phases sur un sous-ensemble explicite. Elle ne prétend pas satisfaire une analyse exhaustive du langage.

Priorités : CFG des exceptions, MRO/réexports, bindings sensibles au chemin, graphe incrémental, encodages locaux supplémentaires, navigation sémantique dans Monaco et validation multi-plateforme.
