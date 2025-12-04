const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');

class TokenLease {
    constructor(config = {}) {
        this.config = {
            port: config.port || process.env.PORT || 3000,
            appId: config.appId || process.env.APP_ID,
            installationId: config.installationId || process.env.INSTALLATION_ID,
            privateKeyPath: config.privateKeyPath || process.env.PRIVATE_KEY_PATH,
            cacheCheckInterval: config.cacheCheckInterval || process.env.CACHE_CHECK_INTERVAL || 60000, // 1 minute default
            tokenLifespan: config.tokenLifespan || process.env.TOKEN_LIFESPAN || 300000, // 5 minutes default
        };

        // Token storage for tracking and potential deletion: { tokenId: { clientId, token, expiresAt, createdAt } }
        this.tokenStorage = new Map();
        this.tokenCounter = 0;
        
        // Validate configuration
        this.validateConfig();
        
        // Load private key
        this.privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf8');
        
        // Setup Express app
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        
        // Start token cleanup interval
        this.startTokenCleanup();
        
        const lifespanMinutes = (this.config.tokenLifespan / 60000).toFixed(1);
        console.log('🔧 TokenLease initialized');
        console.log('🔄 Mode: Always generate fresh tokens (no caching)');
        console.log(`⏰ Token lifespan: ${this.config.tokenLifespan}ms (${lifespanMinutes} min)`);
        console.log(`🧹 Token cleanup interval: ${this.config.cacheCheckInterval}ms`);
    }

    validateConfig() {
        if (!this.config.appId) {
            throw new Error('❌ APP_ID is required');
        }
        if (!this.config.installationId) {
            throw new Error('❌ INSTALLATION_ID is required');
        }
        if (!fs.existsSync(this.config.privateKeyPath)) {
            throw new Error(`❌ Private key file not found: ${this.config.privateKeyPath}`);
        }
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                storedTokens: this.tokenStorage.size,
                mode: 'fresh-tokens-only',
                tokenLifespanMs: this.config.tokenLifespan,
                tokenLifespanMinutes: (this.config.tokenLifespan / 60000).toFixed(1),
                version: '2.1.0'
            });
        });

        // Get token for a client
        this.app.get('/token/:clientId?', async (req, res) => {
            try {
                const clientId = req.params.clientId || 'default';
                const token = await this.getTokenForClient(clientId);
                
                res.json({
                    success: true,
                    clientId,
                    token: token.token,
                    expiresAt: new Date(token.expiresAt).toISOString(),
                    createdAt: new Date(token.createdAt).toISOString(),
                    cached: token.cached
                });
            } catch (error) {
                console.error('❌ Error getting token:', error.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate token',
                    message: error.message
                });
            }
        });

        // Get stored tokens status
        this.app.get('/tokens', (req, res) => {
            const tokenStatus = [];
            this.tokenStorage.forEach((tokenData, tokenId) => {
                tokenStatus.push({
                    tokenId,
                    clientId: tokenData.clientId,
                    expiresAt: new Date(tokenData.expiresAt).toISOString(),
                    createdAt: new Date(tokenData.createdAt).toISOString(),
                    isExpired: Date.now() > tokenData.expiresAt,
                    timeUntilExpiry: Math.max(0, tokenData.expiresAt - Date.now())
                });
            });

            res.json({
                success: true,
                totalTokens: this.tokenStorage.size,
                mode: 'fresh-tokens-only',
                tokens: tokenStatus
            });
        });

        // Delete tokens by ID or by client, or clear all
        this.app.delete('/tokens/:identifier?', async (req, res) => {
            const identifier = req.params.identifier;
            
            if (identifier) {
                // Try to delete by token ID first
                if (this.tokenStorage.has(identifier)) {
                    const tokenData = this.tokenStorage.get(identifier);
                    console.log(`🔄 Revoking token: ${identifier} (client: ${tokenData.clientId})`);
                    const revoked = await this.revokeToken(tokenData.token);
                    this.tokenStorage.delete(identifier);
                    console.log(`🗑️ Token deleted: ${identifier} (client: ${tokenData.clientId})`);
                    res.json({
                        success: true,
                        message: `Token ${identifier} deleted${revoked ? ' and revoked' : ' (revocation failed)'}`,
                        tokenId: identifier,
                        clientId: tokenData.clientId,
                        revoked
                    });
                } else {
                    // Try to delete by client ID
                    let deletedCount = 0;
                    let revokedCount = 0;
                    const deletedTokens = [];
                    const tokensToDelete = [];
                    
                    this.tokenStorage.forEach((tokenData, tokenId) => {
                        if (tokenData.clientId === identifier) {
                            tokensToDelete.push({ tokenId, tokenData });
                        }
                    });
                    
                    for (const { tokenId, tokenData } of tokensToDelete) {
                        console.log(`🔄 Revoking token: ${tokenId} (client: ${tokenData.clientId})`);
                        const revoked = await this.revokeToken(tokenData.token);
                        if (revoked) revokedCount++;
                        this.tokenStorage.delete(tokenId);
                        deletedTokens.push(tokenId);
                        deletedCount++;
                    }
                    
                    if (deletedCount > 0) {
                        console.log(`🗑️ Deleted ${deletedCount} tokens for client: ${identifier} (${revokedCount} revoked)`);
                        res.json({
                            success: true,
                            message: `Deleted ${deletedCount} tokens for client: ${identifier} (${revokedCount} revoked)`,
                            clientId: identifier,
                            deletedTokens,
                            revokedCount
                        });
                    } else {
                        res.json({
                            success: false,
                            message: `No tokens found for identifier: ${identifier}`
                        });
                    }
                }
            } else {
                const size = this.tokenStorage.size;
                let revokedCount = 0;
                const tokensToRevoke = [];
                
                this.tokenStorage.forEach((tokenData, tokenId) => {
                    tokensToRevoke.push({ tokenId, tokenData });
                });
                
                for (const { tokenId, tokenData } of tokensToRevoke) {
                    console.log(`🔄 Revoking token: ${tokenId} (client: ${tokenData.clientId})`);
                    const revoked = await this.revokeToken(tokenData.token);
                    if (revoked) revokedCount++;
                }
                
                this.tokenStorage.clear();
                console.log(`🗑️ Cleared all ${size} tokens from storage (${revokedCount} revoked)`);
                res.json({
                    success: true,
                    message: `Cleared ${size} tokens from storage (${revokedCount} revoked)`,
                    cleared: size,
                    revokedCount
                });
            }
        });
    }

    async getTokenForClient(clientId) {
        // Always generate a fresh token
        console.log(`🔄 Generating fresh token for client: ${clientId}...`);
        const tokenData = await this.generateInstallationToken();

        // Store token for tracking and potential deletion
        const tokenId = `token_${++this.tokenCounter}_${Date.now()}`;
        const createTime = Date.now();
        console.log(`🔍 DEBUG - Token will expire at timestamp: ${tokenData.expiresAt};`);

        const tokenEntry = {
            tokenId,
            clientId,
            token: tokenData.token,
            expiresAt: tokenData.expiresAt,
            createdAt: createTime,
            cached: false
        };
        
        this.tokenStorage.set(tokenId, tokenEntry);
        
        console.log(`✅ Fresh token generated for client: ${clientId} (ID: ${tokenId})`);
        console.log(`📊 Total tokens in storage: ${this.tokenStorage.size}`);
        return tokenEntry;
    }

    async generateInstallationToken() {
        // Generate JWT
        const jwtToken = this.generateJWT();
        
        try {
            const response = await axios.post(
                `https://api.github.com/app/installations/${this.config.installationId}/access_tokens`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'token-lease-server'
                    }
                }
            );
            
            console.log('🔍 DEBUG - Full token response:', JSON.stringify(response.data, null, 2));
            
            // Use custom tokenLifespan instead of GitHub's default 1-hour expiration
            const now = Date.now();
            const tokenLifespanMs = Number(this.config.tokenLifespan);
            const customExpiresAt = now + tokenLifespanMs;
            
            // Parse GitHub's expires_at with detailed logging
            console.log(`🔍 DEBUG - customExpiresAt formatted: "${new Date(customExpiresAt).toISOString()}"`);
            
            return {
                token: response.data.token,
                expiresAt: customExpiresAt
            };
        } catch (error) {
            console.error('Error getting installation access token:', error.response?.data || error.message);
            throw error;
        }
    }

    generateJWT() {
        const payload = {
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (9 * 60), // <10 minutes expiration
            iss: this.config.appId
        };
        
        return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
    }

    async revokeToken(token) {
        try {
            await axios.delete(
                `https://api.github.com/installation/token`,
                {
                    headers: {
                        Authorization: `token ${token}`,
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'token-lease-server'
                    }
                }
            );
            console.log('✅ Token successfully revoked via GitHub API');
            return true;
        } catch (error) {
            console.error('❌ Failed to revoke token via GitHub API:', error.response?.data || error.message);
            return false;
        }
    }

    startTokenCleanup() {
        this.cacheCheckInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, this.config.cacheCheckInterval);
        
        const minutes = (this.config.cacheCheckInterval / 60000).toFixed(1);
        console.log(`🧹 Token cleanup check every ${this.config.cacheCheckInterval}ms (${minutes} min)`);
    }

    async cleanupExpiredTokens() {
        console.log(`🔍 Token cleanup check started - checking ${this.tokenStorage.size} tokens`);
        let cleanedCount = 0;
        let revokedCount = 0;
        const now = Date.now();
        
        const expiredTokens = [];
        this.tokenStorage.forEach((tokenData, tokenId) => {
            // Check against our custom expiration time
            if (now > tokenData.expiresAt) {
                expiredTokens.push({ tokenId, tokenData });
            }
        });

        for (const { tokenId, tokenData } of expiredTokens) {
            console.log(`🔄 Revoking expired token: ${tokenId} (client: ${tokenData.clientId})`);
            const revoked = await this.revokeToken(tokenData.token);
            if (revoked) {
                revokedCount++;
            }
            this.tokenStorage.delete(tokenId);
            cleanedCount++;
            console.log(`🗑️ Expired token removed: ${tokenId} (client: ${tokenData.clientId})`);
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Token cleanup completed: removed ${cleanedCount} expired tokens (${revokedCount} revoked via API)`);
        } else {
            console.log(`🧹 Token cleanup completed: no expired tokens found`);
        }
        console.log(`📊 Remaining tokens in storage: ${this.tokenStorage.size}`);
    }

    start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.config.port, () => {
                console.log('🚀 Token Lease Server Started');
                console.log(`📡 Server running on http://localhost:${this.config.port}`);
                console.log(`🔧 App ID: ${this.config.appId}`);
                console.log(`🏢 Installation ID: ${this.config.installationId}`);
                console.log('');
                console.log('📋 Available endpoints:');
                console.log(`  GET  /health             - Health check`);
                console.log(`  GET  /token/:clientId    - Get fresh token for specific client`);
                console.log(`  GET  /token              - Get fresh token for default client`);
                console.log(`  GET  /tokens             - View stored tokens status`);
                console.log(`  DELETE /tokens/:id       - Delete token by ID or client`);
                console.log(`  DELETE /tokens           - Clear all stored tokens`);
                console.log('');
                console.log('🔄 Mode: Fresh tokens always generated (no caching)');
                console.log('');
                resolve();
            });
        });
    }

    stop() {
        if (this.cacheCheckInterval) {
            clearInterval(this.cacheCheckInterval);
        }
        if (this.server) {
            this.server.close();
        }
        console.log('🛑 Token Lease Server stopped');
    }
}

module.exports = TokenLease;