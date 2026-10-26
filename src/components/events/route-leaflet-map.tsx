"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";

type RouteMarker = { position: LatLngTuple; label: string; color: string };

function FitRoute({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24] });
  }, [map, positions]);
  return null;
}

export function RouteLeafletMap({ positions, markers, title }: { positions: LatLngTuple[]; markers: RouteMarker[]; title: string }) {
  const center: LatLngTuple = positions[0] ?? [0, 0];
  return (
    <div role="region" aria-label={`Mapa do percurso ${title}`}>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-[340px] w-full sm:h-[420px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoute positions={positions} />
        <Polyline positions={positions} pathOptions={{ color: "#e23d0b", weight: 5, opacity: 0.9 }} />
        {markers.map((marker, index) => (
          <CircleMarker key={`${marker.label}-${index}`} center={marker.position} radius={index < 2 ? 7 : 5} pathOptions={{ color: "#fff", weight: 2, fillColor: marker.color, fillOpacity: 1 }}>
            <Tooltip>{marker.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
