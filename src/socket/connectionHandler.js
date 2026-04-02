/**
 * Socket.io Connection Handler
 * 
 * Handles WebSocket connection lifecycle:
 * - JWT authentication (via middleware)
 * - Join quiz room
 * - Create or restore user session
 * - Emit current round state
 * - Broadcast user_joined event
 * - Handle submit_answer, ping_latency, disconnect events
 * 
 * Requirements: 1.2, 2.1, 2.2, 2.3, 2.6, 3.1, 3.4, 4.4, 7.1, 7.5, 9.1, 9.2, 9.4
 */

const { validateAnswer } = require('../modules/AnswerValidator');

/**
 * Register connection handler for socket.io server.
 * 
 * @param {import('socket.io').Server} io - Socket.io server instance
 * @param {Object} sessionManager - SessionManager instance
 * @param {Object} roundManager - RoundManager instance
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client instance
 */
function registerConnectionHandler(io, sessionManager, roundManager, prisma) {
  io.on('connection', (socket) => {
    // At this point, JWT authentication middleware has already run
    // socket.data.user contains { userId, displayName } from JWT payload
    const { userId, displayName } = socket.data.user;
    
    // Join socket to "quiz" room for broadcasts
    socket.join('quiz');
    
    // Check if user has an existing session (reconnection scenario)
    const existingSession = sessionManager.getSessionByUserId(userId);
    let isReconnection = false;
    
    if (existingSession) {
      // User is reconnecting - restore session with new socket ID
      isReconnection = sessionManager.updateSocketId(userId, socket.id);
    } else {
      // New connection - create fresh session
      sessionManager.createSession(userId, socket.id, displayName);
    }
    
    // Emit current round state to newly connected socket
    // Covers both 'active' and 'countdown' states so reconnecting users get context
    const currentRound = roundManager.getCurrentRound();
    if (currentRound && (currentRound.state === 'active' || currentRound.state === 'countdown')) {
      socket.emit('round_started', {
        roundId: currentRound.roundId,
        expression: currentRound.question.expression,
        difficulty: currentRound.question.difficulty,
        startedAt: currentRound.startedAt,
        timeoutSecs: 60
      });
    }
    
    // Broadcast user_joined to all users in room
    io.to('quiz').emit('user_joined', {
      displayName: displayName,
      reconnected: isReconnection
    });

    // ----------------------------------------------------------------
    // submit_answer handler
    // Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 3.4
    // ----------------------------------------------------------------
    socket.on('submit_answer', async ({ roundId, answer } = {}) => {
      // Step 1: Record server timestamp immediately (Requirement 2.2)
      const receivedAt = Date.now();

      // Step 2: Atomically increment sequence counter (Requirement 3.4)
      const sequence = roundManager.getNextSequence();

      // Step 3: Extract userId from authenticated socket (Requirement 2.1)
      const { userId, displayName: submitterName } = socket.data.user;

      // Step 4: Validate round is in active state (Requirement 2.6)
      const currentRound = roundManager.getCurrentRound();
      if (!currentRound || currentRound.state !== 'active') {
        socket.emit('submission_ack', {
          roundId,
          correct: false,
          winner: false,
          message: 'Round is closed.'
        });
        return;
      }

      // Ensure the submitted roundId matches the current round
      if (currentRound.roundId !== roundId) {
        socket.emit('submission_ack', {
          roundId,
          correct: false,
          winner: false,
          message: 'Round is closed.'
        });
        return;
      }

      // Step 5: Validate answer using AnswerValidator (Requirement 2.3)
      const rawInput = String(answer ?? '');
      const validationResult = validateAnswer(rawInput, currentRound.question);

      // Handle invalid (non-numeric) input
      if (validationResult.parsed === null) {
        socket.emit('submission_ack', {
          roundId,
          correct: false,
          winner: false,
          message: 'Invalid input.'
        });
        // Persist invalid submission
        if (prisma) {
          await prisma.submission.create({
            data: {
              roundId: currentRound.roundId,
              userId,
              rawInput,
              parsedValue: null,
              isCorrect: false,
              receivedAt: new Date(receivedAt),
              sequence
            }
          });
        }
        return;
      }

      let isWinner = false;

      // Step 6: If correct, attempt atomic winner detection (Requirement 3.1)
      if (validationResult.correct) {
        isWinner = await roundManager.handleCorrectSubmission(
          userId,
          submitterName,
          receivedAt,
          sequence
        );
      }

      // Step 7: Persist Submission record (Requirement 2.2)
      if (prisma) {
        await prisma.submission.create({
          data: {
            roundId: currentRound.roundId,
            userId,
            rawInput,
            parsedValue: validationResult.parsed,
            isCorrect: validationResult.correct,
            receivedAt: new Date(receivedAt),
            sequence
          }
        });
      }

      // Step 8: Emit submission_ack to submitting socket
      let message;
      if (!validationResult.correct) {
        message = 'Incorrect answer.';
      } else if (isWinner) {
        message = 'Correct! You won this round.';
      } else {
        message = 'Correct, but someone was faster.';
      }

      socket.emit('submission_ack', {
        roundId,
        correct: validationResult.correct,
        winner: isWinner,
        message
      });
    });

    // ----------------------------------------------------------------
    // disconnect handler
    // Requirements: 9.1, 9.3, 9.4
    // ----------------------------------------------------------------
    socket.on('disconnect', () => {
      // Mark session as disconnected and start 30-second expiry timer (Req 9.1, 9.3)
      const session = sessionManager.markDisconnected(socket.id);

      // Broadcast user_left to remaining users in room (Req 9.4)
      if (session) {
        io.to('quiz').emit('user_left', { displayName: session.displayName });
      }
    });

    // ----------------------------------------------------------------
    // ping_latency handler
    // Requirements: 4.4
    // ----------------------------------------------------------------
    socket.on('ping_latency', ({ clientTs } = {}) => {
      const serverTs = Date.now();
      socket.emit('pong_latency', { clientTs, serverTs });

      // Calculate RTT and warn if > 2000ms
      if (typeof clientTs === 'number') {
        const rttMs = serverTs - clientTs;
        if (rttMs > 2000) {
          socket.emit('high_latency_warning', {
            rttMs,
            message: 'Your connection latency is high. Results may be less competitive.'
          });
        }
      }
    });
  });
}

module.exports = {
  registerConnectionHandler
};
