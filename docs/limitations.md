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

- Dossiers importés via `webkitdirectory`, lus en UTF-8. Les encodages historiques locaux nécessitent une conversion ; le chargeur GitHub détecte l’encodage Python.
- `.gitignore` utilise pathspec ; les réinclusions complexes ne reproduisent pas tous les cas de Git.
- GitHub public uniquement, branche/tag/SHA résolu et téléchargement épinglé au SHA. Réanalyser recalcule le snapshot actuel ; réimporter pour récupérer une nouvelle révision distante.
- Archive `.codemotion/snapshots` limitée à 256 MB de JSON, éviction des fichiers les plus anciens. Les sources importées y sont conservées. Suppression possible dans Sessions.
- Cache de jobs limité à six analyses et 80 MB sérialisés ; restauration disque limitée à deux analyses, index de requêtes limité à deux snapshots. Ces budgets ne plafonnent pas la mémoire Python résidente.
- Timeout/annulation terminent le worker. Pas de limite mémoire OS stricte. Les requêtes de lecture sont bornées ; annuler leur requête navigateur ne termine pas un calcul serveur déjà engagé.
- Sessions navigateur : au plus 30, stockage local soumis au quota du navigateur. Un lien local exige le même snapshot installé et un moteur compatible ; il ne transporte pas les sources.

## Interface et analyse complémentaire

- Chaque vue réseau charge un sous-graphe : 60 nœuds initialement, jusqu’à 1 000 par requête de voisinage. La recherche couvre tout le snapshot ; la troncature est signalée. Pas de virtualisation complète de toutes les métadonnées de l’arbre.
- Navigation sémantique conservatrice des usages `Name`/`Attribute`. Certains tokens de déclaration et paramètres n’ont pas de référence dédiée ; l’arbre et la recherche permettent d’ouvrir leur définition.
- Les définitions atteignantes du graphe sont statiques ; les versions montrées par le lecteur suivent le parcours choisi. Pas de propagation complète des alias/valeurs/mutations runtime.
- 8 appels imbriqués, 2 000 étapes de parcours, 40 positions d’historique. Les boucles sont des choix hypothétiques explicites.
- Chemins : profondeur maximale 12, 100 résultats, 10 000 états explorés. Impact : profondeur maximale 8 et 1 000 résultats ; tests liés identifiés par noms de fichiers, sans preuve de couverture.
- Cycles d’imports observés sans classification spécifique de `TYPE_CHECKING`. Les alertes de taille/couplage et symboles potentiellement inutilisés sont heuristiques, pas des défauts certains.
- Comparaison par fichier, nom qualifié et type de symbole ; renommages/déplacements apparaissent comme suppression/ajout. Les impacts affichés du diff sont bornés.
- PNG/SVG sont des rendus simplifiés avec positions et métadonnées, pas des captures pixel-identiques du canvas. PNG limité à 8 192 pixels par côté et 32 mégapixels. Export de la vue ou du seul nœud sélectionné ; pas de sélection multiple arbitraire.
- Interface mixte français/anglais : pas de sélecteur bilingue complet. La navigation clavier native/dialogues est vérifiée, sans audit exhaustif de lecteur d’écran.
- Validation observée sur Windows/Chromium ; Linux/macOS non exécutés dans cette session.

Priorités restantes : CFG des exceptions, MRO/réexports, alias et bindings sensibles au chemin, références sur tous les tokens de déclaration, virtualisation complète, traduction intégrale et validation multiplateforme.
