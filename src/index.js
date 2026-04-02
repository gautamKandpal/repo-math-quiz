/**
 * Express server entry point
 *
 * Wires together all modules: Express, socket.io, Prisma, SessionManager, RoundManager.
 * Requirements: All (infrastructure)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const { authenticateSocketJWT } = require('./auth/jwtMiddleware');
const { createRoutes } = require('./routes/index');
const { registerConnectionHandler } = require('./socket/connectionHandler');
const { createSessionManager } = require('./modules/SessionManager');
const { createRoundManager } = require('./modules/RoundManager');
const { generateQuestion } = require('./modules/QuestionGenerator');

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cors());

// ── HTTP + socket.io server ──────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

// ── Prisma ───────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Modules ──────────────────────────────────────────────────────────────────

const sessionManager = createSessionManager();
const questionGenerator = { generateQuestion };
const roundManager = createRoundManager(io, prisma, questionGenerator);

// ── REST routes ──────────────────────────────────────────────────────────────

const routes = createRoutes(prisma, sessionManager, roundManager);

// Each router already includes the full path segment (e.g. /session, /leaderboard)
// so we mount them all under /api
app.use('/api', routes.session);
app.use('/api', routes.leaderboard);
app.use('/api', routes.roundStats);
app.use('/api', routes.health);

// ── WebSocket middleware + handler ───────────────────────────────────────────

io.use(authenticateSocketJWT);
registerConnectionHandler(io, sessionManager, roundManager, prisma);

// ── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  roundManager.startRound().catch((err) => {
    console.error('Failed to start initial round:', err);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  console.log('Shutting down...');
  roundManager.cleanup();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
