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

/** Date ISO 8601 à l'heure locale du fuseau, avec décalage : 2026-10-29T16:04:03-04:00 */
function dateLocale(date = new Date(), fuseau = 'America/Toronto') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  );
  const decalage = p.timeZoneName === 'GMT' ? '+00:00' : p.timeZoneName.replace('GMT', '');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${decalage}`;
}

module.exports = { nettoyer, normaliserCourriel, comparerFinancements, dateLocale };
