'use strict';
/**
 * Lecture du fichier Synchro RH (export PERSONNEL à largeur fixe), avec les mêmes
 * règles que papyrus-annuaires-donnees/outils/extraire_professeurs.py.
 */
const fs = require('node:fs');
const { nettoyer, normaliserCourriel } = require('./commun');

// Fonctions Synchro retenues comme professeurs du répertoire.
const TITRES_PROFESSEUR = [
  'Prof agrégé(e) PTG SC Acad.',
  'Prof agrégé(e) PTG SC Recherc.',
  'Prof titulaire PTG SC Acad.',
  'Prof. sous octroi titulaire',
  'Professeur associé',
  'Professeur form. prat. titulai',
  'Professeur sous octroi adjoint',
  'Professeur(e) adjoint(e)',
  'Professeur(e) agrégé(e)',
  'Professeur(e) form.prat agrég.',
  'Professeur(e) sous oct. agrég.',
  'Professeur(e) titulaire',
  'Professeur/ chercheur adjoint',
  'Professeur/ chercheur agrégé',
  'Professeur/chercheur titulaire',
];

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Insensible à la casse et au nombre d'espaces (le fichier aligne les colonnes avec des espaces).
function motifTitre(titre) {
  return new RegExp(titre.split(/\s+/).map(echapper).join('\\s+'), 'i');
}

// Les exports Windows sont en Windows-1252 ; UTF-8 accepté s'il est valide.
function decoder(octets) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

// Le courriel est repéré par son « @ » car sa position varie un peu d'une ligne à l'autre.
// Une majuscule collée devant (code du champ précédent) est retirée.
function extraireCourriel(ligne, [debut, fin]) {
  const m = /\S+@\S+/.exec(ligne.slice(debut, fin));
  if (!m) return '';
  let courriel = m[0];
  if (/^[A-Z]/.test(courriel)) courriel = courriel.slice(1);
  return normaliserCourriel(courriel);
}

/** Retourne Map { matricule -> courriel } des professeurs. Le matricule correspond à DF_TEAM/EMPLID. */
function chargerProfesseurs(
  chemin,
  { positionMatricule = [154, 166], zoneCourriel = [166, 320], titres = TITRES_PROFESSEUR } = {}
) {
  const motifs = titres.map(motifTitre);
  const lignes = decoder(fs.readFileSync(chemin)).split(/\r?\n/);

  const professeurs = new Map();
  for (const ligne of lignes) {
    if (!ligne.trim() || !motifs.some((m) => m.test(ligne))) continue;
    const matricule = nettoyer(ligne.slice(...positionMatricule));
    const courriel = extraireCourriel(ligne, zoneCourriel);
    if (matricule && courriel) professeurs.set(matricule, courriel);
  }
  return professeurs;
}

module.exports = { chargerProfesseurs };
