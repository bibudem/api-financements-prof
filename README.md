# API des financements – répertoire des professeures et professeurs

Expose les financements de recherche récents (Synchro Recherche) d'une personne
à partir de son courriel. Spécifications : `spécifications.docx`.

| Requête | Réponse |
|---|---|
| `GET /financements/{courriel}` | `{ "miseAJour": "…", "financements": [...] }`, financements triés par année de fin décroissante (liste vide si inconnu, `400` si courriel invalide) |
| `GET /financements/sante` | État du service (date de mise à jour, nombre de financements) |

`miseAJour` est la date de la dernière génération des données (`npm run generer`),
à l'heure de Montréal au format ISO 8601, par exemple `2026-10-29T16:04:03-04:00`.

| Environnement | Adresse |
|---|---|
| Local | `http://localhost:3000/financements/{courriel}` |
| Production | `https://api.bib.umontreal.ca/financements/{courriel}` |

## Démarrage

Node.js 20.12 ou plus récent.

```bash
npm install
cp .env.example .env   # adapter les chemins des fichiers
npm run generer        # fichiers Synchro -> financements.json
npm start
```

Toute la configuration est dans `.env` ; chaque variable est décrite dans
[.env.example](.env.example).

## Fonctionnement

1. **`npm run generer`** lit les fichiers Synchro et écrit `financements.json` :
   - Synchro RH (`FICHIER_SYNCHRO_RH`) : seulement les professeurs du répertoire
     (liste `TITRES_PROFESSEUR` dans `src/rh.js`), avec matricule et courriel.
     Le matricule correspond à `DF_TEAM/EMPLID` de vitrine.xml.
   - vitrine.xml : un financement est retenu si sa fin date de 5 ans ou moins
     (`ANNEES`) et qu'au moins un professeur du répertoire fait partie de l'équipe.
   - En cas d'erreur (fichier manquant, XML invalide, moins de `MIN_PROFESSEURS`
     professeurs), le `financements.json` existant n'est pas modifié.
2. **`npm start`** charge `financements.json` en mémoire, l'indexe par courriel
   et le recharge automatiquement quand il change. Il n'est pas nécessaire de
   redémarrer l'API.

Pour mettre à jour les données, déposez les nouveaux exports, puis lancez
`npm run generer`, idéalement en tâche planifiée après chaque export Synchro.
Un `*` dans un chemin (ex. `synchro_PERSONNEL_*.txt`) prend le fichier le plus récent.

## Production

Node écoute en local (`HOTE=127.0.0.1`, `URL_PUBLIQUE=https://api.bib.umontreal.ca`,
`TRUST_PROXY=loopback`). Le serveur web d'api.bib.umontreal.ca gère HTTPS et
relaie `/financements` vers Node, en conservant le préfixe.

Apache :

```apache
ProxyPreserveHost On
ProxyPass        /financements http://127.0.0.1:3000/financements
ProxyPassReverse /financements http://127.0.0.1:3000/financements
RequestHeader set X-Forwarded-Proto "https"
```

nginx :

```nginx
location /financements {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

L'API doit tourner sous un gestionnaire de processus (systemd, pm2…) pour
redémarrer automatiquement.

## Mode développement

Avec `FICHIER_SYNCHRO_RH=` (vide), aucun filtre n'est appliqué sur les professeurs,
et l'EMPLID remplace le courriel (ex. `/financements/10002393`). Ce mode ne doit
pas être utilisé en production, car il expose les matricules.
