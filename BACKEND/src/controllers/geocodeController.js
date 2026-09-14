const asyncHandler = require("express-async-handler");

// In-memory cache to respect rate limits and speed up repeated lookups
const reverseCache = new Map();
const searchCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory tile cache to avoid redundant upstream fetches (LRU-like, max 2000 tiles)
const tileCache = new Map();
const TILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TILE_CACHE_MAX = 2000;

function cleanTileCache() {
  if (tileCache.size < TILE_CACHE_MAX) return;
  const now = Date.now();
  // Evict expired entries first
  for (const [key, entry] of tileCache.entries()) {
    if (now - entry.timestamp > TILE_CACHE_TTL_MS) {
      tileCache.delete(key);
    }
  }
  // If still too large, evict oldest quarter
  if (tileCache.size >= TILE_CACHE_MAX) {
    const keys = [...tileCache.keys()].slice(0, Math.floor(TILE_CACHE_MAX / 4));
    keys.forEach((k) => tileCache.delete(k));
  }
}

function cleanCache(cache) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

/**
 * Production-grade reverse geocode proxy.
 * Prevents client-side CORS/403 blocks from Nominatim on deployed domains.
 * Sends an identifying User-Agent header as strictly required by OSM policy.
 */
exports.reverseGeocode = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);

  if (isNaN(numLat) || isNaN(numLng)) {
    return res.status(400).json({
      success: false,
      message: "Valid lat and lng query parameters are required",
    });
  }

  // Cache key rounded to 4 decimals (~11m resolution)
  const cacheKey = `${numLat.toFixed(4)},${numLng.toFixed(4)}`;
  cleanCache(reverseCache);

  if (reverseCache.has(cacheKey)) {
    return res.status(200).json(reverseCache.get(cacheKey).data);
  }

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${numLat}&lon=${numLng}`;
    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "BloodBank-Emergency-System/1.0 (contact@bloodbank.org)",
        "Accept": "application/json",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.status(200).json({
        success: true,
        lat: numLat,
        lng: numLng,
        city: "",
        state: "",
        displayName: `${numLat.toFixed(4)}, ${numLng.toFixed(4)}`,
      });
    }

    const data = await response.json();
    const address = data.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.suburb ||
      address.county ||
      "";
    const state = address.state || "";
    const displayName = data.display_name || `${numLat.toFixed(4)}, ${numLng.toFixed(4)}`;

    const result = {
      success: true,
      lat: numLat,
      lng: numLng,
      city,
      state,
      displayName,
    };

    reverseCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return res.status(200).json(result);
  } catch (err) {
    console.warn("Reverse geocode upstream error:", err.message);
    return res.status(200).json({
      success: true,
      lat: numLat,
      lng: numLng,
      city: "",
      state: "",
      displayName: `${numLat.toFixed(4)}, ${numLng.toFixed(4)}`,
    });
  }
});

/**
 * Production-grade place search geocode proxy.
 */
exports.searchGeocode = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(200).json({ success: true, results: [] });
  }

  const queryKey = q.trim().toLowerCase();
  cleanCache(searchCache);

  if (searchCache.has(queryKey)) {
    return res.status(200).json(searchCache.get(queryKey).data);
  }

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      q.trim()
    )}&limit=5`;

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "BloodBank-Emergency-System/1.0 (contact@bloodbank.org)",
        "Accept": "application/json",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.status(200).json({ success: true, results: [] });
    }

    const rawResults = await response.json();
    const results = (rawResults || []).map((item) => ({
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      display_name: item.display_name,
      city:
        item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.display_name.split(",")[0],
      state: item.address?.state || "",
    }));

    const result = { success: true, results };
    searchCache.set(queryKey, { timestamp: Date.now(), data: result });
    return res.status(200).json(result);
  } catch (err) {
    console.warn("Search geocode upstream error:", err.message);
    return res.status(200).json({ success: true, results: [] });
  }
});

/**
 * OSM Tile Proxy
 * ─────────────
 * Proxies OpenStreetMap tile requests through the backend so that:
 *  • The server sends a compliant User-Agent (OSM policy requirement)
 *  • Clients on deployed domains avoid 403 / CORS errors
 *  • Responses are cached aggressively (7-day browser cache + in-memory cache)
 *
 * Route: GET /tiles/:z/:x/:y
 */
exports.tileProxy = asyncHandler(async (req, res) => {
  const { z, x, y } = req.params;

  // Validate tile coordinates
  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  // y may have ".png" extension stripped by router but guard anyway
  const yClean = String(y).replace(/\.png$/i, "");
  const yi = parseInt(yClean, 10);

  if (
    isNaN(zi) || isNaN(xi) || isNaN(yi) ||
    zi < 0 || zi > 19 ||
    xi < 0 || yi < 0
  ) {
    return res.status(400).send("Invalid tile coordinates");
  }

  const cacheKey = `${zi}/${xi}/${yi}`;
  cleanTileCache();

  // Serve from in-memory cache if available
  if (tileCache.has(cacheKey)) {
    const cached = tileCache.get(cacheKey);
    if (Date.now() - cached.timestamp < TILE_CACHE_TTL_MS) {
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=604800, immutable"); // 7 days
      res.set("X-Tile-Cache", "HIT");
      return res.send(cached.buffer);
    }
    tileCache.delete(cacheKey);
  }

  // Fetch tile from OpenStreetMap (subdomains a/b/c)
  const subdomains = ["a", "b", "c"];
  const sub = subdomains[(xi + yi) % subdomains.length];
  const osmUrl = `https://${sub}.tile.openstreetmap.org/${zi}/${xi}/${yi}.png`;

  try {
    const upstream = await fetch(osmUrl, {
      headers: {
        "User-Agent": "BloodBank-Emergency-System/1.0 (contact@bloodbank.org)",
        "Accept": "image/png,image/*",
        "Referer": "https://bloodbank.org/",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      console.warn(`[TileProxy] OSM returned ${upstream.status} for ${osmUrl}`);
      return res.status(upstream.status).send("Tile not available");
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store in memory cache
    tileCache.set(cacheKey, { timestamp: Date.now(), buffer });

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=604800, immutable"); // 7 days browser cache
    res.set("X-Tile-Cache", "MISS");
    return res.send(buffer);
  } catch (err) {
    console.warn("[TileProxy] Upstream tile fetch error:", err.message);
    return res.status(502).send("Tile proxy error");
  }
});
