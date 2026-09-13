import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const donorPinIcon = L.divIcon({
  className: "custom-donor-pin",
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

const requestPinIcon = (isNearest = false) =>
  L.divIcon({
    className: "custom-request-pin",
    html: `
    <div style="position: relative; width: 34px; height: 44px; transform: translate(-17px, -44px);">
      <svg viewBox="0 0 384 512" width="34" height="44" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="${isNearest ? "#d97706" : "#e11d48"}" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
      ${
        isNearest
          ? '<div style="position: absolute; top: -10px; right: -8px; background: #fbbf24; color: #78350f; font-size: 10px; font-weight: bold; border-radius: 10px; padding: 1px 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">★ CLOSEST</div>'
          : ""
      }
    </div>
  `,
    iconSize: [34, 44],
    iconAnchor: [17, 44],
  });

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
    if (!mapContainerRef.current) return;

    // Default center to donor coordinates or first request or Hyderabad
    let centerLat = donorCoords?.lat || 17.385;
    let centerLng = donorCoords?.lng || 78.4867;

    const map = L.map(mapContainerRef.current, {
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

    // Add Donor marker if coords exist
    if (donorCoords && donorCoords.lat && donorCoords.lng) {
      const donorLatLng = [donorCoords.lat, donorCoords.lng];
      L.marker(donorLatLng, { icon: donorPinIcon })
        .addTo(map)
        .bindPopup("<strong>📍 You (Donor)</strong><br/>Your current saved location.");
      bounds.extend(donorLatLng);
    }

    // Add Request markers
    requests.forEach((req, index) => {
      let reqLat = req.location?.coordinates?.lat;
      let reqLng = req.location?.coordinates?.lng;

      // Also support [lng, lat]
      if (reqLat == null && Array.isArray(req.location?.coordinates?.coordinates)) {
        reqLng = req.location.coordinates.coordinates[0];
        reqLat = req.location.coordinates.coordinates[1];
      }

      // If no exact coords, offset slightly around center so they're visible
      if (reqLat == null || reqLng == null) {
        reqLat = centerLat + (Math.sin(index + 1) * 0.03);
        reqLng = centerLng + (Math.cos(index + 1) * 0.03);
      }

      const reqLatLng = [reqLat, reqLng];
      bounds.extend(reqLatLng);

      const isNearest = index === 0;
      const marker = L.marker(reqLatLng, {
        icon: requestPinIcon(isNearest),
      }).addTo(map);

      const distanceDisplay =
        typeof req.distanceKm === "number" ? `${req.distanceKm.toFixed(1)} km away` : "Nearby";

      const popupContent = document.createElement("div");
      popupContent.style.minWidth = "180px";
      popupContent.innerHTML = `
        <div style="font-family: inherit; font-size: 0.9rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="background: #e11d48; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">
              ${req.bloodGroup}
            </span>
            <span style="color: #64748b; font-size: 0.8rem; font-weight: 600;">
              ${distanceDisplay}
            </span>
          </div>
          <div style="font-weight: 600; color: #0f172a; margin-top: 4px;">
            ${req.quantity} Unit(s) needed
          </div>
          <div style="color: #475569; font-size: 0.82rem; margin-bottom: 6px;">
            Patient: ${req.requestedBy?.fullName || "In Need"} · ${req.location?.city || ""}
          </div>
          ${
            isNearest
              ? '<div style="color: #b45309; font-size: 0.8rem; font-weight: bold; margin-bottom: 8px;">★ Nearest match to your location!</div>'
              : ""
          }
        </div>
      `;

      if (onAccept) {
        const acceptBtn = document.createElement("button");
        acceptBtn.innerText = busyId === req._id ? "Processing..." : "Accept Request";
        acceptBtn.style.width = "100%";
        acceptBtn.style.padding = "6px 10px";
        acceptBtn.style.background = isNearest ? "#d97706" : "#e11d48";
        acceptBtn.style.color = "white";
        acceptBtn.style.border = "none";
        acceptBtn.style.borderRadius = "4px";
        acceptBtn.style.fontWeight = "600";
        acceptBtn.style.cursor = "pointer";
        acceptBtn.onclick = () => onAccept(req._id);
        popupContent.appendChild(acceptBtn);
      }

      marker.bindPopup(popupContent);
    });

    if (bounds.isValid() && requests.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [donorCoords, requests, busyId]);

  return (
    <div style={{ marginBottom: "1.25rem" }}>
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
          🔵 <strong>Blue Marker</strong>: Your Location
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          🔴 <strong>Red Markers</strong>: Open Blood Requests
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          ⭐ <strong>Gold Marker</strong>: Nearest Blood Request
        </span>
      </div>
    </div>
  );
}
