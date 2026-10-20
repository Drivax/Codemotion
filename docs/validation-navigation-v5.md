# Navigation intégrée et reprise — 20 octobre 2026

Travail local sans commit, push ni PR. Les fichiers sources des projets analysés ne sont pas exécutés.

## Fonctionnalités

- Comprendre est une vue intégrée : documentation à gauche, aperçu à droite. Sur mobile, les panneaux sont empilés sans chevauchement ; le clic sur une référence conduit à l’aperçu, avec retour vers la documentation.
- Reprise explicite du dernier espace : onglets (12), récents (30), mode, panneaux, tailles, filtres, pile active et cadrage. Sauvegarde après 600 ms sans changement, sur pagehide et lors du passage en arrière-plan. Les sessions nommées incluent les nouveaux champs.
- Relations et chemins statiques entre étapes : recherche déclenchée explicitement, au plus 5 chemins de profondeur 6. Les fonctions intermédiaires ouvrent l’aperçu. Le guide n’est pas modifié par cette exploration.
- Migrations : nom du projet et date d’enregistrement local, anciens et nouveaux extraits côte à côte, choix puis validation séparée pour chaque cible. L’original est conservé.
- Recherche indexée une fois par snapshot ; index des membres du graphe au lieu d’un balayage global pour chaque carte ; aperçus bornés et cache de 40 extraits ; absence de rendu du graphe masqué.

## Validation

- 81 tests backend réussis, 1 ignoré ; Ruff et mypy réussis.
- 34 tests frontend réussis ; ESLint, TypeScript et build Next.js de production réussis.
- Suite complète finale : 20 scénarios navigateur réussis, dont le snapshot RL, migration, sauvegarde/export, reprise, fonctions intermédiaires et mobile.
- Une exécution intermédiaire a rencontré une erreur de rechargement à chaud Monaco pendant des modifications. La suite finale sur fichiers stabilisés passe entièrement.
- Captures inspectées : navigation-v5-understand.png et navigation-v5-mobile.png.

## Mesures sur RL

Snapshot : `e460fb3e9ea1f9637f9223b5b8511fa2a7c455694d28e7d31de8290199e4de46` ; 35790 symboles.
Mesures de calculs JS isolés, médiane de 15 passages après échauffement :

| Calcul | Avant | Après |
| --- | ---: | ---: |
| Recherche | 3.139 ms | 0.098 ms |
| Membres de 60 cartes | 53.765 ms | 0.003 ms |

L’index est préparé une fois ; sa construction est exclue des mesures répétées. Ces chiffres ne mesurent pas le réseau, le rendu complet ou Dagre et ne doivent pas être présentés comme une accélération globale équivalente. Le benchmark est reproductible avec `node scripts/benchmark-navigation.mjs` si l’archive locale RL est disponible.

Exemple de volume : fichier `src/credit_rl/envs/credit_limit_env.py` de 13906 octets ; ses 30 premières lignes représentent 1271 octets, hors enveloppe JSON. La taille réelle dépend de l’extrait.

Mesure navigateur ponctuelle (Chromium, serveur de développement, pas de référence avant/après) : chargement 616 ms, recherche 131 ms, aperçu 365 ms, ouverture du flux 542 ms. Les fichiers JSON conservent les résultats détaillés.

## Limites

La reprise conserve un dernier espace par navigateur, au plus 4 Mo. Elle dépend du snapshot local et ne garantit pas une sauvegarde si le processus est tué avant l’écriture ; les erreurs de stockage sont signalées. Elle ne sauvegarde pas les brouillons de guide ni la section documentaire exacte. Les piles individuelles des onglets inactifs restent en mémoire ; la pile active est sauvegardée. Les guides nommés ont leur propre sauvegarde persistante.

Les dates indiquent l’enregistrement local, pas le commit Git. Les comparaisons affichent des extraits de 30 lignes et 16 000 caractères maximum ; un snapshot absent est signalé. Les relations candidates restent explicitement candidates. L’absence de chemin dans les limites de recherche ne prouve pas l’absence de dépendance. Le rendu Markdown reste un sous-ensemble sans exécution de HTML.
