'use strict';
/**
 * Génère financements.json à partir des exports Synchro Recherche (organisme.xml,
 * programme.xml, vitrine.xml) et Synchro RH.
 *
 *   node src/generer.js [--organisme f] [--programme f] [--vitrine f]
 *                       [--synchro-rh f] [--sortie f] [--annees n]
 *
 * Sans option, les chemins viennent de la configuration (.env).
 */
const fsp = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { nettoyer, comparerFinancements } = require('./commun');
const { parcourirXml, enfants, texteDe, chargerTable } = require('./xml');
const { chargerProfesseurs } = require('./rh');
const { resoudreFichier } = require('./fichiers');

/** 4 derniers chiffres de la date (format JJMMAAAA), null si invalide. */
function annee(dateTexte) {
  const m = /(\d{4})$/.exec(nettoyer(dateTexte));
  return m ? Number(m[1]) : null;
}

/**
 * Membres de l'équipe ayant le rôle donné (PI ou CC). Le courriel n'est ajouté que
 * pour les professeurs du répertoire ; sans Synchro RH (professeurs null), l'EMPLID
 * le remplace. Un même EMPLID présent deux fois dans l'équipe n'est gardé qu'une fois.
 */
function chercheurs(equipe, role, professeurs) {
  const vus = new Set();
  const liste = [];
  for (const membre of equipe) {
    if (texteDe(membre, 'PROF_ROLE_TYPE') !== role) continue;
    const emplid = texteDe(membre, 'EMPLID');
    if (emplid && vus.has(emplid)) continue;
    vus.add(emplid);

    const chercheur = {
      nom: nettoyer(`${texteDe(membre, 'FIRST_NAME')} ${texteDe(membre, 'LAST_NAME')}`),
    };
    if (professeurs === null) chercheur.emplid = emplid;
    else if (professeurs.has(emplid)) chercheur.courriel = professeurs.get(emplid);
    liste.push(chercheur);
  }
  return liste;
}

/**
 * Retient un financement si son année de fin date de `annees` ans ou moins et si
 * au moins un membre de l'équipe est un professeur du répertoire.
 */
async function genererFinancements({
  organisme,
  programme,
  vitrine,
  professeurs,
  annees = 5,
  anneeCourante = new Date().getFullYear(),
}) {
  const [organismes, programmes] = await Promise.all([
    chargerTable(organisme, 'ORGAN', 'ORG_ID', 'DESCRIPTION'),
    chargerTable(programme, 'PROG', 'PROG_ID', 'DESCRIPTION'),
  ]);

  const anneeMin = anneeCourante - annees;
  const financements = [];

  const total = await parcourirXml(vitrine, 'DF_HDR', (hdr) => {
    const anneeFin = annee(texteDe(hdr, 'END_DT'));
    if (anneeFin === null || anneeFin < anneeMin) return;

    const equipe = enfants(hdr, 'DF_TEAM');
    if (professeurs && !equipe.some((m) => professeurs.has(texteDe(m, 'EMPLID')))) return;

    financements.push({
      anneeDebut: annee(texteDe(hdr, 'BEGIN_DT')),
      anneeFin,
      titre: texteDe(hdr, 'TITRE'),
      chercheursPrincipaux: chercheurs(equipe, 'PI', professeurs),
      coChercheurs: chercheurs(equipe, 'CC', professeurs),
      source: organismes.get(texteDe(hdr, 'ORG_ID')) ?? null,
      programme: programmes.get(texteDe(hdr, 'PROG_ID')) ?? null,
    });
  });

  financements.sort(comparerFinancements);
  return { financements, total, organismes: organismes.size, programmes: programmes.size };
}

// Fichier temporaire puis renommage : l'API ne lit jamais un fichier à moitié écrit.
async function ecrireAtomique(chemin, contenu) {
  const temporaire = `${chemin}.${process.pid}.tmp`;
  await fsp.writeFile(temporaire, contenu, 'utf8');
  // Sous Windows, le renommage échoue si le fichier est lu au même moment : on réessaie.
  for (let essai = 1; ; essai++) {
    try {
      await fsp.rename(temporaire, chemin);
      return;
    } catch (err) {
      if (essai >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await fsp.rm(temporaire, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 200 * essai));
    }
  }
}

async function executerGeneration({
  fichierOrganisme,
  fichierProgramme,
  fichierVitrine,
  fichierSynchroRh,
  fichierFinancements,
  annees,
  rhPositionMatricule,
  rhZoneCourriel,
  minProfesseurs = 0,
  journal = console,
}) {
  const organisme = resoudreFichier(fichierOrganisme);
  const programme = resoudreFichier(fichierProgramme);
  const vitrine = resoudreFichier(fichierVitrine);

  let professeurs = null;
  if (fichierSynchroRh) {
    const synchroRh = resoudreFichier(fichierSynchroRh);
    professeurs = chargerProfesseurs(synchroRh, {
      positionMatricule: rhPositionMatricule,
      zoneCourriel: rhZoneCourriel,
    });
    journal.log(`${professeurs.size} professeurs lus dans ${synchroRh}`);
    // Garde-fou : un fichier RH tronqué ou au mauvais format viderait l'API.
    if (professeurs.size < minProfesseurs) {
      throw new Error(
        `seulement ${professeurs.size} professeurs trouvés (minimum attendu : ${minProfesseurs}) : ` +
          'fichier Synchro RH incomplet ou format inattendu, financements.json non modifié'
      );
    }
  } else {
    journal.warn(
      'Aucun fichier Synchro RH (FICHIER_SYNCHRO_RH vide) : pas de filtre sur les professeurs, ' +
        'EMPLID utilisé à la place du courriel (mode développement).'
    );
  }

  const resultat = await genererFinancements({ organisme, programme, vitrine, professeurs, annees });
  await ecrireAtomique(fichierFinancements, JSON.stringify(resultat.financements, null, 2));
  journal.log(
    `${resultat.financements.length} financements retenus sur ${resultat.total} ` +
      `(${resultat.organismes} organismes, ${resultat.programmes} programmes) -> ${fichierFinancements}`
  );
  return resultat;
}

if (require.main === module) {
  const config = require('./config');
  const { values } = parseArgs({
    options: {
      organisme: { type: 'string' },
      programme: { type: 'string' },
      vitrine: { type: 'string' },
      'synchro-rh': { type: 'string' },
      sortie: { type: 'string' },
      annees: { type: 'string' },
    },
  });
  const absolu = (v) => v && path.resolve(v);
  executerGeneration({
    ...config,
    fichierOrganisme: absolu(values.organisme) ?? config.fichierOrganisme,
    fichierProgramme: absolu(values.programme) ?? config.fichierProgramme,
    fichierVitrine: absolu(values.vitrine) ?? config.fichierVitrine,
    fichierSynchroRh: values['synchro-rh'] !== undefined ? absolu(values['synchro-rh']) || null : config.fichierSynchroRh,
    fichierFinancements: absolu(values.sortie) ?? config.fichierFinancements,
    annees: values.annees !== undefined ? Number(values.annees) : config.annees,
  }).catch((err) => {
    console.error(`Échec de la génération : ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { annee, genererFinancements, executerGeneration };
