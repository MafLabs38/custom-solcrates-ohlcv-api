const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../config/logger');

class LogoDownloader {
    constructor() {
        this.logoDir = path.join(__dirname, '../../data/logos');
        this.ensureLogoDirectory();
    }

    /**
     * S'assurer que le répertoire des logos existe
     */
    ensureLogoDirectory() {
        if (!fs.existsSync(this.logoDir)) {
            fs.mkdirSync(this.logoDir, { recursive: true });
            logger.info('Répertoire des logos créé:', this.logoDir);
        }
    }

    /**
     * Obtenir l'extension du fichier depuis l'URL
     */
    getFileExtension(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const ext = path.extname(pathname);

            // Si pas d'extension ou extension invalide, utiliser .png par défaut
            if (!ext || !['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext.toLowerCase())) {
                return '.png';
            }

            return ext.toLowerCase();
        } catch (error) {
            return '.png';
        }
    }

    /**
     * Télécharger un logo depuis une URL et le sauvegarder localement
     * @param {string} logoUrl - URL du logo à télécharger
     * @param {string} contractAddress - Adresse du contrat (utilisé comme nom de fichier)
     * @returns {Promise<string|null>} - Chemin local du logo ou null si échec
     */
    async downloadLogo(logoUrl, contractAddress) {
        if (!logoUrl || !contractAddress) {
            return null;
        }

        try {
            const ext = this.getFileExtension(logoUrl);
            const filename = `${contractAddress}${ext}`;
            const filepath = path.join(this.logoDir, filename);

            // Vérifier si le logo existe déjà
            if (fs.existsSync(filepath)) {
                logger.debug(`Logo déjà existant pour ${contractAddress}`);
                return `/logos/${filename}`;
            }

            // Télécharger l'image
            logger.info(`Téléchargement du logo: ${logoUrl}`);
            const response = await axios.get(logoUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            // Vérifier le type MIME
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                logger.warn(`Type de contenu invalide pour ${logoUrl}: ${contentType}`);
                return null;
            }

            // Sauvegarder le fichier
            fs.writeFileSync(filepath, response.data);
            logger.info(`✅ Logo sauvegardé: ${filename} (${(response.data.length / 1024).toFixed(2)} KB)`);

            // Retourner le chemin relatif pour l'URL
            return `/logos/${filename}`;

        } catch (error) {
            logger.error(`Erreur lors du téléchargement du logo pour ${contractAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Supprimer un logo local
     * @param {string} contractAddress - Adresse du contrat
     * @returns {boolean} - true si supprimé avec succès
     */
    deleteLogo(contractAddress) {
        try {
            // Chercher tous les fichiers commençant par l'adresse du contrat
            const files = fs.readdirSync(this.logoDir);
            const logoFiles = files.filter(f => f.startsWith(contractAddress));

            if (logoFiles.length === 0) {
                return false;
            }

            logoFiles.forEach(file => {
                const filepath = path.join(this.logoDir, file);
                fs.unlinkSync(filepath);
                logger.info(`Logo supprimé: ${file}`);
            });

            return true;
        } catch (error) {
            logger.error(`Erreur lors de la suppression du logo pour ${contractAddress}:`, error.message);
            return false;
        }
    }

    /**
     * Obtenir le chemin local d'un logo
     * @param {string} contractAddress - Adresse du contrat
     * @returns {string|null} - Chemin relatif du logo ou null si non trouvé
     */
    getLocalLogoPath(contractAddress) {
        try {
            const files = fs.readdirSync(this.logoDir);
            const logoFile = files.find(f => f.startsWith(contractAddress));

            if (logoFile) {
                return `/logos/${logoFile}`;
            }

            return null;
        } catch (error) {
            logger.error(`Erreur lors de la recherche du logo pour ${contractAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Nettoyer les logos orphelins (logos sans token correspondant)
     * @param {Array<string>} validContractAddresses - Liste des adresses de contrat valides
     * @returns {number} - Nombre de logos supprimés
     */
    cleanupOrphanedLogos(validContractAddresses) {
        try {
            const files = fs.readdirSync(this.logoDir);
            let deletedCount = 0;

            files.forEach(file => {
                const contractAddress = file.split('.')[0];

                if (!validContractAddresses.includes(contractAddress)) {
                    const filepath = path.join(this.logoDir, file);
                    fs.unlinkSync(filepath);
                    logger.info(`Logo orphelin supprimé: ${file}`);
                    deletedCount++;
                }
            });

            return deletedCount;
        } catch (error) {
            logger.error('Erreur lors du nettoyage des logos orphelins:', error.message);
            return 0;
        }
    }
}

module.exports = new LogoDownloader();
