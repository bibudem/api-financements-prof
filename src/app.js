'use strict';
const express = require('express');
const { normaliserCourriel } = require('./commun');

const COURRIEL = /^[^\s@/]+@[^\s@/]+$/;
const EMPLID = /^[a-z0-9]{1,20}$/; // mode développement (sans Synchro RH)

function creerApp(
  depot,
  { corsOrigine = '*', cacheMaxAge = 300, urlPublique = '', trustProxy = '' } = {}
) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);

  // L'API est appelée depuis le navigateur (DSpace, Typo3).
  app.use((req, res, next) => {
    if (corsOrigine) {
      res.set('Access-Control-Allow-Origin', corsOrigine);
      if (corsOrigine !== '*') res.vary('Origin');
    }
    next();
  });

  app.get(['/', '/financements'], (req, res) => {
    res.json({
      service: 'Financements de recherche (Synchro Recherche) du répertoire des professeures et professeurs',
      utilisation: `${urlPublique}/financements/{courriel}`,
      sante: `${urlPublique}/financements/sante`,
    });
  });

  // Aussi sous /financements/ : en production, seul ce préfixe est relayé par le proxy.
  app.get(['/sante', '/financements/sante'], (req, res) => {
    res.set('Cache-Control', 'no-store').status(depot.pret ? 200 : 503).json(depot.etat);
  });

  app.get(['/financements/:courriel', '/:courriel'], (req, res) => {
    const identifiant = normaliserCourriel(req.params.courriel);
    if (identifiant.length > 254 || !(COURRIEL.test(identifiant) || EMPLID.test(identifiant))) {
      return res.status(400).json({ erreur: 'Courriel invalide' });
    }
    if (!depot.pret) {
      return res.status(503).json({ erreur: 'Données non disponibles' });
    }
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`).json(depot.trouver(identifiant));
  });

  app.use((req, res) => {
    res.status(404).json({ erreur: 'Ressource introuvable' });
  });

  // Les 4 paramètres sont obligatoires pour qu'Express reconnaisse un gestionnaire d'erreurs.
  app.use((err, req, res, next) => {
    const statut = err.status || err.statusCode || 500;
    if (statut >= 500) console.error(err);
    res.status(statut).json({ erreur: statut >= 500 ? 'Erreur interne' : 'Requête invalide' });
  });

  return app;
}

module.exports = { creerApp };
