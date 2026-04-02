function createHealthRoutes() {
  const express = require('express');
  const router = express.Router();
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
