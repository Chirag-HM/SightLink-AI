import { useEffect, useRef } from 'react';
import L from 'leaflet';

function getTileConfig() {
  const customUrl = import.meta.env.VITE_MAP_TILE_URL;
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  if (customUrl) {
    return { url: customUrl, attribution: '&copy; OpenStreetMap contributors' };
  }
  if (mapboxToken) {
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      attribution: '&copy; Mapbox &copy; OpenStreetMap',
      tileSize: 512,
      zoomOffset: -1,
    };
  }
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };
}

export default function LiveAssistanceMap({
  userLocation,
  volunteerLocation,
  trail = [],
  safeZone = null,
  heightClass = 'h-72 md:h-96',
  label = 'Live assistance and location map',
  userLabel = 'User',
  peerLegendLabel = 'Volunteer',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);

  const hasUser =
    userLocation &&
    Number.isFinite(Number(userLocation.latitude ?? userLocation.lat)) &&
    Number.isFinite(Number(userLocation.longitude ?? userLocation.lng));
  const hasVol =
    volunteerLocation &&
    Number.isFinite(Number(volunteerLocation.latitude ?? volunteerLocation.lat)) &&
    Number.isFinite(Number(volunteerLocation.longitude ?? volunteerLocation.lng));

  const uLat = hasUser ? Number(userLocation.latitude ?? userLocation.lat) : 12.9716;
  const uLng = hasUser ? Number(userLocation.longitude ?? userLocation.lng) : 77.5946;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: [uLat, uLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: true,
    });

    const tileCfg = getTileConfig();
    L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: 19,
      ...(tileCfg.tileSize ? { tileSize: tileCfg.tileSize, zoomOffset: tileCfg.zoomOffset } : {}),
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints = [];

    if (safeZone && Number.isFinite(Number(safeZone.lat)) && Number.isFinite(Number(safeZone.lng))) {
      const sLat = Number(safeZone.lat);
      const sLng = Number(safeZone.lng);
      L.circle([sLat, sLng], {
        radius: Number(safeZone.radius_m) || 250,
        color: '#065F46',
        weight: 1.5,
        dashArray: '6 4',
        fillColor: '#059669',
        fillOpacity: 0.1,
      })
        .bindTooltip(`Safe Zone: ${safeZone.name || 'Saved Zone'}`)
        .addTo(group);
      boundsPoints.push([sLat, sLng]);
    }

    if (Array.isArray(trail) && trail.length > 0) {
      const coords = trail
        .map((t) => [Number(t.latitude ?? t.lat), Number(t.longitude ?? t.lng)])
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
      if (coords.length > 1) {
        L.polyline(coords, {
          color: '#047857',
          weight: 3,
          opacity: 0.85,
        }).addTo(group);
        coords.forEach((c) => boundsPoints.push(c));
      }
    }

    if (hasUser) {
      L.circleMarker([uLat, uLng], {
        radius: 10,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#065F46',
        fillOpacity: 1,
      })
        .bindPopup(userLocation?.popupLabel || `${userLabel} Location`)
        .addTo(group);
      boundsPoints.push([uLat, uLng]);
    }

    if (hasVol) {
      const vLat = Number(volunteerLocation.latitude ?? volunteerLocation.lat);
      const vLng = Number(volunteerLocation.longitude ?? volunteerLocation.lng);
      L.circleMarker([vLat, vLng], {
        radius: 9,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#B88E3D',
        fillOpacity: 1,
      })
        .bindPopup(
          volunteerLocation.popupLabel ||
            (volunteerLocation.name ? `${peerLegendLabel}: ${volunteerLocation.name}` : peerLegendLabel)
        )
        .addTo(group);
      boundsPoints.push([vLat, vLng]);

      if (hasUser) {
        L.polyline(
          [
            [uLat, uLng],
            [vLat, vLng],
          ],
          {
            color: '#9A7227',
            weight: 2.5,
            dashArray: '6 6',
            opacity: 0.9,
          }
        ).addTo(group);
      }
    }

    if (boundsPoints.length >= 2) {
      map.fitBounds(boundsPoints, { padding: [36, 36], maxZoom: 17 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 16);
    }
  }, [hasUser, hasVol, uLat, uLng, volunteerLocation, trail, safeZone]);

  return (
    <div className="rounded-2xl overflow-hidden border border-[#DCD2BF] bg-[#EFECE4] shadow-card">
      <div
        ref={containerRef}
        className={`w-full ${heightClass} map-grid`}
        role="region"
        aria-label={label}
      />
      <div className="px-4 py-2.5 bg-[#FAF7F0] border-t border-[#DCD2BF] flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#354B40]">
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#065F46] inline-block" aria-hidden="true" />
          {userLabel}: {hasUser ? `${uLat.toFixed(5)}, ${uLng.toFixed(5)}` : 'Awaiting GPS fix'}
        </span>
        {hasVol && (
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B88E3D] inline-block" aria-hidden="true" />
            {volunteerLocation?.name || peerLegendLabel}:{' '}
            {Number(volunteerLocation.latitude ?? volunteerLocation.lat).toFixed(5)},{' '}
            {Number(volunteerLocation.longitude ?? volunteerLocation.lng).toFixed(5)}
          </span>
        )}
      </div>
    </div>
  );
}

