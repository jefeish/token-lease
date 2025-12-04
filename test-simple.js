#!/usr/bin/env node

/**
 * Simple test client for Token Lease Server
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('🧪 Testing Token Lease Server\n');

    try {
        // Test 1: Health check
        console.log('1. Health check...');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health:', {
            status: health.data.status,
            storedTokens: health.data.storedTokens,
            mode: health.data.mode,
            tokenLifespanMinutes: health.data.tokenLifespanMinutes
        });

        // Test 2: Get token for default client
        console.log('\n2. Getting token for default client...');
        const token1 = await axios.get(`${BASE_URL}/token`);
        console.log('✅ Token 1:', {
            clientId: token1.data.clientId,
            cached: token1.data.cached,
            tokenLength: token1.data.token.length,
            expiresAt: token1.data.expiresAt,
            createdAt: token1.data.createdAt
        });

        // Test 3: Get token for specific client
        console.log('\n3. Getting token for client "app1"...');
        const token2 = await axios.get(`${BASE_URL}/token/app1`);
        console.log('✅ Token 2:', {
            clientId: token2.data.clientId,
            cached: token2.data.cached,
            tokenLength: token2.data.token.length,
            expiresAt: token2.data.expiresAt,
            createdAt: token2.data.createdAt
        });

        // Test 4: Get token again (always fresh in current mode)
        console.log('\n4. Getting token for "app1" again (fresh token)...');
        const token3 = await axios.get(`${BASE_URL}/token/app1`);
        console.log('✅ Token 3:', {
            clientId: token3.data.clientId,
            cached: token3.data.cached,
            tokenLength: token3.data.token.length,
            expiresAt: token3.data.expiresAt,
            createdAt: token3.data.createdAt
        });

        // Test 5: Check tokens status
        console.log('\n5. Checking stored tokens status...');
        const tokens = await axios.get(`${BASE_URL}/tokens`);
        console.log('✅ Tokens status:', {
            totalTokens: tokens.data.totalTokens,
            mode: tokens.data.mode,
            tokens: tokens.data.tokens.map(t => ({
                tokenId: t.tokenId,
                clientId: t.clientId,
                isExpired: t.isExpired,
                timeUntilExpiry: Math.round(t.timeUntilExpiry / 1000) + 's'
            }))
        });

        // Test 6: Delete tokens for specific client
        console.log('\n6. Deleting tokens for client "app1"...');
        const clear1 = await axios.delete(`${BASE_URL}/tokens/app1`);
        console.log('✅ Delete result:', clear1.data.message);

        // Test 7: Check tokens status after deletion
        console.log('\n7. Checking tokens status after deletion...');
        const tokensAfter = await axios.get(`${BASE_URL}/tokens`);
        console.log('✅ Tokens after deletion:', {
            totalTokens: tokensAfter.data.totalTokens,
            remaining: tokensAfter.data.tokens.map(t => t.clientId)
        });

        // Test 8: Clear all tokens
        console.log('\n8. Clearing all tokens...');
        const clearAll = await axios.delete(`${BASE_URL}/tokens`);
        console.log('✅ Clear all result:', clearAll.data.message);

        // Test 9: Test GitHub API with token (if requested)
        if (process.argv.includes('--github-test')) {
            console.log('\n9. Testing GitHub API with token...');
            const tokenForGH = await axios.get(`${BASE_URL}/token/github-test`);
            
            const ghResponse = await axios.get('https://api.github.com/user', {
                headers: {
                    Authorization: `token ${tokenForGH.data.token}`,
                    'User-Agent': 'token-lease-test'
                }
            });
            
            console.log('✅ GitHub API test:', {
                user: ghResponse.data.login,
                type: ghResponse.data.type
            });
        }

        console.log('\n✅ All tests passed!');

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Server not running. Start it with: npm start');
        } else {
            console.error('❌ Test failed:', error.response?.data || error.message);
        }
        process.exit(1);
    }
}

runTests();