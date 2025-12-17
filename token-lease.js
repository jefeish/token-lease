/**
 * Token Lease Server
 * 
 * Main orchestrator class for the GitHub App installation token lease service.
 * Provides a RESTful API for generating, managing, and tracking GitHub installation
 * access tokens with custom expiration times.
 * 
 * Features:
 * - Fresh token generation (no caching by default)
 * - Custom token lifespans
 * - Automatic token cleanup and revocation
 * - Multi-client token management
 * - RESTful API for token operations
 * 
 * This class initializes and coordinates all service modules to provide
 * a complete token leasing solution for GitHub Apps.
 */

const express = require('express');
const cors = require('cors');

// Import modules
const logger = require('./modules/logger');
const ConfigValidator = require('./modules/config-validator');
const TokenStorage = require('./modules/token-storage');
const GitHubTokenService = require('./modules/github-token-service');
const TokenCleanupService = require('./modules/token-cleanup-service');
const ApiRoutes = require('./modules/api-routes');

class TokenLease {
    constructor(config = {}) {
        // Load and validate configuration
        this.config = ConfigValidator.loadDefaults(config);
        ConfigValidator.validate(this.config);
        
        // Load private key
        this.privateKey = ConfigValidator.loadPrivateKey(this.config.privateKeyPath);
        
        // Initialize services
        this.tokenStorage = new TokenStorage();
        this.githubTokenService = new GitHubTokenService(this.config, this.privateKey);
        this.tokenCleanupService = new TokenCleanupService(
            this.tokenStorage, 
            this.githubTokenService, 
            this.config
        );
        
        // Setup Express app
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        
        // Start token cleanup interval
        this.tokenCleanupService.start();
        
        this.logInitialization();
    }

    logInitialization() {
        const lifespanMinutes = (this.config.tokenLifespan / 60000).toFixed(1);
        logger.info('🔧 TokenLease initialized');
        logger.info('🔄 Mode: Always generate fresh tokens (no caching)');
        logger.info(`⏰ Token lifespan: ${this.config.tokenLifespan}ms (${lifespanMinutes} min)`);
        logger.info(`🧹 Token cleanup interval: ${this.config.cacheCheckInterval}ms`);
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    setupRoutes() {
        // Initialize API routes
        const apiRoutes = new ApiRoutes(
            this.tokenStorage,
            this.githubTokenService,
            this.tokenCleanupService,
            this.config
        );
        
        // Use the API routes
        this.app.use('/', apiRoutes.getRouter());
    }

    // Legacy methods for backward compatibility - delegate to services
    async getTokenForClient(clientId) {
        const apiRoutes = new ApiRoutes(
            this.tokenStorage,
            this.githubTokenService,
            this.tokenCleanupService,
            this.config
        );
        return await apiRoutes.getTokenForClient(clientId);
    }

    async generateInstallationToken() {
        return await this.githubTokenService.generateInstallationToken();
    }

    generateJWT() {
        return this.githubTokenService.generateJWT();
    }

    async revokeToken(token) {
        return await this.githubTokenService.revokeToken(token);
    }

    startTokenCleanup() {
        this.tokenCleanupService.start();
    }

    async cleanupExpiredTokens() {
        return await this.tokenCleanupService.cleanupExpiredTokens();
    }

    start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.config.port, () => {
                logger.info({ port: this.config.port, appId: this.config.appId, installationId: this.config.installationId }, '🚀 Token Lease Server Started');
                logger.info(`📡 Server running on http://localhost:${this.config.port}`);
                logger.info('');
                logger.info('📋 Available endpoints:');
                logger.info(`  GET  /health             - Health check`);
                logger.info(`  GET  /token/:clientId    - Get fresh token for specific client`);
                logger.info(`  GET  /token              - Get fresh token for default client`);
                logger.info(`  GET  /tokens             - View stored tokens status`);
                logger.info(`  DELETE /tokens/:id       - Delete token by ID or client`);
                logger.info(`  DELETE /tokens           - Clear all stored tokens`);
                logger.info('');
                logger.info('🔄 Mode: Fresh tokens always generated (no caching)');
                logger.info('');
                resolve();
            });
        });
    }

    stop() {
        this.tokenCleanupService.stop();
        if (this.server) {
            this.server.close();
        }
        logger.info('🛑 Token Lease Server stopped');
    }
}

module.exports = TokenLease;