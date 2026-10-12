# Data Flow Player

Le mode est nommé **Static Flow**. Il montre des dépendances et chemins possibles, jamais une trace d’exécution réelle.

La lecture suit uniquement les liens de contrôle. Les dépendances de données alimentent l’inspection et l’animation ; elles ne déterminent pas l’ordre des étapes. Le lecteur maintient une liste de nœuds visités et un index, ce qui rend précédent/suivant et le slider réversibles.

Une bifurcation arrête la lecture. Le choix True/False est hypothétique, sans évaluation de condition. Une boucle propose Body (symbolic) et Exit. Après le retour du corps, un nouveau choix explicite est requis : aucun nombre d’itérations n’est inventé. Le bouton de fin avance jusqu’à la prochaine décision ou la sortie, et ne franchit pas une branche inconnue.

Un clic direct sur un nœud commence une exploration à ce nœud ; le bouton Reset revient à l’entrée. Le panneau symbolique reflète les définitions visitées, leur expression et éventuellement le littéral à la définition. Ce n’est pas un état mémoire. La lecture est limitée à 2 000 étapes dans un parcours.

Les appels identifiés proposent l’inspecteur du symbole et, pour une fonction/méthode interne, Enter flow. Les appels candidats restent signalés comme tels. Retour restaure le flux appelant et son étape. L’historique borne les ouvertures de flux à huit, empêchant une expansion récursive illimitée.

Play/Pause, début, précédent/suivant, progression, vitesse 0.5×/1×/2×, reset. Espace et flèches gauche/droite lorsque le focus n’est pas dans un contrôle de saisie. Les animations suivent `prefers-reduced-motion`. Une fois le graphe et la source chargés, les commandes de lecture restent entièrement locales.
