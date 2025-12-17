/**
 * Token Storage Service
 * 
 * Manages in-memory storage of GitHub installation tokens including:
 * - Creating and storing token entries with metadata
 * - Retrieving tokens by ID or client ID
 * - Managing token lifecycle and expiration tracking
 * - Providing query methods for token status and cleanup
 * 
 * This service acts as the central repository for all active tokens
 * and provides efficient access patterns for the token lease server.
 */

class TokenStorage {
    constructor() {
        // Token storage for tracking and potential deletion: { tokenId: { clientId, token, expiresAt, createdAt } }
        this.storage = new Map();
        this.tokenCounter = 0;
    }

    /**
     * Generate a unique token ID
     */
    generateTokenId() {
        return `token_${++this.tokenCounter}_${Date.now()}`;
    }

    /**
     * Store a token entry
     */
    store(tokenEntry) {
        const tokenId = this.generateTokenId();
        const entry = {
            tokenId,
            ...tokenEntry,
            createdAt: Date.now()
        };
        
        this.storage.set(tokenId, entry);
        return entry;
    }

    /**
     * Get token by ID
     */
    get(tokenId) {
        return this.storage.get(tokenId);
    }

    /**
     * Get all tokens
     */
    getAll() {
        return Array.from(this.storage.values());
    }

    /**
     * Get tokens by client ID
     */
    getByClientId(clientId) {
        const tokens = [];
        this.storage.forEach((tokenData, tokenId) => {
            if (tokenData.clientId === clientId) {
                tokens.push({ tokenId, tokenData });
            }
        });
        return tokens;
    }

    /**
     * Delete token by ID
     */
    delete(tokenId) {
        return this.storage.delete(tokenId);
    }

    /**
     * Delete tokens by client ID
     */
    deleteByClientId(clientId) {
        const tokensToDelete = this.getByClientId(clientId);
        tokensToDelete.forEach(({ tokenId }) => {
            this.storage.delete(tokenId);
        });
        return tokensToDelete;
    }

    /**
     * Clear all tokens
     */
    clear() {
        const allTokens = this.getAll();
        this.storage.clear();
        return allTokens;
    }

    /**
     * Get storage size
     */
    get size() {
        return this.storage.size;
    }

    /**
     * Check if token exists
     */
    has(tokenId) {
        return this.storage.has(tokenId);
    }

    /**
     * Get expired tokens
     */
    getExpiredTokens() {
        const now = Date.now();
        const expiredTokens = [];
        
        this.storage.forEach((tokenData, tokenId) => {
            if (now > tokenData.expiresAt) {
                expiredTokens.push({ tokenId, tokenData });
            }
        });
        
        return expiredTokens;
    }

    /**
     * Get token status for API responses
     */
    getTokenStatus() {
        const tokenStatus = [];
        this.storage.forEach((tokenData, tokenId) => {
            tokenStatus.push({
                tokenId,
                clientId: tokenData.clientId,
                expiresAt: new Date(tokenData.expiresAt).toISOString(),
                createdAt: new Date(tokenData.createdAt).toISOString(),
                isExpired: Date.now() > tokenData.expiresAt,
                timeUntilExpiry: Math.max(0, tokenData.expiresAt - Date.now())
            });
        });
        return tokenStatus;
    }
}

module.exports = TokenStorage;