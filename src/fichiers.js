'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Le nom de fichier peut contenir des « * » (ex. synchro_PERSONNEL_*.txt) :
 * le fichier correspondant le plus récemment modifié est alors choisi.
 */
function resoudreFichier(chemin) {
  if (!path.basename(chemin).includes('*')) {
    if (!fs.existsSync(chemin)) throw new Error(`Fichier introuvable : ${chemin}`);
    return chemin;
  }

  const dossier = path.dirname(chemin);
  const motif = new RegExp(
    `^${path.basename(chemin).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
    'i'
  );
  const candidats = (fs.existsSync(dossier) ? fs.readdirSync(dossier) : [])
    .filter((nom) => motif.test(nom))
    .map((nom) => path.join(dossier, nom))
    .filter((f) => fs.statSync(f).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (!candidats.length) throw new Error(`Aucun fichier ne correspond à : ${chemin}`);
  return candidats[0];
}

module.exports = { resoudreFichier };
