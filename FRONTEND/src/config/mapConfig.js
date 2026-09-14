import L from "leaflet";
import { API_BASE } from "./api";

/**
 * Production-ready Map Configuration
 *
 * Why a tile proxy instead of CARTO or direct OSM:
 *  - CARTO (basemaps.cartocdn.com) now requires an API key even on the free tier —
 *    tiles load with an "API KEY REQUIRED" watermark without one.
 *  - Direct OSM (tile.openstreetmap.org) blocks deployed domains and non-compliant
 *    clients (403 Forbidden) unless a valid User-Agent is provided.
 *
 * Solution: our own backend at /tiles/:z/:x/:y proxies requests to OSM with a
 * compliant User-Agent header (as required by OSM Tile Usage Policy), caches
 * responses for 7 days, and returns the raw PNG to the browser. This works
 * identically in dev and production with zero API keys needed.
 */

/**
 * Build the tile URL template for the backend proxy.
 * Leaflet's {z}/{x}/{y} placeholders are preserved as-is in the template string.
 */
function buildTileUrl() {
  // API_BASE is "" in dev (Vite proxy) or the deployed backend URL in production
  return `${API_BASE}/tiles/{z}/{x}/{y}`;
}

export const MAP_CONFIG = {
  tileUrl: buildTileUrl(),
  tileOptions: {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    // Prevent Leaflet from adding {r} or {s} subdomains — our proxy handles load balancing
    subdomains: "",
  },
};

/**
 * Attaches the tile layer to a Leaflet map instance.
 * Call this once, right after L.map(...) is created.
 *
 * @param {import("leaflet").Map} map - A Leaflet map instance
 * @returns {import("leaflet").TileLayer} - The tile layer added to the map
 */
export function attachProductionTileLayer(map) {
  const layer = L.tileLayer(MAP_CONFIG.tileUrl, MAP_CONFIG.tileOptions);
  layer.addTo(map);
  return layer;
}
