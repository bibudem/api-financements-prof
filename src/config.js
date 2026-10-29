'use strict';
/**
 * Configuration par variables d'environnement ou fichier .env (voir .env.example).
 * Les chemins relatifs partent de la racine du projet.
 */
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '..');
const fichierEnv = path.join(racine, '.env');
if (fs.existsSync(fichierEnv)) process.loadEnvFile(fichierEnv); // n'écrase pas les variables déjà définies

const env = process.env;
const chemin = (valeur) => path.resolve(racine, valeur);

function entier(valeur, defaut) {
  const n = Number.parseInt(valeur, 10);
  return Number.isFinite(n) ? n : defaut;
}

/** « 154-166 » -> [154, 166] */
function intervalle(valeur, defaut) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(valeur ?? '');
  return m ? [Number(m[1]), Number(m[2])] : defaut;
}

const dossierDonnees = chemin(env.DOSSIER_DONNEES || 'data');
const donnee = (valeur, defaut) => (valeur ? chemin(valeur) : path.join(dossierDonnees, defaut));

const port = entier(env.PORT, 3000);

module.exports = {
  port,
  hote: env.HOTE || 'localhost',
  urlPublique: (env.URL_PUBLIQUE || `http://localhost:${port}`).replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY || '',
  httpsCertificat: env.HTTPS_CERTIFICAT ? chemin(env.HTTPS_CERTIFICAT) : null,
  httpsCle: env.HTTPS_CLE ? chemin(env.HTTPS_CLE) : null,

  fichierOrganisme: donnee(env.FICHIER_ORGANISME, 'organisme.xml'),
  fichierProgramme: donnee(env.FICHIER_PROGRAMME, 'programme.xml'),
  fichierVitrine: donnee(env.FICHIER_VITRINE, 'vitrine.xml'),
  // Vide (FICHIER_SYNCHRO_RH=) : mode développement, sans filtre sur les professeurs.
  fichierSynchroRh: env.FICHIER_SYNCHRO_RH === '' ? null : donnee(env.FICHIER_SYNCHRO_RH, 'synchro_PERSONNEL_*.txt'),

  rhPositionMatricule: intervalle(env.RH_POSITION_MATRICULE, [154, 166]),
  rhZoneCourriel: intervalle(env.RH_ZONE_COURRIEL, [166, 320]),
  minProfesseurs: entier(env.MIN_PROFESSEURS, 1500),

  fichierFinancements: chemin(env.FICHIER_FINANCEMENTS || 'financements.json'),
  annees: entier(env.ANNEES, 5),

  intervalleSurveillanceMs: entier(env.INTERVALLE_SURVEILLANCE_MS, 5000),
  corsOrigine: env.CORS_ORIGINE ?? '*',
  cacheMaxAge: entier(env.CACHE_MAX_AGE, 300),
};
