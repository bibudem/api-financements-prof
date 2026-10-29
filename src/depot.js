'use strict';
const fs = require('node:fs');
const { normaliserCourriel, comparerFinancements } = require('./commun');

/**
 * Index { courriel -> financements triés }. En mode développement (sans
 * Synchro RH), les chercheurs sont indexés par EMPLID.
 */
function construireIndex(financements) {
  const index = new Map();
  let ignores = 0;

  for (const f of financements) {
    if (!f || !Array.isArray(f.chercheursPrincipaux) || !Array.isArray(f.coChercheurs)) {
      ignores++;
      continue;
    }
    // Un Set : une personne à la fois PI et CC ne reçoit le financement qu'une fois.
    const cles = new Set();
    for (const c of [...f.chercheursPrincipaux, ...f.coChercheurs]) {
      if (c?.courriel) cles.add(normaliserCourriel(c.courriel));
      if (c?.emplid) cles.add(normaliserCourriel(c.emplid));
    }
    for (const cle of cles) {
      if (!index.has(cle)) index.set(cle, []);
      index.get(cle).push(f);
    }
  }
  for (const liste of index.values()) liste.sort(comparerFinancements);
  return { index, ignores };
}

/**
 * Données en mémoire, rechargées quand le fichier JSON change.
 * Si le nouveau fichier est invalide, les données précédentes restent en service.
 */
class Depot {
  #chemin;
  #journal;
  #index = null;
  #etat = { pret: false };

  constructor(chemin, { journal = console } = {}) {
    this.#chemin = chemin;
    this.#journal = journal;
  }

  /** Lève une erreur si le fichier est absent ou invalide. */
  charger() {
    const stat = fs.statSync(this.#chemin);
    const donnees = JSON.parse(fs.readFileSync(this.#chemin, 'utf8'));
    if (!Array.isArray(donnees)) throw new Error('le fichier doit contenir un tableau JSON');

    const { index, ignores } = construireIndex(donnees);
    // Remplacement en un seul coup : une requête voit l'ancien ou le nouvel index, jamais un mélange.
    this.#index = index;
    this.#etat = {
      pret: true,
      financements: donnees.length,
      personnes: index.size,
      modifieLe: stat.mtime.toISOString(),
      chargeLe: new Date().toISOString(),
    };
    this.#journal.log(
      `${donnees.length} financements chargés (${index.size} personnes` +
        `${ignores ? `, ${ignores} entrées invalides ignorées` : ''}) depuis ${this.#chemin}`
    );
  }

  recharger() {
    try {
      this.charger();
    } catch (err) {
      this.#journal.error(`Rechargement impossible, données précédentes conservées : ${err.message}`);
    }
  }

  // Scrutation plutôt que fs.watch : fiable sur partage réseau et avec un remplacement par renommage.
  surveiller(intervalleMs = 5000) {
    fs.watchFile(this.#chemin, { interval: intervalleMs, persistent: false }, (actuel, precedent) => {
      if (actuel.mtimeMs === precedent.mtimeMs && actuel.size === precedent.size) return;
      if (actuel.mtimeMs === 0) {
        this.#journal.warn(`${this.#chemin} a disparu, données précédentes conservées`);
        return;
      }
      this.recharger();
    });
  }

  arreter() {
    fs.unwatchFile(this.#chemin);
  }

  get pret() {
    return this.#etat.pret;
  }

  get etat() {
    return { ...this.#etat };
  }

  trouver(identifiant) {
    return this.#index?.get(identifiant) ?? [];
  }
}

module.exports = { Depot };
