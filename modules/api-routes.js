/**
 * API Routes
 * 
 * Defines HTTP API endpoints for the token lease server including:
 * - Health check endpoint for service status
 * - Token generation endpoints for different clients
 * - Token status and listing endpoints
 * - Token deletion and cleanup endpoints
 * 
 * This module handles all HTTP request/response logic and integrates
 * with the token storage, GitHub token service, and cleanup service
 * to provide a complete REST API for token management.
 */

const express = require('express');
const cors = require('cors');
const logger = require('./logger');

class ApiRoutes {
    constructor(tokenStorage, githubTokenService, tokenCleanupService, config) {
        this.tokenStorage = tokenStorage;
        this.githubTokenService = githubTokenService;
        this.tokenCleanupService = tokenCleanupService;
        this.config = config;
        this.router = express.Router();
        
        this.setupRoutes();
    }

    setupRoutes() {
        // Health check
        this.router.get('/health', (req, res) => {
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

        // Get token for a client (GET request)
        this.router.get('/token/:clientId?', async (req, res) => {
            const clientId = req.params.clientId || 'default';
            try {
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
                logger.error({ error: error.message, clientId }, '❌ Error getting token');
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate token',
                    message: error.message
                });
            }
        });

        // Get token for a client with repository specification (POST request)
        this.router.post('/token/:clientId?', async (req, res) => {
            const clientId = req.params.clientId || 'default';
            try {
                const { repositories } = req.body;
                
                // Validate repositories parameter
                if (repositories && (!Array.isArray(repositories) || repositories.some(repo => typeof repo !== 'string'))) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid repositories parameter',
                        message: 'repositories must be an array of strings'
                    });
                }
                
                const token = await this.getTokenForClient(clientId, repositories);
                
                res.json({
                    success: true,
                    clientId,
                    token: token.token,
                    expiresAt: new Date(token.expiresAt).toISOString(),
                    createdAt: new Date(token.createdAt).toISOString(),
                    cached: token.cached,
                    repositories: repositories || 'all'
                });
            } catch (error) {
                logger.error({ error: error.message, clientId, repositories: req.body.repositories }, '❌ Error getting token with repositories');
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate token',
                    message: error.message
                });
            }
        });

        // Get stored tokens status
        this.router.get('/tokens', (req, res) => {
            const tokenStatus = this.tokenStorage.getTokenStatus();
            
            res.json({
                success: true,
                totalTokens: this.tokenStorage.size,
                mode: 'fresh-tokens-only',
                tokens: tokenStatus
            });
        });

        // Delete tokens by ID or by client, or clear all
        this.router.delete('/tokens/:identifier?', async (req, res) => {
            const identifier = req.params.identifier;
            
            if (identifier) {
                await this.handleTokenDeletion(identifier, res);
            } else {
                await this.handleClearAllTokens(res);
            }
        });

        // Web dashboard endpoint
        this.router.get('/dashboard', async (req, res) => {
            const tokenStatus = this.tokenStorage.getTokenStatus();
            const rateLimitInfo = await this.githubTokenService.getRateLimit();
            
            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Token Lease Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        .status-badge {
            font-size: 0.8rem;
        }
        .token-preview {
            font-family: monospace;
            font-size: 0.9rem;
        }
        .refresh-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 1000;
        }
        .card-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .table-hover tbody tr:hover {
            background-color: rgba(0,0,0,.05);
        }
    </style>
</head>
<body class="bg-light">
    <div class="container-fluid py-4">
        <div class="row">
            <div class="col-12">
                <div class="card shadow">
                    <div class="card-header">
                        <div class="d-flex justify-content-between align-items-center">
                            <h4 class="mb-0"><i class="fas fa-key me-2"></i>Token Dispatcher Dashboard</h4>
                            ${rateLimitInfo ? `
                            <div class="text-end">
                                <small class="opacity-75">GitHub API Rate Limit</small><br>
                                <span class="badge ${rateLimitInfo.core.remaining > 1000 ? 'bg-success' : rateLimitInfo.core.remaining > 100 ? 'bg-warning' : 'bg-danger'}">
                                    ${rateLimitInfo.core.remaining}/${rateLimitInfo.core.limit}
                                </span>
                                <small class="opacity-75 ms-2">
                                    Reset: ${new Date(rateLimitInfo.core.reset * 1000).toLocaleTimeString()}
                                </small>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="card-body">
                        <!-- Tokens Table -->
                        ${tokenStatus.length > 0 ? `
                        <div class="table-responsive">
                            <table class="table table-hover table-striped">
                                <thead class="table-dark">
                                    <tr>
                                        <th><i class="fas fa-hashtag"></i> Token ID</th>
                                        <th><i class="fas fa-user"></i> Client ID</th>
                                        <th><i class="fas fa-key"></i> Token Preview</th>
                                        <th><i class="fas fa-clock"></i> Status</th>
                                        <th><i class="fas fa-hourglass-half"></i> Time Until Expiry</th>
                                        <th><i class="fas fa-calendar-alt"></i> Created</th>
                                        <th><i class="fas fa-calendar-times"></i> Expires</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tokenStatus.map(token => `
                                    <tr>
                                        <td>
                                            <code class="text-muted">${token.tokenId}</code>
                                        </td>
                                        <td>
                                            <span class="badge bg-secondary">${token.clientId}</span>
                                        </td>
                                        <td>
                                            <span class="token-preview text-muted">
                                                ${token.tokenPreview || 'ghs_****...****'}
                                            </span>
                                        </td>
                                        <td>
                                            ${token.isExpired 
                                                ? '<span class="badge bg-danger status-badge"><i class="fas fa-times-circle"></i> Expired</span>'
                                                : '<span class="badge bg-success status-badge"><i class="fas fa-check-circle"></i> Active</span>'
                                            }
                                        </td>
                                        <td>
                                            ${token.isExpired 
                                                ? '<span class="text-danger">Expired</span>'
                                                : `<span class="text-success">${Math.round(token.timeUntilExpiry / 1000)}s</span>`
                                            }
                                        </td>
                                        <td>
                                            <small class="text-muted">
                                                ${new Date(token.createdAt).toLocaleString()}
                                            </small>
                                        </td>
                                        <td>
                                            <small class="text-muted">
                                                ${new Date(token.expiresAt).toLocaleString()}
                                            </small>
                                        </td>
                                    </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ` : `
                        <div class="text-center py-5">
                            <i class="fas fa-key fa-3x text-muted mb-3"></i>
                            <h4 class="text-muted">No Tokens Found</h4>
                            <p class="text-muted">No tokens are currently stored in the system.</p>
                            <a href="/token" class="btn btn-primary">
                                <i class="fas fa-plus"></i> Generate Token
                            </a>
                        </div>
                        `}

                        <!-- API Endpoints -->
                        <div class="mt-4">
                            <h5 class="mb-3">
                                <button class="btn btn-link p-0 text-decoration-none d-flex align-items-center" 
                                        type="button" 
                                        data-bs-toggle="collapse" 
                                        data-bs-target="#apiEndpoints" 
                                        aria-expanded="false" 
                                        aria-controls="apiEndpoints">
                                    <i class="fas fa-plug me-2"></i>
                                    Available API Endpoints
                                    <i class="fas fa-chevron-down ms-2" id="chevronIcon"></i>
                                </button>
                            </h5>
                            <div class="collapse" id="apiEndpoints">
                                <div class="row">
                                    <div class="col-md-6">
                                        <ul class="list-group">
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>GET /health</code></span>
                                                <span class="badge bg-info">Status</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>GET /token</code></span>
                                                <span class="badge bg-success">Generate</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>GET /token/:clientId</code></span>
                                                <span class="badge bg-success">Generate</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>POST /token/:clientId</code></span>
                                                <span class="badge bg-primary">Scoped</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div class="col-md-6">
                                        <ul class="list-group">
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>GET /tokens</code></span>
                                                <span class="badge bg-info">List</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>DELETE /tokens</code></span>
                                                <span class="badge bg-danger">Clear All</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>DELETE /tokens/:id</code></span>
                                                <span class="badge bg-warning">Delete</span>
                                            </li>
                                            <li class="list-group-item d-flex justify-content-between">
                                                <span><code>GET /dashboard</code></span>
                                                <span class="badge bg-secondary">Web UI</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer text-muted text-center">
                        <small>
                            <i class="fas fa-clock"></i> Last updated: ${new Date().toLocaleString()} | 
                            <i class="fas fa-server"></i> Mode: fresh-tokens-only |
                            <i class="fas fa-hourglass-half"></i> Token Lifespan: ${(this.config.tokenLifespan / 60000).toFixed(1)} minutes
                        </small>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Refresh Button -->
    <button class="btn btn-primary refresh-btn btn-lg rounded-circle" onclick="window.location.reload()" title="Refresh Dashboard">
        <i class="fas fa-sync-alt"></i>
    </button>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => {
            window.location.reload();
        }, 30000);
        
        // Add tooltips
        document.addEventListener('DOMContentLoaded', function() {
            var tooltipTriggerList = [].slice.call(document.querySelectorAll('[title]'));
            var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl);
            });

            // Handle collapsible section chevron rotation
            const apiEndpointsCollapse = document.getElementById('apiEndpoints');
            const chevronIcon = document.getElementById('chevronIcon');
            
            apiEndpointsCollapse.addEventListener('show.bs.collapse', function () {
                chevronIcon.classList.remove('fa-chevron-down');
                chevronIcon.classList.add('fa-chevron-up');
            });
            
            apiEndpointsCollapse.addEventListener('hide.bs.collapse', function () {
                chevronIcon.classList.remove('fa-chevron-up');
                chevronIcon.classList.add('fa-chevron-down');
            });
        });
    </script>
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        });
    }

    async getTokenForClient(clientId, repositories = null) {
        // Always generate a fresh token
        logger.info({ clientId, repositories }, `🔄 Generating fresh token for client: ${clientId}...`);
        const tokenData = await this.githubTokenService.generateInstallationToken(repositories);
        
        // Store token for tracking and potential deletion
        const createTime = Date.now();
        const expiresAt = createTime + this.config.tokenLifespan;

        logger.debug({ clientId, expiresAt: new Date(expiresAt).toISOString(), tokenLifespan: this.config.tokenLifespan }, `🔍 Token expiration calculated`);
        
        const tokenEntry = this.tokenStorage.store({
            clientId,
            token: tokenData.token,
            expiresAt: expiresAt,
            cached: false
        });
        
        logger.info({ clientId, tokenId: tokenEntry.tokenId, totalTokens: this.tokenStorage.size, repositories }, `✅ Fresh token generated for client: ${clientId}`);
        return tokenEntry;
    }

    async handleTokenDeletion(identifier, res) {
        // Try to delete by token ID first
        if (this.tokenStorage.has(identifier)) {
            const tokenData = this.tokenStorage.get(identifier);
            logger.info({ tokenId: identifier, clientId: tokenData.clientId }, `🔄 Revoking token: ${identifier}`);
            const revoked = await this.githubTokenService.revokeToken(tokenData.token);
            this.tokenStorage.delete(identifier);
            logger.info({ tokenId: identifier, clientId: tokenData.clientId, revoked }, `🗑️ Token deleted: ${identifier}`);
            res.json({
                success: true,
                message: `Token ${identifier} deleted${revoked ? ' and revoked' : ' (revocation failed)'}`,
                tokenId: identifier,
                clientId: tokenData.clientId,
                revoked
            });
        } else {
            // Try to delete by client ID
            const tokensToDelete = this.tokenStorage.getByClientId(identifier);
            
            if (tokensToDelete.length > 0) {
                let revokedCount = 0;
                const deletedTokens = [];
                
                for (const { tokenId, tokenData } of tokensToDelete) {
                    logger.info({ tokenId, clientId: tokenData.clientId }, `🔄 Revoking token: ${tokenId}`);
                    const revoked = await this.githubTokenService.revokeToken(tokenData.token);
                    if (revoked) revokedCount++;
                    this.tokenStorage.delete(tokenId);
                    deletedTokens.push(tokenId);
                }
                
                logger.info({ clientId: identifier, deleted: tokensToDelete.length, revoked: revokedCount }, `🗑️ Deleted ${tokensToDelete.length} tokens for client: ${identifier}`);
                res.json({
                    success: true,
                    message: `Deleted ${tokensToDelete.length} tokens for client: ${identifier} (${revokedCount} revoked)`,
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
    }

    async handleClearAllTokens(res) {
        const allTokens = this.tokenStorage.getAll();
        const size = allTokens.length;
        let revokedCount = 0;
        
        for (const tokenData of allTokens) {
            logger.info({ tokenId: tokenData.tokenId, clientId: tokenData.clientId }, `🔄 Revoking token: ${tokenData.tokenId}`);
            const revoked = await this.githubTokenService.revokeToken(tokenData.token);
            if (revoked) revokedCount++;
        }
        
        this.tokenStorage.clear();
        logger.info({ cleared: size, revoked: revokedCount }, `🗑️ Cleared all ${size} tokens from storage`);
        res.json({
            success: true,
            message: `Cleared ${size} tokens from storage (${revokedCount} revoked)`,
            cleared: size,
            revokedCount
        });
    }

    getRouter() {
        return this.router;
    }
}

module.exports = ApiRoutes;