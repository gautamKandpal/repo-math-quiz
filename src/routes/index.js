/**
 * API Routes Index
 * 
 * Aggregates all API route modules.
 */

const { createSessionRoutes } = require('./session');
const { createLeaderboardRoutes } = require('./leaderboard');
const { createRoundStatsRoutes } = require('./roundStats');
const { createHealthRoutes } = require('./health');

/**
 * Create and configure all API routes
 * 
 * @param {Object} prisma - Prisma client instance
 * @param {Object} sessionManager - SessionManager instance
 * @param {Object} roundManager - RoundManager instance
 * @returns {Object} Object containing all route handlers
 */
function createRoutes(prisma, sessionManager, roundManager) {
  return {
    session: createSessionRoutes(prisma, sessionManager, roundManager),
    leaderboard: createLeaderboardRoutes(prisma),
    roundStats: createRoundStatsRoutes(prisma),
    health: createHealthRoutes()
  };
}

module.exports = {
  createRoutes
};
