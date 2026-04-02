const { validateAnswer } = require('../modules/AnswerValidator');

function registerConnectionHandler(io, sessionManager, roundManager, prisma) {
  io.on('connection', (socket) => {

    const { userId, displayName } = socket.data.user;
  
    socket.join('quiz');
    const existingSession = sessionManager.getSessionByUserId(userId);
    let isReconnection = false;
    
    if (existingSession) {
      isReconnection = sessionManager.updateSocketId(userId, socket.id);
    } else {
      sessionManager.createSession(userId, socket.id, displayName);
    }
    
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

    socket.on('submit_answer', async ({ roundId, answer } = {}) => {
      const receivedAt = Date.now();

      const sequence = roundManager.getNextSequence();

      const { userId, displayName: submitterName } = socket.data.user;

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

      if (currentRound.roundId !== roundId) {
        socket.emit('submission_ack', {
          roundId,
          correct: false,
          winner: false,
          message: 'Round is closed.'
        });
        return;
      }

      const rawInput = String(answer ?? '');
      const validationResult = validateAnswer(rawInput, currentRound.question);

      if (validationResult.parsed === null) {
        socket.emit('submission_ack', {
          roundId,
          correct: false,
          winner: false,
          message: 'Invalid input.'
        });
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

      if (validationResult.correct) {
        isWinner = await roundManager.handleCorrectSubmission(
          userId,
          submitterName,
          receivedAt,
          sequence
        );
      }

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

    socket.on('disconnect', () => {
      const session = sessionManager.markDisconnected(socket.id);

      // Broadcast user_left to remaining users in room (Req 9.4)
      if (session) {
        io.to('quiz').emit('user_left', { displayName: session.displayName });
      }
    });

    socket.on('ping_latency', ({ clientTs } = {}) => {
      const serverTs = Date.now();
      socket.emit('pong_latency', { clientTs, serverTs });
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
