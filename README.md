# API des financements – répertoire des professeures et professeurs

Expose les financements de recherche récents (Synchro Recherche) d'une personne
à partir de son courriel.

| | Local | Production |
|---|---|---|
| Financements d'une personne | http://localhost:3000/financements/{courriel} | https://api.bib.umontreal.ca/financements/{courriel} |
| État du service | http://localhost:3000/financements/sante | https://api.bib.umontreal.ca/financements/sante |

Réponse :

```json
{
  "miseAJour": "2026-10-29T16:04:03-04:00",
  "financements": [
    {
      "anneeDebut": 2018,
      "anneeFin": 2024,
      "titre": "…",
      "chercheursPrincipaux": [{ "nom": "…", "courriel": "…" }],
      "coChercheurs": [{ "nom": "…" }],
      "source": "…",
      "programme": "…"
    }
  ]
}
```

- `miseAJour` est la date de la dernière génération des données, à l'heure de Montréal.
- Les financements sont triés par année de fin décroissante.
- Un courriel inconnu donne une liste vide ; un courriel invalide donne une erreur `400`.
- Le courriel n'est indiqué que pour les professeurs du répertoire.

## Démarrage

Node.js 20.12 ou plus récent.

```bash
npm install
cp .env.example .env   # adapter les chemins des fichiers
npm run generer        # fichiers Synchro -> financements.json
npm start
```

La configuration est décrite dans [.env.example](.env.example).

## Mise à jour des données

Déposez les nouveaux exports Synchro, puis lancez `npm run generer`, idéalement
en tâche planifiée. L'API recharge les données toute seule, sans redémarrage.

Un financement est retenu si sa fin date de 5 ans ou moins (`ANNEES`) et qu'au
moins un professeur du répertoire fait partie de l'équipe. Les titres de
professeur retenus sont dans `src/rh.js`.

En cas de problème (fichier manquant, XML invalide, moins de `MIN_PROFESSEURS`
professeurs trouvés), la génération s'arrête et les données en place sont conservées.

## Production

Dans le `.env` : `HOTE=127.0.0.1`, `URL_PUBLIQUE=https://api.bib.umontreal.ca`,
`TRUST_PROXY=loopback`.

Le serveur web d'api.bib.umontreal.ca gère HTTPS et relaie `/financements` vers
Node. Exemple pour Apache :

```apache
ProxyPreserveHost On
ProxyPass        /financements http://127.0.0.1:3000/financements
ProxyPassReverse /financements http://127.0.0.1:3000/financements
RequestHeader set X-Forwarded-Proto "https"
```

L'API doit tourner sous un gestionnaire de processus (systemd, pm2…) pour
redémarrer automatiquement.
