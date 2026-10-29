'use strict';

/** Espaces multiples et retours de ligne -> un seul espace. */
function nettoyer(valeur) {
  return String(valeur ?? '').replace(/\s+/g, ' ').trim();
}

function normaliserCourriel(valeur) {
  return nettoyer(valeur).toLowerCase();
}

/** Année de fin décroissante, puis année de début décroissante, puis titre. */
function comparerFinancements(a, b) {
  return (
    (b.anneeFin ?? 0) - (a.anneeFin ?? 0) ||
    (b.anneeDebut ?? 0) - (a.anneeDebut ?? 0) ||
    String(a.titre ?? '').localeCompare(String(b.titre ?? ''), 'fr')
  );
}

module.exports = { nettoyer, normaliserCourriel, comparerFinancements };
