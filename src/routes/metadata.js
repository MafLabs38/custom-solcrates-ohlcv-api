const express = require('express');
const router = express.Router();
const tokenMetadataService = require('../services/TokenMetadataService');
const logger = require('../config/logger');

/**
 * GET /api/metadata
 *
 * Récupère toutes les métadonnées
 */
router.get('/', async (req, res) => {
    try {
        const allMetadata = tokenMetadataService.getAllMetadata();

        res.json({
            status: 'success',
            data: allMetadata
        });

    } catch (error) {
        logger.error('Erreur GET /api/metadata:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * GET /api/metadata/:address
 *
 * Récupère les métadonnées d'un token depuis la base de données
 */
router.get('/:address', async (req, res) => {
    try {
        const { address } = req.params;

        const metadata = tokenMetadataService.getMetadata(address);

        if (!metadata) {
            return res.status(404).json({
                status: 'error',
                message: 'Métadonnées non trouvées pour ce token'
            });
        }

        res.json({
            status: 'success',
            data: metadata
        });

    } catch (error) {
        logger.error('Erreur GET /api/metadata/:address:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * POST /api/metadata/preview
 *
 * Récupère les métadonnées d'un token SANS les stocker (pour prévisualisation)
 *
 * Body:
 * {
 *   "contractAddress": "ADSXPGwP3riuvqYtwqogCD4Rfn1a6NASqaSpThpsmoon"
 * }
 */
router.post('/preview', async (req, res) => {
    try {
        const { contractAddress } = req.body;

        if (!contractAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'contractAddress requis'
            });
        }

        // Essayer DexScreener en premier
        let metadata = await tokenMetadataService.fetchFromDexScreener(contractAddress);

        // Fallback sur Jupiter si DexScreener ne retourne rien
        if (!metadata || !metadata.name) {
            logger.info(`Fallback vers Jupiter pour ${contractAddress}`);
            metadata = await tokenMetadataService.fetchFromJupiter(contractAddress);
        }

        if (!metadata || !metadata.name) {
            return res.status(404).json({
                status: 'error',
                message: 'Token non trouvé sur DexScreener ou Jupiter'
            });
        }

        // Retourner les métadonnées SANS les stocker
        res.json({
            status: 'success',
            message: 'Métadonnées récupérées (non enregistrées)',
            data: metadata
        });

    } catch (error) {
        logger.error('Erreur POST /api/metadata/preview:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * POST /api/metadata/fetch
 *
 * Récupère et stocke les métadonnées d'un token depuis DexScreener/Jupiter
 *
 * Body:
 * {
 *   "contractAddress": "ADSXPGwP3riuvqYtwqogCD4Rfn1a6NASqaSpThpsmoon"
 * }
 */
router.post('/fetch', async (req, res) => {
    try {
        const { contractAddress } = req.body;

        if (!contractAddress) {
            return res.status(400).json({
                status: 'error',
                message: 'contractAddress requis'
            });
        }

        const metadata = await tokenMetadataService.fetchAndStoreMetadata(contractAddress);

        if (!metadata) {
            return res.status(404).json({
                status: 'error',
                message: 'Impossible de récupérer les métadonnées pour ce token'
            });
        }

        res.json({
            status: 'success',
            message: 'Métadonnées récupérées et stockées avec succès',
            data: metadata
        });

    } catch (error) {
        logger.error('Erreur POST /api/metadata/fetch:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * PUT /api/metadata/:address/refresh
 *
 * Rafraîchit les métadonnées d'un token (refetch depuis les APIs externes)
 */
router.put('/:address/refresh', async (req, res) => {
    try {
        const { address } = req.params;

        const metadata = await tokenMetadataService.refreshMetadata(address);

        if (!metadata) {
            return res.status(404).json({
                status: 'error',
                message: 'Impossible de rafraîchir les métadonnées pour ce token'
            });
        }

        res.json({
            status: 'success',
            message: 'Métadonnées rafraîchies avec succès',
            data: metadata
        });

    } catch (error) {
        logger.error('Erreur PUT /api/metadata/:address/refresh:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * DELETE /api/metadata/:address
 *
 * Supprime les métadonnées d'un token
 */
router.delete('/:address', async (req, res) => {
    try {
        const { address } = req.params;

        const success = tokenMetadataService.deleteMetadata(address);

        if (!success) {
            return res.status(404).json({
                status: 'error',
                message: 'Métadonnées non trouvées'
            });
        }

        res.json({
            status: 'success',
            message: 'Métadonnées supprimées avec succès'
        });

    } catch (error) {
        logger.error('Erreur DELETE /api/metadata/:address:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

module.exports = router;
