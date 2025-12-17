/**
 * GitHub Token Service
 * 
 * Handles GitHub App authentication and token management including:
 * - JWT token generation for GitHub App authentication
 * - Installation access token creation from GitHub API
 * - Token revocation through GitHub API
 * 
 * This service encapsulates all GitHub-specific token operations and
 * provides a clean interface for the token lease server.
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('./logger');

class GitHubTokenService {
    constructor(config, privateKey) {
        this.config = config;
        this.privateKey = privateKey;
    }

    /**
     * Generate JWT token for GitHub App authentication
     */
    generateJWT() {
        const payload = {
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (9 * 60), // <10 minutes expiration
            iss: this.config.appId
        };
        
        return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
    }

    /**
     * Generate installation access token from GitHub
     * @param {string[]} repositories - Optional array of repository names to limit access
     */
    async generateInstallationToken(repositories = null) {
        // Generate JWT
        const jwtToken = this.generateJWT();
        
        // Prepare request body
        const requestBody = {};
        if (repositories && repositories.length > 0) {
            requestBody.repositories = repositories;
            logger.debug({ repositories }, 'Requesting token with specific repository access');
        }
        
        try {
            const response = await axios.post(
                `https://api.github.com/app/installations/${this.config.installationId}/access_tokens`,
                requestBody,
                {
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'token-lease-server'
                    }
                }
            );
            
            logger.debug({ response: response.data }, '🔍 Full token response from GitHub');
            
            // Use custom tokenLifespan instead of GitHub's default 1-hour expiration
            const now = Date.now();
            const tokenLifespanMs = this.config.tokenLifespan;
            const customExpiresAt = now + tokenLifespanMs;
            
            // Parse GitHub's expires_at with detailed logging
            logger.debug({ customExpiresAt: new Date(customExpiresAt).toISOString(), tokenLifespanMs }, '🔍 Custom expiration calculated');
            
            return {
                token: response.data.token,
                expiresAt: customExpiresAt,
                permissions: response.data.permissions,
                repositorySelection: response.data.repository_selection
            };
        } catch (error) {
            logger.error({ error: error.response?.data || error.message }, 'Error getting installation access token');
            throw error;
        }
    }

    /**
     * Check GitHub API rate limit status using installation token
     */
    async getRateLimit() {
        try {
            // Generate a temporary installation token for rate limit check
            const tokenData = await this.generateInstallationToken();
            
            const response = await axios.get('https://api.github.com/rate_limit', {
                headers: {
                    Authorization: `token ${tokenData.token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'token-lease-server'
                }
            });
            
            // Optionally revoke the temporary token to keep things clean
            await this.revokeToken(tokenData.token);
            
            return {
                core: response.data.resources.core,
                integration_manifest: response.data.resources.integration_manifest || response.data.resources.integration,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error({ error: error.response?.data || error.message }, 'Error getting rate limit status');
            return null;
        }
    }

    /**
     * Revoke an installation access token
     */
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
            logger.info('✅ Token successfully revoked via GitHub API');
            return true;
        } catch (error) {
            logger.error({ error: error.response?.data || error.message }, '❌ Failed to revoke token via GitHub API');
            return false;
        }
    }
}

module.exports = GitHubTokenService;