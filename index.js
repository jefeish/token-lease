#!/usr/bin/env node

/**
 * Token Lease Server - Main Entry Point
 */

require('dotenv').config();
const TokenLease = require('./token-lease');
const logger = require('./modules/logger');

// Create and start the server
const tokenLease = new TokenLease();

tokenLease.start().then(() => {
    logger.info('✅ Server started successfully');
}).catch((error) => {
    logger.error({ error: error.message }, '❌ Failed to start server');
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('🛑 Shutting down gracefully...');
    tokenLease.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('🛑 Shutting down gracefully...');
    tokenLease.stop();
    process.exit(0);
});