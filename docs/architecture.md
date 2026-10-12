# Architecture et API

Le navigateur transmet exclusivement des chemins relatifs et contenus sélectionnés. Aucun endpoint ne prend un chemin serveur. L’API ne sert que les fichiers contenus dans un snapshot importé. Le backend n’importe jamais les modules du dépôt analysé.

## Pipeline

`RepositoryLoader` valide les chemins, tailles et règles d’exclusion. `ASTParser` construit les portées et symboles. `ImportResolver` relie les noms lexicaux et imports. `ClassAnalyzer` collecte les attributs et indices de type. `AnalysisEngine` assemble les sites d’appels et relations. `DataFlowAnalyzer` construit contrôle et dépendances. Les modèles Pydantic constituent le format commun ; voir `schema.json`.

Un job lance un processus Python `spawn`. Le thread superviseur surveille son résultat, l’annulation et la durée, puis termine le processus. Deux jobs peuvent fonctionner simultanément. Il n’y a ni broker, ni base de données, ni service distribué. Le code tiers n’est jamais exécuté dans ce processus : il est uniquement parsé.

Le cache contient au plus six résultats et environ 80 MB de JSON sérialisé ; les anciens résultats sont évincés. Les 50 derniers états de job sont conservés. Le redémarrage du backend vide le cache. Les IDs de snapshot sont des SHA-256 du contenu trié. Les IDs de symboles dépendent du chemin, de la portée, du nom et de la position : stables pour le même snapshot, pas à travers un déplacement de lignes.

## Routes

- `GET /api/health`
- `POST /api/repositories/import` : `{name, files: {"main.py": "..."}}` **ou** `{github_url: "https://github.com/owner/repo"}` → job, HTTP 202.
- `GET /api/jobs/{id}` ; `DELETE /api/jobs/{id}` pour annuler.
- `GET /api/repositories/{id}` : métadonnées, fichiers, diagnostics et mesures.
- `GET /api/repositories/{id}/graph?offset=0&limit=500&kind=Class&focus=...`
- `GET /api/repositories/{id}/symbols?kind=Class&offset=0&limit=500`
- `GET /api/repositories/{id}/symbols/{symbol_id}` : symbole, enfants, relations.
- `GET /api/repositories/{id}/flows/{symbol_id}`
- `GET /api/repositories/{id}/source?path=main.py`
- `GET /api/repositories/{id}/export` : JSON déterministe, sans mesures temporelles.
- `POST /api/examples/{name}` : l’un des cinq exemples fixés dans le code.

Les IDs sont des chaînes hexadécimales compatibles avec les URL. Les détails sont chargés à la demande. Les métadonnées extensibles restent un dictionnaire ; les champs centraux, localisations, opérations, relations, diagnostics et flux ont des modèles Pydantic explicites. Le frontend a ses interfaces TypeScript strictes correspondantes.

## Limites et protection

Valeurs par défaut, configurables par variables d’environnement backend :

| Variable | Défaut |
|---|---:|
| `CODEMOTION_MAX_FILES` | 2 000 |
| `CODEMOTION_MAX_FILE_BYTES` | 1 000 000 |
| `CODEMOTION_MAX_TOTAL_BYTES` | 20 000 000 |
| `CODEMOTION_MAX_DOWNLOAD_BYTES` | 25 000 000 |
| `CODEMOTION_MAX_ARCHIVE_BYTES` | 80 000 000 |
| `CODEMOTION_TIMEOUT` | 45 secondes, plus 10 secondes de démarrage du worker |
| `CODEMOTION_MAX_NODES` | 100 000 |
| `CODEMOTION_MAX_FLOW_NODES` | 2 000 par fonction |

Le frontend applique les limites d’import par défaut avant lecture. Une modification serveur de ces limites ne reconfigure pas automatiquement les limites client.

GitHub : domaines fixes `api.github.com` et `codeload.github.com`, HTTPS, aucun redirect, aucune configuration de proxy implicite, SHA validé. Archive lue en mémoire, jamais extraite sur le disque. Chemins absolus, traversées, liens symboliques, chemins dupliqués, tailles excessives et ratios de compression suspects sont rejetés. Erreurs HTTP, dépôt privé/introuvable et rate limit apparaissent dans l’état du job.

CORS et validation `Origin` limités aux deux origines locales du frontend sur le port 3000. Validation `Host` contre le DNS rebinding. Taille du corps contrôlée pendant la lecture. Ce service local n’est pas conçu pour une exposition réseau multi-utilisateur ; l’isolation n’est pas une sandbox d’exécution de code, puisque l’exécution n’existe pas.

Aucun fichier temporaire d’import n’est créé. Les objets en mémoire disparaissent avec leur processus/cache. Les logs ne contiennent pas le source des fichiers.
