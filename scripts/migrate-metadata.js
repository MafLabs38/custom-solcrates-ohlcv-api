#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const axios = require('axios');

const DB_PATH = path.join(__dirname, '../data/tokens.db');

console.log('🔧 Migration: Création de la table token_metadata et récupération des métadonnées\n');

// Ouvrir la base de données
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Créer la table token_metadata
console.log('📋 Étape 1: Création de la table token_metadata...');
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS token_metadata (
            contract_address TEXT PRIMARY KEY,
            name TEXT,
            logo_url TEXT,
            description TEXT,
            website TEXT,
            twitter TEXT,
            telegram TEXT,
            discord TEXT,
            coingecko_id TEXT,
            coinmarketcap_id TEXT,
            decimals INTEGER DEFAULT 9,
            total_supply TEXT,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contract_address) REFERENCES tokens(contract_address) ON DELETE CASCADE
        )
    `);
    console.log('✅ Table token_metadata créée avec succès\n');
} catch (error) {
    console.error('❌ Erreur lors de la création de la table:', error.message);
    process.exit(1);
}

// Créer l'index
console.log('📋 Étape 2: Création de l\'index...');
try {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_token_metadata_address ON token_metadata(contract_address);
    `);
    console.log('✅ Index créé avec succès\n');
} catch (error) {
    console.error('❌ Erreur lors de la création de l\'index:', error.message);
}

// Fonction pour récupérer les métadonnées depuis DexScreener
async function fetchMetadataFromDexScreener(contractAddress) {
    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
            { timeout: 10000 }
        );

        if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
            return null;
        }

        const pair = response.data.pairs[0];
        const tokenInfo = pair.baseToken.address === contractAddress
            ? pair.baseToken
            : pair.quoteToken;

        return {
            name: tokenInfo.name || null,
            symbol: tokenInfo.symbol || null,
            logo_url: pair.info?.imageUrl || null,
            website: pair.info?.websites?.[0]?.url || null,
            twitter: pair.info?.socials?.find(s => s.type === 'twitter')?.url || null,
            telegram: pair.info?.socials?.find(s => s.type === 'telegram')?.url || null,
            discord: pair.info?.socials?.find(s => s.type === 'discord')?.url || null,
        };
    } catch (error) {
        console.error(`   ⚠️  Erreur DexScreener: ${error.message}`);
        return null;
    }
}

// Fonction pour récupérer les métadonnées depuis Jupiter
async function fetchMetadataFromJupiter(contractAddress) {
    try {
        const response = await axios.get(
            `https://tokens.jup.ag/token/${contractAddress}`,
            { timeout: 10000 }
        );

        if (!response.data) {
            return null;
        }

        const data = response.data;
        return {
            name: data.name || null,
            symbol: data.symbol || null,
            logo_url: data.logoURI || null,
            decimals: data.decimals || 9,
            description: data.description || null,
            website: data.extensions?.website || null,
            twitter: data.extensions?.twitter || null,
            telegram: data.extensions?.telegram || null,
            discord: data.extensions?.discord || null,
            coingecko_id: data.extensions?.coingeckoId || null,
        };
    } catch (error) {
        console.error(`   ⚠️  Erreur Jupiter: ${error.message}`);
        return null;
    }
}

// Fonction pour sauvegarder les métadonnées
function saveMetadata(contractAddress, metadata) {
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO token_metadata (
                contract_address, name, logo_url, description, website,
                twitter, telegram, discord, coingecko_id, coinmarketcap_id,
                decimals, total_supply, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        stmt.run(
            contractAddress,
            metadata.name || null,
            metadata.logo_url || null,
            metadata.description || null,
            metadata.website || null,
            metadata.twitter || null,
            metadata.telegram || null,
            metadata.discord || null,
            metadata.coingecko_id || null,
            metadata.coinmarketcap_id || null,
            metadata.decimals || 9,
            metadata.total_supply || null
        );

        return true;
    } catch (error) {
        console.error(`   ❌ Erreur sauvegarde: ${error.message}`);
        return false;
    }
}

// Récupérer tous les tokens
console.log('📋 Étape 3: Récupération des métadonnées pour les tokens existants...\n');

const tokens = db.prepare('SELECT contract_address, symbol FROM tokens').all();
console.log(`📊 Nombre de tokens à traiter: ${tokens.length}\n`);

// Traiter les tokens un par un avec délai
(async () => {
    let successCount = 0;
    let failCount = 0;

    for (const token of tokens) {
        console.log(`🔍 Traitement: ${token.symbol} (${token.contract_address})`);

        // Vérifier si les métadonnées existent déjà
        const existing = db.prepare('SELECT contract_address FROM token_metadata WHERE contract_address = ?')
            .get(token.contract_address);

        if (existing) {
            console.log(`   ⏭️  Métadonnées déjà présentes, passage au suivant\n`);
            continue;
        }

        // Essayer DexScreener d'abord
        let metadata = await fetchMetadataFromDexScreener(token.contract_address);

        // Fallback sur Jupiter si DexScreener échoue
        if (!metadata || !metadata.name) {
            console.log('   ℹ️  Fallback vers Jupiter...');
            metadata = await fetchMetadataFromJupiter(token.contract_address);
        }

        if (metadata && metadata.name) {
            if (saveMetadata(token.contract_address, metadata)) {
                console.log(`   ✅ Métadonnées sauvegardées: ${metadata.name}`);
                successCount++;
            } else {
                console.log(`   ❌ Échec de la sauvegarde`);
                failCount++;
            }
        } else {
            console.log(`   ⚠️  Aucune métadonnée trouvée`);
            failCount++;
        }

        console.log('');

        // Délai pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n📊 Résumé de la migration:');
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ❌ Échecs: ${failCount}`);
    console.log(`   📝 Total: ${tokens.length}`);

    db.close();
    console.log('\n✨ Migration terminée!\n');
})();
