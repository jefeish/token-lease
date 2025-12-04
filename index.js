#!/usr/bin/env node

/**
 * Token Lease Server - Main Entry Point
 */

require('dotenv').config();
const TokenLease = require('./token-lease');

// Create and start the server
const tokenLease = new TokenLease();

tokenLease.start().then(() => {
    console.log('✅ Server started successfully');
}).catch((error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    tokenLease.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    tokenLease.stop();
    process.exit(0);
});