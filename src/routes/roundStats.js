 function createRoundStatsRoutes(prisma) {
  const express = require('express');
  const router = express.Router();
  
  router.get('/rounds/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;

      // Query the round
      const round = await prisma.round.findUnique({
        where: { id },
        select: {
          id: true,
          startedAt: true
        }
      });

      if (!round) {
        return res.status(404).json({
          error: 'ROUND_NOT_FOUND',
          message: 'Round not found'
        });
      }

      // Query submissions for the specified roundId
      const submissions = await prisma.submission.findMany({
        where: { roundId: id },
        select: {
          receivedAt: true
        }
      });

      const submissionCount = submissions.length;

      // Calculate latency statistics if there are submissions
      let latency = null;
      if (submissionCount > 0) {
        const roundStartMs = round.startedAt.getTime();
        const latencies = submissions.map(sub => 
          sub.receivedAt.getTime() - roundStartMs
        );

        const minMs = Math.min(...latencies);
        const maxMs = Math.max(...latencies);
        const avgMs = Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length);

        latency = { minMs, maxMs, avgMs };
      }

      return res.status(200).json({
        roundId: round.id,
        submissionCount,
        latency
      });

    } catch (error) {
      console.error('Error in GET /api/rounds/:id/stats:', error);
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching round statistics'
      });
    }
  });

  return router;
}

module.exports = {
  createRoundStatsRoutes
};
