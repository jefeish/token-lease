/**
 * Configuration Validator
 * 
 * Handles configuration validation and initialization including:
 * - Loading default configuration values from environment variables
 * - Validating required configuration parameters
 * - Loading and verifying private key files
 * - Providing consistent configuration structure
 * 
 * This utility ensures that the token lease server starts with
 * valid configuration and provides helpful error messages for
 * missing or invalid settings.
 */

const fs = require('fs');

class ConfigValidator {
    static validate(config) {
        if (!config.appId) {
            throw new Error('❌ APP_ID is required');
        }
        if (!config.installationId) {
            throw new Error('❌ INSTALLATION_ID is required');
        }
        if (!fs.existsSync(config.privateKeyPath)) {
            throw new Error(`❌ Private key file not found: ${config.privateKeyPath}`);
        }
    }

    static loadDefaults(config = {}) {
        return {
            port: config.port || process.env.PORT || 3000,
            appId: config.appId || process.env.APP_ID,
            installationId: config.installationId || process.env.INSTALLATION_ID,
            privateKeyPath: config.privateKeyPath || process.env.PRIVATE_KEY_PATH,
            cacheCheckInterval: Number(config.cacheCheckInterval || process.env.CACHE_CHECK_INTERVAL || 60000), // 1 minute default
            tokenLifespan: Number(config.tokenLifespan || process.env.TOKEN_LIFESPAN || 300000), // 5 minutes default
        };
    }

    static loadPrivateKey(privateKeyPath) {
        return fs.readFileSync(privateKeyPath, 'utf8');
    }
}

module.exports = ConfigValidator;