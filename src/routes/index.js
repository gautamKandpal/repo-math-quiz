const { createSessionRoutes } = require('./session');
const { createLeaderboardRoutes } = require('./leaderboard');
const { createRoundStatsRoutes } = require('./roundStats');
const { createHealthRoutes } = require('./health');


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
