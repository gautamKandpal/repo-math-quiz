/**
 * Leaderboard Routes
 * 
 * Handles leaderboard queries.
 * Requirements: 8.3, 8.4, 8.6
 */

/**
 * Create leaderboard routes
 * 
 * @param {Object} prisma - Prisma client instance
 * @returns {Function} Express router handler
 */
function createLeaderboardRoutes(prisma) {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /api/leaderboard
   * 
   * Returns top 10 users by win count.
   * No authentication required (public endpoint).
   * 
   * Response 200: { leaderboard: Array<{ rank, displayName, winCount }> }
   */
  router.get('/leaderboard', async (req, res) => {
    try {
      // Query top 10 users by winCount DESC, displayName ASC
      const topUsers = await prisma.user.findMany({
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

      // Add rank to each user
      const leaderboard = topUsers.map((user, index) => ({
        rank: index + 1,
        displayName: user.displayName,
        winCount: user.winCount
      }));

      return res.status(200).json({
        leaderboard
      });

    } catch (error) {
      console.error('Error in GET /api/leaderboard:', error);
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching the leaderboard'
      });
    }
  });

  return router;
}

module.exports = {
  createLeaderboardRoutes
};
