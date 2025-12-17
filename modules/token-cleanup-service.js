/**
 * Token Cleanup Service
 * 
 * Manages automated cleanup of expired tokens including:
 * - Running periodic cleanup intervals
 * - Identifying expired tokens in storage
 * - Revoking expired tokens through GitHub API
 * - Removing expired tokens from local storage
 * 
 * This service ensures that expired tokens are properly cleaned up
 * to prevent storage bloat and maintain security hygiene.
 */

const logger = require('./logger');

class TokenCleanupService {
    constructor(tokenStorage, githubTokenService, config) {
        this.tokenStorage = tokenStorage;
        this.githubTokenService = githubTokenService;
        this.config = config;
        this.cleanupInterval = null;
    }

    /**
     * Start the token cleanup interval
     */
    start() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, this.config.cacheCheckInterval);
        
        const minutes = (this.config.cacheCheckInterval / 60000).toFixed(1);
        logger.info({ interval: this.config.cacheCheckInterval, intervalMinutes: minutes }, `🧹 Token cleanup check every ${this.config.cacheCheckInterval}ms (${minutes} min)`);
    }

    /**
     * Stop the token cleanup interval
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Clean up expired tokens
     */
    async cleanupExpiredTokens() {
        logger.debug({ totalTokens: this.tokenStorage.size }, `🔍 Token cleanup check started`);
        let cleanedCount = 0;
        let revokedCount = 0;
        const now = Date.now();
        
        const expiredTokens = this.tokenStorage.getExpiredTokens();

        for (const { tokenId, tokenData } of expiredTokens) {
            logger.info({ tokenId, clientId: tokenData.clientId }, `🔄 Revoking expired token: ${tokenId}`);
            const revoked = await this.githubTokenService.revokeToken(tokenData.token);
            if (revoked) {
                revokedCount++;
            }
            this.tokenStorage.delete(tokenId);
            cleanedCount++;
            logger.debug({ tokenId, clientId: tokenData.clientId }, `🗑️ Expired token removed: ${tokenId}`);
        }

        if (cleanedCount > 0) {
            logger.info({ cleaned: cleanedCount, revoked: revokedCount, remaining: this.tokenStorage.size }, `🧹 Token cleanup completed: removed ${cleanedCount} expired tokens`);
        } else {
            logger.debug({ remaining: this.tokenStorage.size }, `🧹 Token cleanup completed: no expired tokens found`);
        }
    }
}

module.exports = TokenCleanupService;