// src/index.js — Main entry point
'use strict';
require('dotenv').config();

const express          = require('express');
const cors             = require('cors');
const path             = require('path');
const { createServer } = require('http');
const WebSocket        = require('ws');

const logger           = require('./logger');
const webhookRouter    = require('./routes/webhook');
const dashboardRouter  = require('./routes/dashboard');
const { TokenMonitor } = require('./monitor');
const { scheduleDaily, listReports } = require('./reporter');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/reports', express.static(path.join(__dirname, '../public/reports')));

// ── Routes ────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);
app.use('/api',     dashboardRouter);

app.get('/api/reports', (req, res) => res.json(listReports()));

app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/stats.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── HTTP + WebSocket server ───────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('Dashboard WebSocket connected');
  const snapshot = TokenMonitor.getInstance().getDashboardData();
  ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));

  ws.on('error', (err) => logger.warn(`WS client error: ${err.message}`));
  ws.on('close', ()    => logger.info('Dashboard WebSocket disconnected'));
});

global._wss = wss;

// ── Start ─────────────────────────────────────────────────────
const monitor = TokenMonitor.getInstance();
monitor.start();

scheduleDaily(() => monitor.getTradeRecords());

httpServer.listen(PORT, () => {
  logger.info(`🚀 SOL RSI Monitor v3  →  http://0.0.0.0:${PORT}`);
  logger.info(`   Add token  →  POST http://0.0.0.0:${PORT}/webhook/add-token`);
  logger.info(`   Whitelist  →  POST http://0.0.0.0:${PORT}/api/whitelist`);
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM — shutting down');
  monitor.stop();
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});
