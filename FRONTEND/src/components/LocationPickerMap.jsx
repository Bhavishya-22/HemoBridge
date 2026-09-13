import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Crisp SVG pin icon to avoid bundler asset path issues
const customPinIcon = L.divIcon({
  className: "custom-leaflet-pin",
  html: `
    <div style="
      position: relative;
      width: 32px;
      height: 42px;
      transform: translate(-16px, -42px);
      cursor: pointer;
    ">
      <svg viewBox="0 0 384 512" width="32" height="42" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path fill="#e11d48" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="75" fill="#ffffff"/>
      </svg>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

export default function LocationPickerMap({
  initialLat,
  initialLng,
  onLocationChange,
  height = "320px",
  label = "Select Location on Map",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Default to Hyderabad or initial props
  const defaultLat = initialLat || 17.385;
  const defaultLng = initialLng || 78.4867;

  const [coords, setCoords] = useState({ lat: initialLat || null, lng: initialLng || null });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locatingUser, setLocatingUser] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Reverse geocode lat, lng to city and state via Nominatim
  const reverseGeocode = async (lat, lng) => {
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const city =
          address.city ||
          address.town ||
          address.village ||
          address.suburb ||
          address.county ||
          "";
        const state = address.state || "";
        const displayName = data.display_name || "";

        if (onLocationChange) {
          onLocationChange({
            lat,
            lng,
            city,
            state,
            displayName,
          });
        }
        setStatusMsg(displayName ? `📍 ${displayName.slice(0, 55)}...` : "");
      } else {
        if (onLocationChange) onLocationChange({ lat, lng });
      }
    } catch (err) {
      console.warn("Reverse geocode error:", err.message);
      if (onLocationChange) onLocationChange({ lat, lng });
    } finally {
      setGeocoding(false);
    }
  };

  // Move marker and trigger change
  const setPosition = (lat, lng, shouldReverseGeocode = true) => {
    setCoords({ lat, lng });
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([lat, lng]);
    }
    if (shouldReverseGeocode) {
      reverseGeocode(lat, lng);
    }
  };

  // Search places via Nominatim
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          searchQuery
        )}&limit=5`
      );
      if (res.ok) {
        const results = await res.json();
        setSearchResults(results || []);
      }
    } catch (err) {
      console.warn("Search geocode error:", err);
    } finally {
      setSearching(false);
    }
  };

  // Use browser geolocation GPS
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingUser(false);
        const { latitude, longitude } = pos.coords;
        setPosition(latitude, longitude, true);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 15);
        }
      },
      (err) => {
        setLocatingUser(false);
        alert(`Location detection failed: ${err.message}. You can click anywhere on the map.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: initialLat ? 14 : 12,
    });
    mapInstanceRef.current = map;

    // OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Initial marker
    const marker = L.marker([defaultLat, defaultLng], {
      icon: customPinIcon,
      draggable: true,
    }).addTo(map);
    markerRef.current = marker;

    // Drag end listener
    marker.on("dragend", (event) => {
      const { lat, lng } = event.target.getLatLng();
      setPosition(lat, lng, true);
    });

    // Map click listener
    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      setPosition(lat, lng, true);
    });

    // Fix map sizing after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div className="location-picker-map-wrapper" style={{ margin: "1rem 0", position: "relative", zIndex: 1, isolation: "isolate" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b" }}>
          🗺️ {label}
        </span>
        <button
          type="button"
          onClick={handleDetectLocation}
          disabled={locatingUser}
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            border: "1px solid #fca5a5",
            borderRadius: "6px",
            padding: "0.35rem 0.75rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {locatingUser ? "Locating..." : "📍 Detect My Current Location"}
        </button>
      </div>

      {/* Place search bar */}
      <div style={{ position: "relative", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Search address, locality, or city (e.g., Banjara Hills, Hyderabad)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch(e);
              }
            }}
            style={{
              flex: 1,
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "0.88rem",
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "6px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              fontSize: "0.88rem",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 1000,
              background: "#fff",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              border: "1px solid #e2e8f0",
              maxHeight: "180px",
              overflowY: "auto",
              marginTop: "4px",
            }}
          >
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  const lat = parseFloat(item.lat);
                  const lng = parseFloat(item.lon);
                  setPosition(lat, lng, true);
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView([lat, lng], 15);
                  }
                  setSearchResults([]);
                  setSearchQuery(item.display_name.split(",")[0]);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  borderBottom: "1px solid #f1f5f9",
                  color: "#334155",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                📍 {item.display_name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height,
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          zIndex: 1,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "0.4rem",
          fontSize: "0.8rem",
          color: "#64748b",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span>
          {coords.lat && coords.lng ? (
            <strong style={{ color: "#0f172a" }}>
              Coords: {coords.lat.toFixed(4)}°, {coords.lng.toFixed(4)}°
            </strong>
          ) : (
            "Click on the map or drag the pin to set exact coordinates."
          )}
          {geocoding && " (Retrieving address...)"}
        </span>
        {statusMsg && <span style={{ color: "#047857", fontWeight: 500 }}>{statusMsg}</span>}
      </div>
    </div>
  );
}
