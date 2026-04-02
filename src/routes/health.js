/**
 * Health Check Routes
 * 
 * Provides liveness probe endpoint for infrastructure monitoring.
 * Requirements: Infrastructure
 */

/**
 * Create health check routes
 * 
 * @returns {Function} Express router handler
 */
function createHealthRoutes() {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /api/health
   * 
   * Returns server health status for liveness probe.
   * No authentication required (public endpoint).
   * 
   * Response 200: { status: "ok" }
   */
  router.get('/health', (req, res) => {
    return res.status(200).json({
      status: 'ok'
    });
  });

  return router;
}

module.exports = {
  createHealthRoutes
};
