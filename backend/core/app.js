const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authenticateToken } = require('./middleware/auth');
const { getSocketService } = require('../shared/services/socketService');
const logger = require('./utils/logger');
const http = require('http');

class CoreApplication {
  constructor() {
    this.app = express();
    this.server = null;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:8080',
      'https://www.mrlads.com',
      'https://app.mrlads.com',
      'https://dev.mrlads.com',
      'https://stage.mrlads.com',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          logger.warn('[CORS] Blocked origin', { origin });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    }));

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());

    this.app.options('*', (req, res) => {
      res.status(204).end();
    });
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    const { schemaResolver } = require('./middleware/schemaResolver');

    // LAD Monitor Features
    this.app.use('/api/tenants', authenticateToken, schemaResolver, require('../features/lad-monitor/tenants/routes/index'));
    this.app.use('/api/dashboard', authenticateToken, schemaResolver, require('../features/lad-monitor/dashboard/routes/index'));
    this.app.use('/api/cloud-logs', authenticateToken, schemaResolver, require('../features/lad-monitor/cloud-logs/routes/index'));

    logger.info('[App] LAD Monitor features (tenants, dashboard, cloud-logs) successfully mounted');
  }

  async start(port = 3000) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.app);

      try {
        const socketService = getSocketService();
        socketService.initialize(this.server);
        logger.info('[App] Socket.IO initialized for real-time features');
      } catch (error) {
        logger.warn('[App] Socket.IO initialization failed:', { error: error.message });
      }

      this.server.listen(port, '0.0.0.0', (err) => {
        if (err) return reject(err);
        logger.info(`LAD Monitor backend running on port ${port}`);
        resolve();
      });
    });
  }
}

module.exports = CoreApplication;

