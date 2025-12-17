/**
 * Logger Configuration
 * 
 * Provides structured logging using Pino with consistent configuration
 * for the entire token lease server application.
 */

const pino = require('pino');

// Create logger with environment-based configuration
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
        }
    } : undefined,
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        }
    }
});

module.exports = logger;