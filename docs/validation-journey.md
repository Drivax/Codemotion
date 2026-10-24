# Navigation commune — 24 octobre 2026

Les boutons Précédent / Suivant et le menu Historique sont communs aux trois modes.
Les visites conservent le contexte du graphe, de la fonction et de la documentation.
La position d’un guide est restaurée sans rétablir d’anciennes notes ou d’anciens brouillons.
L’historique est borné à 40 visites en mémoire et est réinitialisé au changement de projet.

Les repères nommés contiennent un nom (100 caractères), une note (2 000 caractères)
et le contexte courant. Leur maximum est de 30 par espace ; ils utilisent la sauvegarde
et l’export existants. Les anciens formats sans repères restent lisibles. Les flux sont
vérifiés à l’ouverture d’un repère.

Le dernier onglet fermé conserve son contexte dans la reprise du projet, en plus des
12 onglets ouverts. Le bouton de réouverture reste désactivé en l’absence de fermeture.

## Scénarios ajoutés

- Section README → autre document → précédent/suivant.
- Étape 1 d’un guide → étape 2 → précédent/suivant avec restauration de l’indicateur.
- Repère nommé et annoté sur une étape de flux, fermeture d’un onglet, rechargement,
  reprise et réouverture du parcours ; restauration du repère et de sa note.
- Validation et sérialisation des repères, limites des notes, index de guide et onglet fermé.

[Capture de la navigation](journey-navigation.png)

## Vérification

42 tests unitaires réussis ; ESLint et TypeScript réussis. La suite navigateur a validé
25 scénarios, puis le scénario mobile restant a été corrigé et relancé avec succès,
soit 26 scénarios validés. Le panneau source est plus compact sur mobile pour préserver
la visibilité des commandes du lecteur ; l’agrandissement du code reste disponible.

[Lecteur mobile](journey-mobile.png)

Le serveur Next.js a affiché un avertissement de sécurité sur sa version installée et
interrompu certains premiers démarrages ; les relances ont permis les vérifications.
Aucune mise à jour de dépendance n’a été effectuée dans ce lot.
