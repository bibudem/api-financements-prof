'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { genererFinancements, executerGeneration, annee } = require('../src/generer');
const { chargerProfesseurs } = require('../src/rh');
const { resoudreFichier } = require('../src/fichiers');
const { Depot } = require('../src/depot');
const { creerApp } = require('../src/app');

const fixtures = path.join(__dirname, 'fixtures');
const silencieux = { log() {}, warn() {}, error() {} };
const sources = {
  organisme: path.join(fixtures, 'organisme.xml'),
  programme: path.join(fixtures, 'programme.xml'),
  vitrine: path.join(fixtures, 'vitrine.xml'),
};
const fichierRh = path.join(fixtures, 'synchro_PERSONNEL_20260101.txt');

describe('génération', () => {
  test('année = 4 derniers chiffres', () => {
    assert.equal(annee('31032024'), 2024);
    assert.equal(annee(' '), null);
  });

  test('lecture Synchro RH à largeur fixe (Windows-1252, professeurs seulement)', () => {
    const profs = chargerProfesseurs(fichierRh);
    assert.deepEqual([...profs], [
      ['100', 'ana.prof@umontreal.ca'],
      ['200', 'bob@umontreal.ca'], // titre avec espaces multiples reconnu
    ]); // 900 : pas professeur ; 300 : sans courriel
  });

  test('résolution des chemins avec « * » et fichier absent', () => {
    assert.equal(resoudreFichier(path.join(fixtures, 'synchro_PERSONNEL_*.txt')), fichierRh);
    assert.throws(() => resoudreFichier(path.join(fixtures, 'absent_*.txt')), /Aucun fichier/);
    assert.throws(() => resoudreFichier(path.join(fixtures, 'absent.xml')), /introuvable/);
  });

  test('filtres, structure et tri selon la spécification', async () => {
    const professeurs = chargerProfesseurs(fichierRh);
    const { financements, total } = await genererFinancements({
      ...sources, professeurs, annees: 5, anneeCourante: 2026,
    });
    assert.equal(total, 4);
    assert.deepEqual(financements, [
      {
        anneeDebut: 2018,
        anneeFin: 2024, // et non 2030 (UM_VRECH_FIN_VW/END_DT)
        titre: "Laboratoire d'écologie quantitative",
        chercheursPrincipaux: [{ nom: 'Ana Prof', courriel: 'ana.prof@umontreal.ca' }],
        coChercheurs: [{ nom: 'Ext Erne' }], // hors répertoire : nom sans courriel
        source: 'Fonds canadiens pour la recherche', // et non DF_ASSO/ORG_ID
        programme: 'Subventions pour démarrer des recherches',
      },
      {
        anneeDebut: 2021,
        anneeFin: 2021,
        titre: 'Plus récent',
        chercheursPrincipaux: [{ nom: 'Ext Erne' }],
        coChercheurs: [
          { nom: 'Bob Chercheur', courriel: 'bob@umontreal.ca' },
          { nom: 'Ana Prof', courriel: 'ana.prof@umontreal.ca' },
        ],
        source: null,
        programme: 'Subventions pour démarrer des recherches',
      },
    ]);
  });

  test('sans Synchro RH : pas de filtre professeur, emplid au lieu du courriel', async () => {
    const { financements } = await genererFinancements({
      ...sources, professeurs: null, annees: 5, anneeCourante: 2026,
    });
    assert.deepEqual(financements.map((f) => f.titre), [
      'Aucun professeur du répertoire', "Laboratoire d'écologie quantitative", 'Plus récent',
    ]);
    assert.deepEqual(financements[0].chercheursPrincipaux, [{ nom: 'Ext Erne', emplid: '900' }]);
  });

  test('XML invalide : erreur, aucun fichier écrit', async () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'financements-'));
    for (const f of ['organisme.xml', 'programme.xml']) fs.copyFileSync(path.join(fixtures, f), path.join(dossier, f));
    fs.writeFileSync(path.join(dossier, 'vitrine.xml'), '<VITRINE><DF_HDR><TITRE>tronqué');
    const sortie = path.join(dossier, 'financements.json');
    await assert.rejects(executerGeneration({
      fichierOrganisme: path.join(dossier, 'organisme.xml'),
      fichierProgramme: path.join(dossier, 'programme.xml'),
      fichierVitrine: path.join(dossier, 'vitrine.xml'),
      fichierSynchroRh: null,
      fichierFinancements: sortie,
      annees: 5,
      journal: silencieux,
    }));
    assert.equal(fs.existsSync(sortie), false);
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  test('garde-fou : trop peu de professeurs, aucun fichier écrit', async () => {
    const sortie = path.join(os.tmpdir(), `financements-${process.pid}.json`);
    await assert.rejects(
      executerGeneration({
        fichierOrganisme: sources.organisme,
        fichierProgramme: sources.programme,
        fichierVitrine: sources.vitrine,
        fichierSynchroRh: fichierRh,
        fichierFinancements: sortie,
        annees: 5,
        minProfesseurs: 1500,
        journal: silencieux,
      }),
      /seulement 2 professeurs/
    );
    assert.equal(fs.existsSync(sortie), false);
  });
});

describe('service web', () => {
  let dossier, fichier, depot, serveur, base;

  const ecrire = async (anneeCourante) => {
    const professeurs = chargerProfesseurs(fichierRh);
    const { financements } = await genererFinancements({ ...sources, professeurs, annees: 5, anneeCourante });
    fs.writeFileSync(fichier, JSON.stringify(financements));
  };

  before(async () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'financements-'));
    fichier = path.join(dossier, 'financements.json');
    await ecrire(2026);
    depot = new Depot(fichier, { journal: silencieux });
    depot.charger();
    serveur = creerApp(depot, { urlPublique: 'https://api.bib.umontreal.ca', trustProxy: 'loopback' }).listen(0);
    base = `http://127.0.0.1:${serveur.address().port}`;
  });

  after(() => {
    serveur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  test('GET /financements/:courriel, insensible à la casse, trié par année de fin', async () => {
    const rep = await fetch(`${base}/financements/ANA.Prof%40umontreal.ca`);
    assert.equal(rep.status, 200);
    assert.equal(rep.headers.get('access-control-allow-origin'), '*');
    const corps = await rep.json();
    assert.deepEqual(corps.map((f) => f.anneeFin), [2024, 2021]);
  });

  test('GET /:courriel', async () => {
    const corps = await (await fetch(`${base}/bob@umontreal.ca`)).json();
    assert.deepEqual(corps.map((f) => f.titre), ['Plus récent']);
  });

  test('courriel inconnu : tableau vide ; courriel invalide : 400', async () => {
    assert.deepEqual(await (await fetch(`${base}/inconnu@umontreal.ca`)).json(), []);
    assert.equal((await fetch(`${base}/pas-un-courriel`)).status, 400);
    assert.equal((await fetch(`${base}/a/b/c`)).status, 404);
  });

  test('GET /sante et /financements/sante (sans chemin de fichier exposé)', async () => {
    for (const chemin of ['/sante', '/financements/sante']) {
      const corps = await (await fetch(`${base}${chemin}`)).json();
      assert.equal(corps.pret, true);
      assert.equal(corps.financements, 2);
      assert.equal('fichier' in corps, false);
    }
  });

  test('accueil : adresse publique', async () => {
    const corps = await (await fetch(`${base}/financements`)).json();
    assert.equal(corps.utilisation, 'https://api.bib.umontreal.ca/financements/{courriel}');
  });

  test('rechargement : JSON invalide ignoré, nouveau fichier pris en compte', async () => {
    fs.writeFileSync(fichier, '{ invalide');
    depot.recharger();
    assert.equal(depot.etat.financements, 2);

    await ecrire(2030); // fenêtre 2025+ : plus aucun financement retenu
    depot.recharger();
    assert.equal(depot.etat.financements, 0);
    assert.deepEqual(await (await fetch(`${base}/ana.prof@umontreal.ca`)).json(), []);
  });
});
