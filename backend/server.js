#!/usr/bin/env node
/**
 * LAD Backend Server
 * Production-grade SaaS platform with feature-based architecture
 * Version: 1.0.1
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Map DB_* env vars (from root .env) to POSTGRES_* that connection.js expects
if (!process.env.POSTGRES_HOST && process.env.DB_HOST) process.env.POSTGRES_HOST = process.env.DB_HOST;
if (!process.env.POSTGRES_PORT && process.env.DB_PORT) process.env.POSTGRES_PORT = process.env.DB_PORT;
if (!process.env.POSTGRES_DB && process.env.DB_NAME) process.env.POSTGRES_DB = process.env.DB_NAME;
if (!process.env.POSTGRES_USER && process.env.DB_USER) process.env.POSTGRES_USER = process.env.DB_USER;
if (!process.env.POSTGRES_PASSWORD && process.env.DB_PASSWORD) process.env.POSTGRES_PASSWORD = process.env.DB_PASSWORD;

const CoreApplication = require('./core/app');
const logger = require('./core/utils/logger');

const PORT = process.env.PORT || 3004;

async function startServer() {
  try {
    logger.info('Starting LAD Backend Server');

    // Check critical environment variables
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'your-secret-key-change-in-production') {
      logger.warn('⚠️  JWT_SECRET is not properly configured. Using development default.');
      logger.warn('    For production, ensure JWT_SECRET is set via Google Cloud Secret Manager');
    } else {
      logger.info('✓ JWT_SECRET is configured');
    }

    logger.info('Server configuration', {
      environment: process.env.NODE_ENV || 'development',
      database: process.env.POSTGRES_HOST,
      schema: process.env.POSTGRES_SCHEMA || 'lad_dev',
      jwtConfigured: !!jwtSecret && jwtSecret !== 'your-secret-key-change-in-production'
    });

    const app = new CoreApplication();
    await app.start(PORT);

    logger.info('Server successfully started', {
      port: PORT,
      url: process.env.BACKEND_URL || process.env.BASE_URL || `http://localhost:${PORT}`,
      feature: 'lad-monitor',
      endpoints: [
        'GET  /health',
        'GET  /api/tenants',
        'GET  /api/dashboard',
        'GET  /api/cloud-logs'
      ]
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();
