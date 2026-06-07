#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const logoDownloader = require('../src/utils/logoDownloader');

const DB_PATH = path.join(__dirname, '../data/tokens.db');

console.log('📥 Téléchargement des logos pour les tokens existants\n');

// Ouvrir la base de données
const db = new Database(DB_PATH);

// Récupérer tous les tokens avec métadonnées qui ont une URL de logo externe
const tokensWithLogos = db.prepare(`
    SELECT contract_address, name, logo_url
    FROM token_metadata
    WHERE logo_url IS NOT NULL
      AND logo_url LIKE 'http%'
`).all();

console.log(`📊 Nombre de logos à télécharger: ${tokensWithLogos.length}\n`);

// Télécharger les logos
(async () => {
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const token of tokensWithLogos) {
        console.log(`📥 Téléchargement: ${token.name} (${token.contract_address.substring(0, 8)}...)`);
        console.log(`   URL: ${token.logo_url}`);

        try {
            const localPath = await logoDownloader.downloadLogo(token.logo_url, token.contract_address);

            if (localPath) {
                // Mettre à jour la base de données avec le chemin local
                db.prepare(`
                    UPDATE token_metadata
                    SET logo_url = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE contract_address = ?
                `).run(localPath, token.contract_address);

                console.log(`   ✅ Téléchargé et sauvegardé: ${localPath}\n`);
                successCount++;
            } else {
                console.log(`   ⚠️  Échec du téléchargement\n`);
                failCount++;
            }
        } catch (error) {
            console.error(`   ❌ Erreur: ${error.message}\n`);
            failCount++;
        }

        // Délai pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('\n📊 Résumé du téléchargement:');
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ❌ Échecs: ${failCount}`);
    console.log(`   ⏭️  Ignorés: ${skipCount}`);
    console.log(`   📝 Total: ${tokensWithLogos.length}`);

    db.close();
    console.log('\n✨ Téléchargement terminé!\n');
})();
