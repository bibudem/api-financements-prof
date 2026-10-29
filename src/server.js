'use strict';
const fs = require('node:fs');
const config = require('./config');
const { Depot } = require('./depot');
const { creerApp } = require('./app');
const { executerGeneration } = require('./generer');

async function demarrer() {
  if (!fs.existsSync(config.fichierFinancements)) {
    console.log(`${config.fichierFinancements} absent : génération à partir des fichiers Synchro`);
    await executerGeneration(config);
  }

  const depot = new Depot(config.fichierFinancements, { fuseau: config.fuseauHoraire });
  depot.charger();
  depot.surveiller(config.intervalleSurveillanceMs);

  const app = creerApp(depot, config);
  // Sans certificat : HTTP (en local, ou derrière le proxy HTTPS en production).
  const https = config.httpsCertificat && config.httpsCle;
  const serveur = https
    ? require('node:https').createServer(
        { cert: fs.readFileSync(config.httpsCertificat), key: fs.readFileSync(config.httpsCle) },
        app
      )
    : require('node:http').createServer(app);

  serveur.listen(config.port, config.hote, () => {
    console.log(
      `API des financements à l'écoute sur ${https ? 'https' : 'http'}://${config.hote}:${config.port}` +
        ` (adresse publique : ${config.urlPublique}/financements/{courriel})`
    );
  });

  const arreter = (signal) => {
    console.log(`${signal} reçu, arrêt du serveur`);
    depot.arreter();
    serveur.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', arreter);
  process.on('SIGINT', arreter);
}

demarrer().catch((err) => {
  console.error(`Démarrage impossible : ${err.message}`);
  process.exit(1);
});
