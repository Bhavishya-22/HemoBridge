const express = require("express");
const router = express.Router();
const geocodeController = require("../controllers/geocodeController");

router.get("/geocode/reverse", geocodeController.reverseGeocode);
router.get("/geocode/search", geocodeController.searchGeocode);

// OSM tile proxy — serves map tiles through the backend to avoid client-side 403/CORS issues.
// The backend fetches tiles with a proper User-Agent (required by OSM policy).
// Tiles are cached with a 7-day Cache-Control header so browsers won't re-request them.
router.get("/tiles/:z/:x/:y", geocodeController.tileProxy);

module.exports = router;
