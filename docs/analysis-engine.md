# Moteur d’analyse

## Symboles et résolution

L’AST natif conserve les lignes/colonnes, signatures, annotations et docstrings. Chaque portée possède une table de définitions ; les corps des fonctions/classes imbriquées sont analysés séparément. Les mêmes noms dans deux modules gardent des IDs distincts.

Les imports directs, alias, relatifs et une disposition `src/` sont pris en charge. Les usages détectés sont distingués des déclarations. Les dépendances absentes du dépôt sont externes ; un nom interne introuvable est indéterminé. Les méthodes cherchent les noms nus dans leur portée lexicale et non dans la namespace de classe.

Les appels gardent chaque site source. Les relations de résumé ne remplacent pas ces sites. Les alias de fonctions et types locaux sont sensibles à la portée mais pas au chemin ; ils restent candidats. Une annotation est seulement un indice. Les attributs construits via `self.engine = Engine()` donnent un type candidat pour `self.engine.start()` : une mutation ultérieure est possible.

Les affectations et paramètres qui masquent un nom global empêchent une résolution certaine incorrecte. Les bases multiples sont conservées ; plusieurs méthodes héritées donnent des candidats. Une récursion forme une arête cyclique, pas un développement récursif.

## Contrôle et données

Construction du CFG à partir des instructions AST, en reliant les blocs à leur continuation. `if` crée deux sorties nommées et une jonction. `for`/`while` créent une entrée, un corps, un retour et une sortie ; `break` et `continue` ciblent les destinations correspondantes. `return`/`raise` terminent le chemin. Les opérations inaccessibles après une terminaison sont retirées du CFG.

Un calcul itératif des définitions atteignantes propage, pour chaque variable, un ensemble de définitions. Une affectation remplace ses définitions sortantes ; ses lectures utilisent les définitions entrantes. Les jonctions réunissent les ensembles. Le point fixe conserve les dépendances portées par une boucle. `x = x + 1` lit l’ancienne définition avant de produire sa nouvelle version.

Le modèle n’est pas une SSA complète. Il n’évalue aucune expression, annotation ou constante calculée et n’interprète pas les valeurs. Les liens de contrôle et de données restent distincts dans l’API et le canvas.

`READS`, `WRITES`, `RETURNS` et `ACCESSES_ATTRIBUTE` relient les opérations aux symboles identifiés. `PASSES_ARGUMENT` conserve l’expression associée aux paramètres identifiables ; `*args` rend la correspondance candidate. Aucune valeur calculée n’est propagée dans un appel. Le frontend peut ouvrir le graphe du callee, avec historique et limite de profondeur.

L’`ExplanationProvider` produit des phrases déterministes à partir des catégories d’opérations. Il n’appelle aucun modèle génératif.

Les constructions opaques et limites atteintes produisent des diagnostics. Une syntaxe invalide dans un fichier n’empêche pas l’analyse des autres. La sérialisation d’export trie les éléments et exclut les métriques variables ; voir les tests de stabilité et d’absence d’arêtes pendantes.
