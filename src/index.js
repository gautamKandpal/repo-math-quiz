require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const { authenticateSocketJWT } = require('./auth/jwtMiddleware');
const { createRoutes } = require('./routes/index');
const { registerConnectionHandler } = require('./socket/connectionHandler');
const { createSessionManager } = require('./modules/SessionManager');
const { createRoundManager } = require('./modules/RoundManager');
const { generateQuestion } = require('./modules/QuestionGenerator');

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const sessionManager = createSessionManager();
const questionGenerator = { generateQuestion };
const roundManager = createRoundManager(io, prisma, questionGenerator);

const routes = createRoutes(prisma, sessionManager, roundManager);

app.use('/api', routes.session);
app.use('/api', routes.leaderboard);
app.use('/api', routes.roundStats);
app.use('/api', routes.health);

io.use(authenticateSocketJWT);
registerConnectionHandler(io, sessionManager, roundManager, prisma);

// Serve React client(for render)
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  roundManager.startRound().catch((err) => {
    console.error('Failed to start initial round:', err);
  });
});

async function shutdown() {
  console.log('Shutting down...');
  roundManager.cleanup();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
