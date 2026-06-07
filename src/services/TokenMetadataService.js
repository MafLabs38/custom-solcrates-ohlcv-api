const axios = require('axios');
const logger = require('../config/logger');
const sqliteManager = require('../config/sqlite');
const logoDownloader = require('../utils/logoDownloader');

/**
 * Service pour récupérer et gérer les métadonnées des tokens
 */
class TokenMetadataService {
    constructor() {
        this.dexscreenerBaseUrl = 'https://api.dexscreener.com/latest/dex';
        this.jupiterBaseUrl = 'https://tokens.jup.ag/token';
    }

    /**
     * Récupère les métadonnées d'un token depuis DexScreener
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {Promise<Object>} Métadonnées du token
     */
    async fetchFromDexScreener(contractAddress) {
        try {
            logger.info(`Récupération des métadonnées DexScreener pour ${contractAddress}`);

            const response = await axios.get(
                `${this.dexscreenerBaseUrl}/tokens/${contractAddress}`,
                { timeout: 10000 }
            );

            if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
                logger.warn(`Aucune paire trouvée sur DexScreener pour ${contractAddress}`);
                return null;
            }

            // Prendre la première paire (généralement la plus liquide)
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
                description: null, // DexScreener ne fournit pas de description
                liquidity: pair.liquidity?.usd || 0,
                fdv: pair.fdv || 0,
                priceUsd: pair.priceUsd || 0
            };
        } catch (error) {
            logger.error(`Erreur lors de la récupération depuis DexScreener: ${error.message}`);
            return null;
        }
    }

    /**
     * Récupère les métadonnées d'un token depuis Jupiter
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {Promise<Object>} Métadonnées du token
     */
    async fetchFromJupiter(contractAddress) {
        try {
            logger.info(`Récupération des métadonnées Jupiter pour ${contractAddress}`);

            const response = await axios.get(
                `${this.jupiterBaseUrl}/${contractAddress}`,
                { timeout: 10000 }
            );

            if (!response.data) {
                logger.warn(`Aucune donnée Jupiter pour ${contractAddress}`);
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
                coingecko_id: data.extensions?.coingeckoId || null
            };
        } catch (error) {
            logger.error(`Erreur lors de la récupération depuis Jupiter: ${error.message}`);
            return null;
        }
    }

    /**
     * Récupère et stocke les métadonnées d'un token
     * Essaye d'abord DexScreener, puis Jupiter en fallback
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {Promise<Object>} Métadonnées complètes
     */
    async fetchAndStoreMetadata(contractAddress) {
        try {
            logger.info(`🔍 Récupération des métadonnées pour ${contractAddress}`);

            // Essayer DexScreener en premier (plus complet pour les tokens Solana)
            let metadata = await this.fetchFromDexScreener(contractAddress);

            // Fallback sur Jupiter si DexScreener ne retourne rien
            if (!metadata || !metadata.name) {
                logger.info(`Fallback vers Jupiter pour ${contractAddress}`);
                metadata = await this.fetchFromJupiter(contractAddress);
            }

            // Si on n'a toujours rien, essayer de combiner les deux sources
            if (!metadata || !metadata.name) {
                logger.warn(`Impossible de récupérer les métadonnées pour ${contractAddress}`);
                return null;
            }

            // Télécharger le logo localement si disponible
            if (metadata.logo_url) {
                logger.info(`📥 Téléchargement du logo pour ${contractAddress}`);
                const localLogoPath = await logoDownloader.downloadLogo(metadata.logo_url, contractAddress);

                if (localLogoPath) {
                    // Remplacer l'URL externe par le chemin local
                    metadata.logo_url = localLogoPath;
                    logger.info(`✅ Logo téléchargé et stocké localement: ${localLogoPath}`);
                } else {
                    logger.warn(`⚠️  Échec du téléchargement du logo, conservation de l'URL externe`);
                }
            }

            // Stocker dans la base de données
            const success = sqliteManager.createOrUpdateMetadata(contractAddress, metadata);

            if (success) {
                logger.info(`✅ Métadonnées stockées pour ${contractAddress}: ${metadata.name} (${metadata.symbol})`);
            } else {
                logger.error(`❌ Échec du stockage des métadonnées pour ${contractAddress}`);
            }

            return metadata;
        } catch (error) {
            logger.error(`Erreur lors de fetchAndStoreMetadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Récupère les métadonnées depuis la base de données
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {Object|null} Métadonnées ou null si non trouvées
     */
    getMetadata(contractAddress) {
        try {
            return sqliteManager.getMetadata(contractAddress);
        } catch (error) {
            logger.error(`Erreur lors de la récupération des métadonnées: ${error.message}`);
            return null;
        }
    }

    /**
     * Récupère toutes les métadonnées
     * @returns {Array} Liste des métadonnées
     */
    getAllMetadata() {
        try {
            return sqliteManager.getAllMetadata();
        } catch (error) {
            logger.error(`Erreur lors de la récupération de toutes les métadonnées: ${error.message}`);
            return [];
        }
    }

    /**
     * Met à jour les métadonnées d'un token (refetch)
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {Promise<Object>} Métadonnées mises à jour
     */
    async refreshMetadata(contractAddress) {
        logger.info(`🔄 Rafraîchissement des métadonnées pour ${contractAddress}`);
        return this.fetchAndStoreMetadata(contractAddress);
    }

    /**
     * Supprime les métadonnées d'un token
     * @param {string} contractAddress - L'adresse du contrat du token
     * @returns {boolean} true si succès
     */
    deleteMetadata(contractAddress) {
        try {
            return sqliteManager.deleteMetadata(contractAddress);
        } catch (error) {
            logger.error(`Erreur lors de la suppression des métadonnées: ${error.message}`);
            return false;
        }
    }
}

module.exports = new TokenMetadataService();
