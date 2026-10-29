'use strict';
const fs = require('node:fs');
const sax = require('sax');
const { nettoyer } = require('./commun');

/**
 * Lit le XML en flux (vitrine.xml fait ~35 Mo) et appelle `surEnregistrement` pour
 * chaque élément `balise` de premier niveau, sous forme d'arbre { nom, texte, enfants }.
 * Seul l'enregistrement courant est gardé en mémoire.
 * Résout avec le nombre d'enregistrements lus.
 */
function parcourirXml(chemin, balise, surEnregistrement) {
  return new Promise((resolve, reject) => {
    const flux = fs.createReadStream(chemin);
    const parseur = sax.createStream(true, { trim: false, normalize: false });
    const pile = [];
    let nombre = 0;
    let termine = false;

    const echouer = (err) => {
      if (termine) return;
      termine = true;
      flux.destroy();
      reject(new Error(`${chemin} : ${err.message}`));
    };

    parseur.on('opentag', (tag) => {
      if (termine || (pile.length === 0 && tag.name !== balise)) return;
      const noeud = { nom: tag.name, texte: '', enfants: [] };
      if (pile.length) pile[pile.length - 1].enfants.push(noeud);
      pile.push(noeud);
    });

    const ajouterTexte = (t) => {
      if (pile.length) pile[pile.length - 1].texte += t;
    };
    parseur.on('text', ajouterTexte);
    parseur.on('cdata', ajouterTexte);

    parseur.on('closetag', () => {
      if (termine || pile.length === 0) return;
      const noeud = pile.pop();
      if (pile.length === 0) {
        nombre++;
        try {
          surEnregistrement(noeud);
        } catch (err) {
          echouer(err);
        }
      }
    });

    parseur.on('error', echouer);
    flux.on('error', echouer);
    parseur.on('end', () => {
      if (termine) return;
      termine = true;
      resolve(nombre);
    });

    flux.pipe(parseur);
  });
}

// Enfants DIRECTS seulement : DF_HDR contient aussi des BEGIN_DT, END_DT et ORG_ID
// imbriqués (UM_VRECH_FIN_VW, DF_ASSO) qu'il ne faut pas confondre.
function enfants(noeud, nom) {
  return noeud.enfants.filter((e) => e.nom === nom);
}

function texteDe(noeud, nom) {
  return nettoyer(noeud.enfants.find((e) => e.nom === nom)?.texte);
}

/** XML plat -> Map { cle -> valeur } (organismes, programmes). */
async function chargerTable(chemin, balise, cle, valeur) {
  const table = new Map();
  await parcourirXml(chemin, balise, (noeud) => {
    const k = texteDe(noeud, cle);
    if (k) table.set(k, texteDe(noeud, valeur));
  });
  return table;
}

module.exports = { parcourirXml, enfants, texteDe, chargerTable };
