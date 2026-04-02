/**
 * RoundManager Module
 * 
 * Manages round lifecycle, state machine, and timers.
 * Uses factory function pattern with closure to maintain state.
 * 
 * Requirements: 1.1, 1.3, 3.1, 3.2, 3.3, 6.1, 6.2, 6.4, 6.5
 */

const crypto = require('crypto');

/**
 * @typedef {import('../types/index.js').Question} Question
 * @typedef {import('../types/index.js').RoundContext} RoundContext
 * @typedef {import('../types/index.js').RoundState} RoundState
 */

/**
 * Create a RoundManager instance using factory function pattern.
 * 
 * @param {import('socket.io').Server} io - Socket.io server instance
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client instance
 * @param {Object} questionGenerator - Question generator module
 * @returns {Object} RoundManager instance with public methods
 */
function createRoundManager(io, prisma, questionGenerator) {
  // Private state maintained in closure
  let currentRound = null;
  
  /**
   * Start a new round with a generated question.
   * Broadcasts round_started event to all users.
   * 
   * Requirements: 1.1, 1.3, 6.1
   */
  async function startRound() {
    // Clear any existing timers
    if (currentRound?.timeoutHandle) {
      clearTimeout(currentRound.timeoutHandle);
    }
    if (currentRound?.countdownHandle) {
      clearTimeout(currentRound.countdownHandle);
    }
    
    // Generate new question (different from previous)
    const previousQuestion = currentRound?.question || null;
    const question = questionGenerator.generateQuestion('medium', previousQuestion);
    
    // Create round in database
    const roundRecord = await prisma.round.create({
      data: {
        id: question.id,
        expression: question.expression,
        answer: question.answer,
        difficulty: question.difficulty,
        isInteger: question.isInteger,
        state: 'active',
        startedAt: new Date()
      }
    });
    
    // Initialize round state
    const startedAt = Date.now();
    currentRound = {
      roundId: roundRecord.id,
      question: question,
      state: 'active',
      startedAt: startedAt,
      winnerId: null,
      winnerName: null,
      sequenceCounter: 0,
      timeoutHandle: null,
      countdownHandle: null
    };
    
    // Broadcast round_started to all users in quiz room
    io.to('quiz').emit('round_started', {
      roundId: currentRound.roundId,
      expression: currentRound.question.expression,
      difficulty: currentRound.question.difficulty,
      startedAt: currentRound.startedAt,
      timeoutSecs: 60
    });
    
    // Set 60-second timeout for round
    currentRound.timeoutHandle = setTimeout(() => {
      handleTimeout();
    }, 60000);
  }
  
  /**
   * Handle correct submission with atomic winner detection.
   * Uses Prisma updateMany with WHERE winnerId IS NULL for atomicity.
   * 
   * Requirements: 3.1, 3.2, 3.3
   * 
   * @param {string} userId - User ID of the submitter
   * @param {string} displayName - Display name of the submitter
   * @param {number} receivedAt - Server timestamp when submission was received
   * @param {number} sequence - Submission sequence number
   * @returns {Promise<boolean>} True if this user won, false otherwise
   */
  async function handleCorrectSubmission(userId, displayName, receivedAt, sequence) {
    if (!currentRound || currentRound.state !== 'active') {
      return false;
    }
    
    // Attempt atomic winner claim using Prisma updateMany
    // Only updates if winnerId IS NULL (no winner yet)
    const updated = await prisma.round.updateMany({
      where: {
        id: currentRound.roundId,
        winnerId: null
      },
      data: {
        winnerId: userId,
        state: 'countdown',
        endedAt: new Date()
      }
    });
    
    // Check if this submission won the race
    if (updated.count === 1) {
      // This user won! Update state and broadcast
      currentRound.winnerId = userId;
      currentRound.winnerName = displayName;
      currentRound.state = 'countdown';
      
      // Clear timeout timer
      if (currentRound.timeoutHandle) {
        clearTimeout(currentRound.timeoutHandle);
        currentRound.timeoutHandle = null;
      }
      
      // Increment user's win count
      await prisma.user.update({
        where: { id: userId },
        data: { winCount: { increment: 1 } }
      });
      
      // Calculate latency statistics
      const submissions = await prisma.submission.findMany({
        where: { roundId: currentRound.roundId },
        select: { receivedAt: true }
      });
      
      const latencies = submissions.map(sub => 
        sub.receivedAt.getTime() - currentRound.startedAt
      );
      
      const latencyStats = latencies.length > 0 ? {
        minMs: Math.min(...latencies),
        maxMs: Math.max(...latencies),
        avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      } : null;
      
      // Broadcast round_ended to all users
      io.to('quiz').emit('round_ended', {
        roundId: currentRound.roundId,
        winnerName: displayName,
        winnerId: userId,
        correctAnswer: currentRound.question.answer,
        reason: 'winner_found',
        latencyStats: latencyStats
      });
      
      // Broadcast updated leaderboard
      const leaderboard = await prisma.user.findMany({
        select: {
          displayName: true,
          winCount: true
        },
        orderBy: [
          { winCount: 'desc' },
          { displayName: 'asc' }
        ],
        take: 10
      });
      
      const leaderboardWithRank = leaderboard.map((user, index) => ({
        rank: index + 1,
        displayName: user.displayName,
        winCount: user.winCount
      }));
      
      io.to('quiz').emit('leaderboard_updated', {
        leaderboard: leaderboardWithRank
      });
      
      // Start countdown for next round
      startCountdown();
      
      return true;
    }
    
    // Another submission already won
    return false;
  }
  
  /**
   * Handle round timeout (60 seconds with no correct answer).
   * 
   * Requirements: 6.4
   */
  async function handleTimeout() {
    if (!currentRound || currentRound.state !== 'active') {
      return;
    }
    
    // Update round state in database
    await prisma.round.update({
      where: { id: currentRound.roundId },
      data: {
        state: 'timed_out',
        endedAt: new Date()
      }
    });
    
    // Update local state
    currentRound.state = 'countdown';
    
    // Calculate latency statistics
    const submissions = await prisma.submission.findMany({
      where: { roundId: currentRound.roundId },
      select: { receivedAt: true }
    });
    
    const latencies = submissions.map(sub => 
      sub.receivedAt.getTime() - currentRound.startedAt
    );
    
    const latencyStats = latencies.length > 0 ? {
      minMs: Math.min(...latencies),
      maxMs: Math.max(...latencies),
      avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    } : null;
    
    // Broadcast round_ended with timeout reason
    io.to('quiz').emit('round_ended', {
      roundId: currentRound.roundId,
      winnerName: null,
      winnerId: null,
      correctAnswer: currentRound.question.answer,
      reason: 'timeout',
      latencyStats: latencyStats
    });
    
    // Start countdown for next round
    startCountdown();
  }
  
  /**
   * Start 5-second countdown before next round.
   * Emits countdown_tick events at 1-second intervals.
   * 
   * Requirements: 6.1, 6.2
   */
  function startCountdown() {
    let secondsRemaining = 5;
    
    // Store on currentRound so late joiners can read it
    if (currentRound) {
      currentRound.countdownSecondsRemaining = secondsRemaining;
    }

    // Emit initial countdown tick
    io.to('quiz').emit('countdown_tick', { secondsRemaining });
    
    // Set up interval for countdown ticks
    const countdownInterval = setInterval(() => {
      secondsRemaining--;
      
      if (currentRound) {
        currentRound.countdownSecondsRemaining = secondsRemaining;
      }

      if (secondsRemaining > 0) {
        io.to('quiz').emit('countdown_tick', { secondsRemaining });
      } else {
        // Countdown complete, clear interval and start new round
        clearInterval(countdownInterval);
        startRound();
      }
    }, 1000);
    
    // Store interval handle (note: using countdownHandle for consistency)
    if (currentRound) {
      currentRound.countdownHandle = countdownInterval;
    }
  }
  
  /**
   * Get current round state.
   * 
   * @returns {RoundContext | null} Current round context or null if no active round
   */
  function getCurrentRound() {
    return currentRound;
  }
  
  /**
   * Get and increment submission sequence counter atomically.
   * 
   * @returns {number} Next sequence number
   */
  function getNextSequence() {
    if (!currentRound) {
      return 0;
    }
    return ++currentRound.sequenceCounter;
  }
  
  /**
   * Cleanup timers on shutdown.
   */
  function cleanup() {
    if (currentRound?.timeoutHandle) {
      clearTimeout(currentRound.timeoutHandle);
    }
    if (currentRound?.countdownHandle) {
      clearTimeout(currentRound.countdownHandle);
    }
  }
  
  // Return public API
  return {
    startRound,
    handleCorrectSubmission,
    handleTimeout,
    startCountdown,
    getCurrentRound,
    getNextSequence,
    cleanup
  };
}

module.exports = {
  createRoundManager
};
