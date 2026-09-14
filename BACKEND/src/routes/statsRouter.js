const express = require('express');
const statsRouter = express.Router();
const statsController = require('../controllers/statsController');

// Public endpoint — no auth needed
statsRouter.get('/stats', statsController.getPublicStats);

module.exports = statsRouter;
