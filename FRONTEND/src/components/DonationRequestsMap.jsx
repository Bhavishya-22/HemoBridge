import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 1. Closest Donor Pin (Gold with ★ CLOSEST DONOR badge)
const closestDonorPinIcon = L.divIcon({
  className: "custom-closest-donor-pin",
  html: `
    <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px);">
      <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="#d97706" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
      <div style="position: absolute; top: -10px; right: -16px; background: #fbbf24; color: #78350f; font-size: 9px; font-weight: bold; border-radius: 10px; padding: 1px 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.25); white-space: nowrap;">★ CLOSEST DONOR</div>
    </div>
  `,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
});

// 2. Blood Request Pin (Red with 🩸 REQUEST badge)
const bloodRequestPinIcon = L.divIcon({
  className: "custom-blood-request-pin",
  html: `
    <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px);">
      <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="#e11d48" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
      <div style="position: absolute; top: -10px; right: -12px; background: #e11d48; color: #ffffff; font-size: 9px; font-weight: bold; border-radius: 10px; padding: 1px 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.25); white-space: nowrap;">🩸 REQUEST</div>
    </div>
  `,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
});

function extractReqCoords(location) {
  if (!location) return null;
  const coords = location.coordinates;
  if (!coords) return null;
  if (typeof coords.lat === "number" && typeof coords.lng === "number") {
    return { lat: coords.lat, lng: coords.lng };
  }
  if (Array.isArray(coords.coordinates) && coords.coordinates.length >= 2) {
    return { lat: coords.coordinates[1], lng: coords.coordinates[0] };
  }
  if (Array.isArray(coords) && coords.length >= 2) {
    return { lat: coords[1], lng: coords[0] };
  }
  return null;
}

export default function DonationRequestsMap({
  donorCoords,
  requests = [],
  onAccept,
  busyId,
  height = "380px",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // StrictMode guard: If a previous instance is registered or container has _leaflet_id, clean it up
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const nearestRequest = requests.length > 0 ? requests[0] : null;
    const nearestCoords = nearestRequest ? extractReqCoords(nearestRequest.location) : null;

    let centerLat = donorCoords?.lat || nearestCoords?.lat || 17.385;
    let centerLng = donorCoords?.lng || nearestCoords?.lng || 78.4867;

    const map = L.map(container, {
      center: [centerLat, centerLng],
      zoom: 12,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    // 1. Add Closest Donor marker (Gold pin with ★ CLOSEST DONOR)
    if (donorCoords && typeof donorCoords.lat === "number" && typeof donorCoords.lng === "number") {
      const donorLatLng = [donorCoords.lat, donorCoords.lng];
      L.marker(donorLatLng, { icon: closestDonorPinIcon })
        .addTo(map)
        .bindPopup("<strong>⭐ Closest Donor (You)</strong><br/>Your location as eligible donor.");
      bounds.extend(donorLatLng);
    }

    // 2. Add Patient Blood Request marker (Red pin with 🩸 REQUEST)
    if (nearestRequest && nearestCoords) {
      const reqLatLng = [nearestCoords.lat, nearestCoords.lng];
      bounds.extend(reqLatLng);

      const marker = L.marker(reqLatLng, {
        icon: bloodRequestPinIcon,
      }).addTo(map);

      const distanceDisplay =
        typeof nearestRequest.distanceKm === "number"
          ? `${nearestRequest.distanceKm.toFixed(1)} km away`
          : "Nearby";

      const popupContent = document.createElement("div");
      popupContent.style.minWidth = "190px";
      popupContent.innerHTML = `
        <div style="font-family: inherit; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="background: #e11d48; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">
              ${nearestRequest.bloodGroup} Needed
            </span>
            <span style="color: #64748b; font-size: 0.8rem; font-weight: 600;">
              ${distanceDisplay}
            </span>
          </div>
          <div style="font-weight: 600; color: #0f172a; margin-top: 4px;">
            ${nearestRequest.quantity} Unit(s) needed
          </div>
          <div style="color: #475569; font-size: 0.82rem; margin-bottom: 6px;">
            Patient: ${nearestRequest.requestedBy?.fullName || "In Need"} · ${nearestRequest.location?.city || ""}
          </div>
          <div style="color: #e11d48; font-size: 0.8rem; font-weight: bold; margin-bottom: 8px;">
            📍 Patient Blood Request Location
          </div>
        </div>
      `;

      if (onAccept) {
        const acceptBtn = document.createElement("button");
        acceptBtn.innerText = busyId === nearestRequest._id ? "Processing..." : "Accept Request";
        acceptBtn.style.width = "100%";
        acceptBtn.style.padding = "6px 10px";
        acceptBtn.style.background = "#e11d48";
        acceptBtn.style.color = "white";
        acceptBtn.style.border = "none";
        acceptBtn.style.borderRadius = "4px";
        acceptBtn.style.fontWeight = "600";
        acceptBtn.style.cursor = "pointer";
        acceptBtn.onclick = () => onAccept(nearestRequest._id);
        popupContent.appendChild(acceptBtn);
      }

      marker.bindPopup(popupContent);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
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
  }, [donorCoords, requests, busyId]);

  return (
    <div style={{ marginBottom: "1.25rem", position: "relative", zIndex: 1, isolation: "isolate" }}>
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height,
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "1.2rem",
          marginTop: "0.5rem",
          fontSize: "0.82rem",
          color: "#475569",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          ⭐ <strong>Gold Marker</strong>: Closest Donor (You)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          🔴 <strong>Red Marker</strong>: Blood Request (Patient Location)
        </span>
      </div>
    </div>
  );
}
