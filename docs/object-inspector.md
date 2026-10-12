# Object Inspector

L’explorateur liste les fichiers et symboles dans l’ordre source. La sélection ouvre les métadonnées, membres, attributs, signatures, décorateurs et relations du backend. Les boutons de membre, le graphe et le code source partagent cette sélection.

Le canvas affiche initialement classes et fonctions pour limiter la densité. Une méthode sélectionnée est aussi visible. Le menu de filtres permet modules, méthodes, dépendances externes, inconnus et types de liens. Le focus conserve les voisins directs et est activé automatiquement pour les grands projets. Un plafond initial de 60 nœuds se relève par groupes de 60 ; le graphe chargé est plafonné à 5 000 symboles.

Dagre fournit la disposition. React Flow gère le déplacement, le zoom, le fit et la minimap. Les couleurs sont complétées par des libellés et traits pleins/pointillés. Une arête candidate reste explicitement nommée candidate. Un clic sur une relation ouvre son statut et sa provenance ; un clic sur sa cible ouvre son inspecteur.

Monaco est distribué depuis `frontend/public/monaco`, copié lors de l’installation. Aucun CDN n’est requis à l’usage. Cliquer dans une ligne choisit le plus petit symbole déclaré contenant cette ligne : ce n’est pas un serveur de langage résolvant tous les mots sous le curseur.

Les panneaux se redimensionnent par glissement des séparateurs. Les contrôles possèdent des noms accessibles ; navigation du lecteur au clavier possible hors champs/boutons/éditeur. L’interface vise les écrans desktop. Les positions déplacées restent dans le canvas courant mais ne sont pas persistées entre sessions ou reconstructions du sous-graphe.

