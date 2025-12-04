const axios = require('axios');
const TokenLease = require('../token-lease');
const fs = require('fs');

// Mock dependencies
jest.mock('fs');
jest.mock('axios');

describe('TokenLease Server - Unit Tests', () => {
    let tokenLease;
    let mockConfig;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock fs.readFileSync for private key
        fs.readFileSync.mockReturnValue('mock-private-key');
        fs.existsSync.mockReturnValue(true);

        mockConfig = {
            port: 3001,
            appId: 'test-app-id',
            installationId: 'test-installation-id',
            privateKeyPath: '/mock/path/to/key.pem',
            tokenLifespan: 300000, // 5 minutes
            cacheCheckInterval: 60000 // 1 minute
        };

        tokenLease = new TokenLease(mockConfig);
    });

    afterEach(async () => {
        if (tokenLease && tokenLease.server) {
            tokenLease.stop();
        }
    });

    describe('Constructor', () => {
        test('should initialize with default config values', () => {
            const defaultTokenLease = new TokenLease({
                appId: 'test-app',
                installationId: 'test-install',
                privateKeyPath: '/mock/key.pem'
            });

            expect(defaultTokenLease.config.port).toBe(3000);
            expect(defaultTokenLease.config.tokenLifespan).toBe(300000);
            expect(defaultTokenLease.config.cacheCheckInterval).toBe(60000);
        });

        test('should throw error if APP_ID is missing', () => {
            expect(() => {
                new TokenLease({
                    installationId: 'test-install',
                    privateKeyPath: '/mock/key.pem'
                });
            }).toThrow('❌ APP_ID is required');
        });

        test('should throw error if INSTALLATION_ID is missing', () => {
            expect(() => {
                new TokenLease({
                    appId: 'test-app',
                    privateKeyPath: '/mock/key.pem'
                });
            }).toThrow('❌ INSTALLATION_ID is required');
        });

        test('should throw error if private key file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            expect(() => {
                new TokenLease({
                    appId: 'test-app',
                    installationId: 'test-install',
                    privateKeyPath: '/nonexistent/key.pem'
                });
            }).toThrow('❌ Private key file not found: /nonexistent/key.pem');
        });
    });

    describe('JWT Generation', () => {
        test('should generate valid JWT token', () => {
            const jwt = tokenLease.generateJWT();
            expect(typeof jwt).toBe('string');
            expect(jwt.length).toBeGreaterThan(0);
        });
    });

    describe('Installation Token Generation', () => {
        test('should generate installation token successfully', async () => {
            const mockResponse = {
                data: {
                    token: 'ghs_test_token_12345',
                    expires_at: '2025-12-04T16:30:00Z',
                    permissions: { contents: 'read' }
                }
            };

            axios.post.mockResolvedValue(mockResponse);

            const result = await tokenLease.generateInstallationToken();

            expect(axios.post).toHaveBeenCalledWith(
                `https://api.github.com/app/installations/${mockConfig.installationId}/access_tokens`,
                {},
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: expect.stringMatching(/^Bearer /),
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'token-lease-server'
                    })
                })
            );

            expect(result.token).toBe('ghs_test_token_12345');
            expect(result.expiresAt).toBeGreaterThan(Date.now());
        });

        test('should handle API errors gracefully', async () => {
            const mockError = {
                response: {
                    data: { message: 'Installation not found' }
                }
            };

            axios.post.mockRejectedValue(mockError);

            await expect(tokenLease.generateInstallationToken())
                .rejects.toMatchObject(mockError);
        });
    });

    describe('Token Management', () => {
        test('should store token when generating for client', async () => {
            const mockResponse = {
                data: {
                    token: 'ghs_test_token_12345',
                    expires_at: '2025-12-04T16:30:00Z'
                }
            };

            axios.post.mockResolvedValue(mockResponse);

            const result = await tokenLease.getTokenForClient('test-client');

            expect(result.clientId).toBe('test-client');
            expect(result.token).toBe('ghs_test_token_12345');
            expect(result.cached).toBe(false);
            expect(tokenLease.tokenStorage.size).toBe(1);
        });

        test('should generate fresh tokens for same client', async () => {
            const mockResponse = {
                data: {
                    token: 'ghs_test_token_12345',
                    expires_at: '2025-12-04T16:30:00Z'
                }
            };

            axios.post.mockResolvedValue(mockResponse);

            const token1 = await tokenLease.getTokenForClient('test-client');
            const token2 = await tokenLease.getTokenForClient('test-client');

            expect(token1.tokenId).not.toBe(token2.tokenId);
            expect(tokenLease.tokenStorage.size).toBe(2);
        });

        test('should calculate expiration time correctly', async () => {
            const mockResponse = {
                data: {
                    token: 'ghs_test_token_12345',
                    expires_at: '2025-12-04T16:30:00Z'
                }
            };

            axios.post.mockResolvedValue(mockResponse);

            const startTime = Date.now();
            const result = await tokenLease.getTokenForClient('test-client');
            const endTime = Date.now();

            const expectedExpiration = startTime + mockConfig.tokenLifespan;
            const actualExpiration = result.expiresAt;

            // Allow for small timing differences
            expect(actualExpiration).toBeGreaterThanOrEqual(expectedExpiration - 1000);
            expect(actualExpiration).toBeLessThanOrEqual(endTime + mockConfig.tokenLifespan + 1000);
        });
    });

    describe('Token Revocation', () => {
        test('should revoke token successfully', async () => {
            axios.delete.mockResolvedValue({ status: 204 });

            const result = await tokenLease.revokeToken('test-token');

            expect(axios.delete).toHaveBeenCalledWith(
                'https://api.github.com/installation/token',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'token test-token',
                        Accept: 'application/vnd.github.v3+json',
                        'User-Agent': 'token-lease-server'
                    })
                })
            );

            expect(result).toBe(true);
        });

        test('should handle revocation failures', async () => {
            const mockError = {
                response: {
                    data: { message: 'Token not found' }
                }
            };

            axios.delete.mockRejectedValue(mockError);

            const result = await tokenLease.revokeToken('invalid-token');

            expect(result).toBe(false);
        });
    });

    describe('Token Cleanup', () => {
        test('should identify expired tokens', async () => {
            // Mock an expired token
            const expiredToken = {
                clientId: 'expired-client',
                token: 'expired-token',
                expiresAt: Date.now() - 1000, // 1 second ago
                createdAt: Date.now() - 10000,
                tokenId: 'expired-token-id'
            };

            tokenLease.tokenStorage.set('expired-token-id', expiredToken);

            // Mock successful revocation
            axios.delete.mockResolvedValue({ status: 204 });

            await tokenLease.cleanupExpiredTokens();

            expect(tokenLease.tokenStorage.size).toBe(0);
            expect(axios.delete).toHaveBeenCalled();
        });

        test('should not cleanup valid tokens', async () => {
            // Mock a valid token
            const validToken = {
                clientId: 'valid-client',
                token: 'valid-token',
                expiresAt: Date.now() + 60000, // 1 minute from now
                createdAt: Date.now(),
                tokenId: 'valid-token-id'
            };

            tokenLease.tokenStorage.set('valid-token-id', validToken);

            await tokenLease.cleanupExpiredTokens();

            expect(tokenLease.tokenStorage.size).toBe(1);
            expect(axios.delete).not.toHaveBeenCalled();
        });
    });

    describe('Server Lifecycle', () => {
        test('should start server successfully', async () => {
            const startPromise = tokenLease.start();
            
            // Wait a bit for the server to start
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(tokenLease.server).toBeDefined();
            expect(tokenLease.server.listening).toBe(true);
            
            await startPromise;
        });

        test('should stop server cleanly', async () => {
            await tokenLease.start();
            expect(tokenLease.server.listening).toBe(true);
            
            tokenLease.stop();
            
            // Server should be stopped
            expect(tokenLease.server.listening).toBe(false);
        });
    });
});