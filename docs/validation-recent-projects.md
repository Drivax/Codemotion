# Projets récents et sauvegarde visible — 22 octobre 2026

## Comportement

L’accueil propose une reprise indépendante par identifiant de snapshot, avec nom, dernière ouverture et date de sauvegarde. Deux versions portant le même nom restent distinctes. L’ancienne reprise unique reste lisible et migre après une écriture réussie. Les changements sont enregistrés avant le retour à l’accueil.

Le statut distingue les modifications en attente, l’enregistrement réussi et l’échec. Les erreurs de quota indiquent comment exporter, retirer une reprise puis réessayer. Une écriture échouée conserve les données précédentes. Retirer une reprise ne supprime ni snapshot ni session nommée.

L’export direct inclut l’état courant en mémoire sans exiger une écriture dans localStorage. Il cible uniquement le projet actif avec ses guides, parcours nommés et points d’arrêt, pour éviter qu’un ancien snapshot absent bloque un export de secours. Les reprises exportées apparaissent comme sessions « Reprise — … » lors de l’import ; leur restauration les replace dans l’accueil. L’export depuis Sessions conserve son comportement antérieur.

## Validation

- 41 tests unitaires réussis : migration, isolation, tri par ouverture, données invalides, limites et quota.
- 24 scénarios navigateur réussis, dont deux nouveaux : alternance entre projets après rechargement ; stockage plein, export des changements non enregistrés et nouvelle tentative réussie.
- ESLint, TypeScript et build Next.js réussis.
- Inspection des captures de l’accueil sur bureau et mobile, et du statut d’erreur.

## Limites explicites

30 espaces et 4 Mo de reprises au total, sans éviction automatique. Le navigateur peut imposer un quota inférieur si d’autres données occupent son stockage. La reprise nécessite que le snapshot existe encore côté serveur. L’export complet conserve ses limites existantes : 30 sessions, 4 Mo de métadonnées et 120 Mo de fichier ; un snapshot manquant ou trop volumineux peut empêcher cet export. Les données restent dans le navigateur utilisé, sauf export explicite.

## Captures

- [Accueil](recent-projects.png)
- [Accueil mobile](recent-projects-mobile.png)
- [Échec de sauvegarde](save-status-error.png)
