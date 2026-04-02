const { generateToken } = require('../auth/jwtUtils');

function createSessionRoutes(prisma, sessionManager, roundManager) {
  const express = require('express');
  const router = express.Router();

  /**
   * POST /api/session
   * 
   * Join or re-join the quiz session with a display name.
   * Issues a JWT token on success.
   * 
   * Request body: { displayName: string }
   * 
   * Response 200: { token, userId, displayName, currentRound }
   * Response 409: { error, message } - display name taken
   * Response 400: { error, message } - invalid request
   */
  router.post('/session', async (req, res) => {
    try {
      const { displayName } = req.body;

      // Validate displayName
      if (!displayName || typeof displayName !== 'string') {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'displayName is required and must be a string'
        });
      }

      const trimmedName = displayName.trim();

      if (trimmedName.length === 0) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'displayName cannot be empty'
        });
      }

      if (trimmedName.length > 50) {
        return res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'displayName cannot exceed 50 characters'
        });
      }

      // Check displayName uniqueness against active sessions
      const activeDisplayNames = sessionManager.getActiveDisplayNames();
      if (activeDisplayNames.has(trimmedName)) {
        return res.status(409).json({
          error: 'DISPLAY_NAME_TAKEN',
          message: 'That name is already in use.'
        });
      }

      // Check displayName uniqueness against User table
      const existingUser = await prisma.user.findUnique({
        where: { displayName: trimmedName }
      });

      // Upsert User record in database
      const user = await prisma.user.upsert({
        where: { displayName: trimmedName },
        update: { updatedAt: new Date() },
        create: { displayName: trimmedName }
      });

      // Generate JWT token
      const token = generateToken(user.id, user.displayName);

      // Get current round state
      const currentRound = roundManager.getCurrentRound();

      // Return response
      return res.status(200).json({
        token,
        userId: user.id,
        displayName: user.displayName,
        currentRound: currentRound ? {
          roundId: currentRound.roundId,
          expression: currentRound.question.expression,
          state: currentRound.state,
          startedAt: currentRound.startedAt
        } : null
      });

    } catch (error) {
      console.error('Error in POST /api/session:', error);
      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while creating the session'
      });
    }
  });

  return router;
}

module.exports = {
  createSessionRoutes
};
