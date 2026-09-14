import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { attachProductionTileLayer } from "../config/mapConfig";

const receiverPinIcon = L.divIcon({
  className: "custom-receiver-pin",
  html: `
    <div style="position: relative; width: 32px; height: 42px; transform: translate(-16px, -42px);">
      <svg viewBox="0 0 384 512" width="32" height="42" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="#2563eb" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

const confirmedDonorPinIcon = L.divIcon({
  className: "custom-confirmed-donor-pin",
  html: `
    <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px);">
      <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="#d97706" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
      <div style="position: absolute; top: -10px; right: -12px; background: #fbbf24; color: #78350f; font-size: 9px; font-weight: bold; border-radius: 10px; padding: 1px 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); white-space: nowrap;">★ MATCHED</div>
    </div>
  `,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
});

export default function ConfirmedDonorMap({
  receiverCoords,
  donorCoords,
  height = "210px",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (
      !receiverCoords ||
      typeof receiverCoords.lat !== "number" ||
      typeof receiverCoords.lng !== "number" ||
      !donorCoords ||
      typeof donorCoords.lat !== "number" ||
      typeof donorCoords.lng !== "number"
    ) {
      return;
    }

    // StrictMode guard: If a previous instance is registered or container has _leaflet_id, clean it up first
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const centerLat = (receiverCoords.lat + donorCoords.lat) / 2;
    const centerLng = (receiverCoords.lng + donorCoords.lng) / 2;

    const map = L.map(container, {
      center: [centerLat, centerLng],
      zoom: 12,
    });
    mapInstanceRef.current = map;

    // Attach production-grade CARTO Voyager tile layer with automatic fallback
    attachProductionTileLayer(map);

    const bounds = L.latLngBounds([]);

    // 1. Receiver Pin (Blue)
    const receiverLatLng = [receiverCoords.lat, receiverCoords.lng];
    L.marker(receiverLatLng, { icon: receiverPinIcon })
      .addTo(map)
      .bindPopup("<strong>📍 You (Patient / Request Location)</strong>");
    bounds.extend(receiverLatLng);

    // 2. Confirmed Donor Pin (Gold)
    const donorLatLng = [donorCoords.lat, donorCoords.lng];
    L.marker(donorLatLng, { icon: confirmedDonorPinIcon })
      .addTo(map)
      .bindPopup("<strong>⭐ Confirmed Donor Location</strong>");
    bounds.extend(donorLatLng);

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14, animate: false });
    }

    // StrictMode-safe invalidateSize
    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current === map) {
        map.invalidateSize();
      }
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [receiverCoords, donorCoords]);

  if (
    !receiverCoords ||
    typeof receiverCoords.lat !== "number" ||
    typeof receiverCoords.lng !== "number" ||
    !donorCoords ||
    typeof donorCoords.lat !== "number" ||
    typeof donorCoords.lng !== "number"
  ) {
    return null;
  }

  return (
    <div style={{ marginTop: "0.75rem", marginBottom: "0.5rem", position: "relative", zIndex: 1, isolation: "isolate" }}>
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height,
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "1.2rem",
          marginTop: "0.4rem",
          fontSize: "0.78rem",
          color: "#475569",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          🔵 <strong>You</strong> (Patient)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          ⭐ <strong>Confirmed Donor</strong>
        </span>
      </div>
    </div>
  );
}
