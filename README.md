# Token Lease Server

Simple, efficient GitHub App Installation token leasing with smart caching.

A lightweight HTTP server that provides GitHub App Installation tokens through REST API endpoints. Features automatic token caching per client, configurable cache cleanup, and token expiration management.

## Features

- 🚀 **Simple API**: Clean REST endpoints for token access
- 👥 **Multi-Client Support**: Separate token cache per client ID
- 💾 **Smart Caching**: Tokens cached with automatic expiration
- 🧹 **Auto-Cleanup**: Configurable cache cleanup intervals
- 🔒 **Secure**: Private keys never exposed via API
- 📊 **Monitoring**: Cache status and health endpoints

## Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your GitHub App details
   ```

3. **Start the server**:

   ```bash
   npm start
   ```

4. **Get a token**:

   ```bash
   curl http://localhost:3000/token
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/token` | Get token for default client |
| `GET` | `/token/:clientId` | Get token for specific client |
| `GET` | `/cache` | View all cached tokens status |
| `DELETE` | `/cache` | Clear all cached tokens |
| `DELETE` | `/cache/:clientId` | Clear token for specific client |

## Configuration

Set these environment variables in your `.env` file:

```env
PORT=3000                           # Server port
APP_ID=123456                      # GitHub App ID
INSTALLATION_ID=12345678           # Installation ID
PRIVATE_KEY_PATH=./src/github-app-installation-token/private-key.pem # Path to private key

# Cache Management
CACHE_CHECK_INTERVAL=60000         # Cache cleanup interval (ms)
TOKEN_BUFFER_TIME=300000           # Buffer before token expiry (ms)
```

## Project Structure

```text
token-lease/
├── index.js                       # Main entry point
├── token-lease.js                 # Core TokenLease class
├── test-simple.js                 # Test client
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment template
├── Dockerfile                     # Docker setup
├── docker-compose.yml             # Docker Compose
└── src/github-app-installation-token/  # GitHub App credentials
    ├── private-key.pem            # Your private key
    └── .env                       # Local environment
```

## Usage Examples

### Basic cURL Examples

```bash
# Get server health
curl http://localhost:3000/health

# Get a token
curl http://localhost:3000/token

# Check token status
curl http://localhost:3000/token/info

# Clear cached token
curl -X DELETE http://localhost:3000/token
```

### Using the Client Library

```javascript
const TokenLeaseClient = require('./src/client/client-example');
// Or use the main library export
const { TokenLeaseClient } = require('./src');

const client = new TokenLeaseClient('http://localhost:3000');

// Get a token and make GitHub API requests
const token = await client.getToken();
const response = await client.makeGitHubRequest('https://api.github.com/user');
```

### JavaScript Integration

```javascript
const axios = require('axios');

// Get token for your application
async function getTokenForMyApp() {
    const response = await axios.get('http://localhost:3000/token/my-app');
    return response.data.token;
}

// Use token with GitHub API
async function makeGitHubRequest() {
    const token = await getTokenForMyApp();
    
    const githubResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
    });
    
    return githubResponse.data;
}
```

## Available Scripts

```bash
# Start the server
npm start

# Start with auto-reload (development)
npm run dev

# Run tests
npm test
```

## Testing

```bash
# Basic tests
npm test

# Test with GitHub API calls
node test-simple.js --github-test
```

## API Usage Examples

### Get Token for Default Client

```bash
curl http://localhost:3000/token
```

### Get Token for Specific Client

```bash
curl http://localhost:3000/token/my-app
```

### Check Cache Status

```bash
curl http://localhost:3000/cache
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run manually
docker build -t token-lease-server .
docker run -p 3000:3000 --env-file .env token-lease-server
```

## Token Lifecycle

1. **Request**: Client requests token via `/token` endpoint
2. **Generate**: Server generates JWT and exchanges for installation token
3. **Cache**: Token is cached with expiration time
4. **Reuse**: Subsequent requests return cached token (if valid)
5. **Expire**: Token automatically expires based on GitHub's TTL
6. **Refresh**: New token generated when cache expires

## Security Considerations

- Private keys are never exposed via API
- Tokens have automatic expiration (GitHub enforced)
- Server-side caching reduces GitHub API calls
- Manual token revocation capability
- CORS enabled for browser-based clients
