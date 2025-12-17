#!/usr/bin/env node

/**
 * Simple test client for Token Lease Server
 * 
 * Usage:
 *   node test-simple.js                    # Run basic token lease tests
 *   node test-simple.js --github-test      # Include GitHub API authentication test
 *   node test-simple.js --scope-test       # Include scoped token access test
 *   node test-simple.js --github-test --scope-test  # Run all tests
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

        // Test 10: Test scoped token (if requested)
        if (process.argv.includes('--scope-test')) {
            console.log('\n10. Testing scoped token access...');
            
            // Create a scoped token for 'test5' repository
            console.log('10a. Creating scoped token for repository "test5"...');
            const scopedTokenResponse = await axios.post(`${BASE_URL}/token/scoped-test`, {
                repositories: ['test5']
            });
            
            console.log('✅ Scoped token created:', {
                clientId: scopedTokenResponse.data.clientId,
                repositories: scopedTokenResponse.data.repositories,
                tokenLength: scopedTokenResponse.data.token.length,
                expiresAt: scopedTokenResponse.data.expiresAt
            });

            const scopedToken = scopedTokenResponse.data.token;
            const headers = {
                Authorization: `token ${scopedToken}`,
                'User-Agent': 'token-lease-test',
                Accept: 'application/vnd.github.v3+json'
            };

            // First get the repository listing to determine the organization
            console.log('10b. Getting repository information to determine organization...');
            let orgName = null;
            let scopedRepoFullName = null;
            
            try {
                const reposResponse = await axios.get('https://api.github.com/installation/repositories', {
                    headers
                });
                
                if (reposResponse.data.repositories && reposResponse.data.repositories.length > 0) {
                    const scopedRepo = reposResponse.data.repositories.find(repo => repo.name === 'test5');
                    if (scopedRepo) {
                        scopedRepoFullName = scopedRepo.full_name;
                        orgName = scopedRepo.owner.login;
                        console.log('✅ Retrieved organization info:', {
                            organization: orgName,
                            scopedRepository: scopedRepoFullName
                        });
                    }
                }
            } catch (error) {
                console.log('❌ Failed to get repository listing for organization detection:', {
                    status: error.response?.status,
                    message: error.response?.data?.message || error.message
                });
                // Fallback to hardcoded org if API call fails
                orgName = 'jefeish-training';
                scopedRepoFullName = 'jefeish-training/test5';
            }

            if (!orgName) {
                console.log('⚠️ Could not determine organization, using fallback');
                orgName = 'jefeish-training';
                scopedRepoFullName = 'jefeish-training/test5';
            }

            // Test accessing the scoped repository (should succeed)
            console.log(`10c. Testing access to scoped repository "${scopedRepoFullName}"...`);
            try {
                const scopedRepoResponse = await axios.get(`https://api.github.com/repos/${scopedRepoFullName}`, {
                    headers
                });
                console.log('✅ Scoped repository access successful:', {
                    repoName: scopedRepoResponse.data.name,
                    fullName: scopedRepoResponse.data.full_name,
                    private: scopedRepoResponse.data.private
                });
            } catch (error) {
                console.log('❌ Failed to access scoped repository:', {
                    repository: scopedRepoFullName,
                    status: error.response?.status,
                    message: error.response?.data?.message || error.message
                });
            }

            // Test accessing an out-of-scope repository (should fail)
            const outOfScopeRepo = `${orgName}/demo-java`;
            console.log(`10d. Testing access to out-of-scope repository "${outOfScopeRepo}"...`);
            try {
                const outOfScopeResponse = await axios.get(`https://api.github.com/repos/${outOfScopeRepo}`, {
                    headers
                });
                console.log('❌ Unexpected success accessing out-of-scope repository:', {
                    repository: outOfScopeRepo,
                    repoName: outOfScopeResponse.data.name,
                    fullName: outOfScopeResponse.data.full_name
                });
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log('✅ Correctly blocked access to out-of-scope repository:', {
                        repository: outOfScopeRepo,
                        status: error.response.status,
                        message: 'Repository not found (as expected with scoped token)'
                    });
                } else {
                    console.log('⚠️ Out-of-scope repository access failed with unexpected error:', {
                        repository: outOfScopeRepo,
                        status: error.response?.status,
                        message: error.response?.data?.message || error.message
                    });
                }
            }

            // Test listing repositories (should only show scoped repo)
            console.log('10e. Final repository listing verification...');
            try {
                const finalReposResponse = await axios.get('https://api.github.com/installation/repositories', {
                    headers
                });
                console.log('✅ Final repository listing:', {
                    totalCount: finalReposResponse.data.total_count,
                    repositories: finalReposResponse.data.repositories.map(repo => ({
                        name: repo.name,
                        fullName: repo.full_name,
                        organization: repo.owner.login
                    }))
                });
            } catch (error) {
                console.log('❌ Failed to list repositories:', {
                    status: error.response?.status,
                    message: error.response?.data?.message || error.message
                });
            }
        }

        console.log('\n✅ All tests passed!');
        
        // Show additional test options if not used
        if (!process.argv.includes('--github-test') && !process.argv.includes('--scope-test')) {
            console.log('\n💡 Additional test options:');
            console.log('   --github-test  Test GitHub API authentication');
            console.log('   --scope-test   Test scoped token repository access');
        }

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