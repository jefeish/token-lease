const axios = require('axios');
const TokenLease = require('../token-lease');
const fs = require('fs');

// Integration tests that test the actual HTTP server
describe('TokenLease HTTP API - Integration Tests', () => {
    let tokenLease;
    let baseURL;
    const testPort = 3002;

    // Mock file system for private key
    beforeAll(() => {
        jest.spyOn(fs, 'readFileSync').mockReturnValue('mock-private-key');
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    });

    beforeEach(async () => {
        tokenLease = new TokenLease({
            port: testPort,
            appId: 'test-app-id',
            installationId: 'test-installation-id',
            privateKeyPath: '/mock/path/to/key.pem',
            tokenLifespan: 300000,
            cacheCheckInterval: 60000
        });

        await tokenLease.start();
        baseURL = `http://localhost:${testPort}`;
    });

    afterEach(() => {
        if (tokenLease) {
            tokenLease.stop();
        }
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('GET /health', () => {
        test('should return health status', async () => {
            const response = await axios.get(`${baseURL}/health`);

            expect(response.status).toBe(200);
            expect(response.data).toMatchObject({
                status: 'healthy',
                storedTokens: 0,
                mode: 'fresh-tokens-only',
                tokenLifespanMs: 300000,
                tokenLifespanMinutes: '5.0',
                version: '2.1.0'
            });
            expect(response.data.timestamp).toBeDefined();
        });
    });

    describe('GET /token', () => {
        beforeEach(() => {
            // Mock GitHub API response
            jest.spyOn(axios, 'post').mockResolvedValue({
                data: {
                    token: 'ghs_mock_token_12345',
                    expires_at: '2025-12-04T16:30:00Z',
                    permissions: { contents: 'read' }
                }
            });
        });

        test('should return token for default client', async () => {
            const response = await axios.get(`${baseURL}/token`);

            expect(response.status).toBe(200);
            expect(response.data).toMatchObject({
                success: true,
                clientId: 'default',
                token: 'ghs_mock_token_12345',
                cached: false
            });
            expect(response.data.expiresAt).toBeDefined();
            expect(response.data.createdAt).toBeDefined();
        });

        test('should return token for specific client', async () => {
            const response = await axios.get(`${baseURL}/token/test-client`);

            expect(response.status).toBe(200);
            expect(response.data).toMatchObject({
                success: true,
                clientId: 'test-client',
                token: 'ghs_mock_token_12345',
                cached: false
            });
        });

        test('should handle API errors', async () => {
            // Mock API error
            axios.post.mockRejectedValue({
                response: {
                    data: { message: 'Installation not found' }
                }
            });

            try {
                await axios.get(`${baseURL}/token`);
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.response.status).toBe(500);
                expect(error.response.data).toMatchObject({
                    success: false,
                    error: 'Failed to generate token'
                });
            }
        });
    });

    describe('GET /tokens', () => {
        beforeEach(() => {
            // Mock GitHub API response
            jest.spyOn(axios, 'post').mockResolvedValue({
                data: {
                    token: 'ghs_mock_token_12345',
                    expires_at: '2025-12-04T16:30:00Z'
                }
            });
        });

        test('should return empty tokens list initially', async () => {
            const response = await axios.get(`${baseURL}/tokens`);

            expect(response.status).toBe(200);
            expect(response.data).toMatchObject({
                success: true,
                totalTokens: 0,
                mode: 'fresh-tokens-only',
                tokens: []
            });
        });

        test('should return tokens after creation', async () => {
            // Create a token first
            await axios.get(`${baseURL}/token/test-client`);

            const response = await axios.get(`${baseURL}/tokens`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.totalTokens).toBe(1);
            expect(response.data.tokens).toHaveLength(1);
            expect(response.data.tokens[0]).toMatchObject({
                clientId: 'test-client',
                isExpired: false
            });
            expect(response.data.tokens[0].tokenId).toBeDefined();
            expect(response.data.tokens[0].expiresAt).toBeDefined();
            expect(response.data.tokens[0].createdAt).toBeDefined();
        });
    });

    describe('DELETE /tokens', () => {
        beforeEach(() => {
            // Mock GitHub API responses
            jest.spyOn(axios, 'post').mockResolvedValue({
                data: {
                    token: 'ghs_mock_token_12345',
                    expires_at: '2025-12-04T16:30:00Z'
                }
            });
            jest.spyOn(axios, 'delete').mockResolvedValue({ status: 204 });
        });

        test('should clear all tokens', async () => {
            // Create some tokens first
            await axios.get(`${baseURL}/token/client1`);
            await axios.get(`${baseURL}/token/client2`);

            // Verify tokens exist
            let response = await axios.get(`${baseURL}/tokens`);
            expect(response.data.totalTokens).toBe(2);

            // Clear all tokens
            response = await axios.delete(`${baseURL}/tokens`);
            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.message).toContain('Cleared 2 tokens');

            // Verify tokens are cleared
            response = await axios.get(`${baseURL}/tokens`);
            expect(response.data.totalTokens).toBe(0);
        });

        test('should delete tokens by client ID', async () => {
            // Create tokens for different clients
            await axios.get(`${baseURL}/token/client1`);
            await axios.get(`${baseURL}/token/client1`); // Second token for same client
            await axios.get(`${baseURL}/token/client2`);

            // Delete tokens for client1
            const response = await axios.delete(`${baseURL}/tokens/client1`);
            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.message).toContain('Deleted 2 tokens for client: client1');

            // Verify only client2 token remains
            const tokensResponse = await axios.get(`${baseURL}/tokens`);
            expect(tokensResponse.data.totalTokens).toBe(1);
            expect(tokensResponse.data.tokens[0].clientId).toBe('client2');
        });

        test('should delete token by token ID', async () => {
            // Create a token
            await axios.get(`${baseURL}/token/test-client`);

            // Get token ID
            let response = await axios.get(`${baseURL}/tokens`);
            const tokenId = response.data.tokens[0].tokenId;

            // Delete by token ID
            response = await axios.delete(`${baseURL}/tokens/${tokenId}`);
            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.tokenId).toBe(tokenId);

            // Verify token is deleted
            response = await axios.get(`${baseURL}/tokens`);
            expect(response.data.totalTokens).toBe(0);
        });

        test('should handle non-existent token deletion', async () => {
            const response = await axios.delete(`${baseURL}/tokens/non-existent`);
            
            expect(response.status).toBe(200);
            expect(response.data.success).toBe(false);
            expect(response.data.message).toContain('No tokens found');
        });
    });

    describe('CORS and middleware', () => {
        test('should handle CORS headers', async () => {
            const response = await axios.get(`${baseURL}/health`);
            
            expect(response.headers['access-control-allow-origin']).toBe('*');
        });

        test('should handle JSON content type', async () => {
            const response = await axios.get(`${baseURL}/health`);
            
            expect(response.headers['content-type']).toContain('application/json');
        });
    });

    describe('Error handling', () => {
        test('should handle 404 for non-existent endpoints', async () => {
            try {
                await axios.get(`${baseURL}/non-existent-endpoint`);
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.response.status).toBe(404);
            }
        });
    });
});