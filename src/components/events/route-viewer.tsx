"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Droplets, Flag, HeartPulse, MapPinned, Mountain, Utensils, Timer, Route as RouteIcon } from "lucide-react";
import type { EventDistance, EventRoute, RoutePoint } from "@/lib/types";
import { formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

const RouteLeafletMap = dynamic(() => import("./route-leaflet-map").then((mod) => mod.RouteLeafletMap), {
  ssr: false,
  loading: () => <div className="h-85 animate-pulse bg-ink-100 sm:h-105" aria-label="A carregar mapa" />,
});

const POINT_STYLE: Record<RoutePoint["type"], { label: string; Icon: React.ComponentType<{ className?: string }>; color: string; fill: string }> = {
  partida: { label: "Partida", Icon: Flag, color: "bg-emerald-100 text-emerald-700", fill: "#059669" },
  chegada: { label: "Chegada", Icon: Flag, color: "bg-brand-100 text-brand-700", fill: "#e23d0b" },
  agua: { label: "Água", Icon: Droplets, color: "bg-sky-100 text-sky-700", fill: "#0284c7" },
  abastecimento: { label: "Abastecimento", Icon: Utensils, color: "bg-amber-100 text-amber-800", fill: "#d97706" },
  medico: { label: "Posto médico", Icon: HeartPulse, color: "bg-red-100 text-red-700", fill: "#dc2626" },
  controlo: { label: "Controlo", Icon: Timer, color: "bg-violet-100 text-violet-700", fill: "#7c3aed" },
};

function pointOnPath(path: [number, number][], fraction: number): [number, number] {
  const i = Math.min(path.length - 1, Math.max(0, Math.round(fraction * (path.length - 1))));
  return path[i];
}

type GpxPoint = { lat: number; lon: number; ele?: number };

function readGpx(xml: string): GpxPoint[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("GPX inválido");
  const points = [...doc.getElementsByTagName("*")].filter((el) => el.localName === "trkpt" || el.localName === "rtept").flatMap((el) => {
    const rawLat = el.getAttribute("lat");
    const rawLon = el.getAttribute("lon");
    if (rawLat == null || rawLon == null) return [];
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    const rawElevation = [...el.getElementsByTagName("*")].find((child) => child.localName === "ele")?.textContent;
    const ele = rawElevation == null ? undefined : Number(rawElevation);
    return Number.isFinite(lat) && Number.isFinite(lon)
      ? [{ lat, lon, ...(ele !== undefined && Number.isFinite(ele) ? { ele } : {}) }]
      : [];
  });
  if (points.length < 2) throw new Error("GPX sem pontos de percurso suficientes");
  return points;
}

function ElevationChart({ data, km }: { data: number[]; km: number }) {
  const min = data.reduce((a, b) => Math.min(a, b), Infinity);
  const max = data.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = Math.max(10, max - min);
  const w = 600;
  const h = 140;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 16 - ((v - min) / range) * (h - 36)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label={`Perfil altimétrico: mínimo ${min} m, máximo ${max} m`}>
        <defs>
          <linearGradient id="elev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f95716" stopOpacity="0.35" />
            <stop offset="1" stopColor="#f95716" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#dfe4ee" strokeDasharray="4 4" />
        ))}
        <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#elev)" />
        <path d={line} fill="none" stroke="#e23d0b" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs font-semibold text-ink-500">
        <span>0 km</span>
        <span>Mín. {min} m · Máx. {max} m</span>
        <span>{formatKm(km)}</span>
      </figcaption>
    </figure>
  );
}

export function RouteViewer({ routes, distances }: { routes: EventRoute[]; distances: EventDistance[] }) {
  const [id, setId] = useState(routes[0]?.distanceId);
  const route = routes.find((r) => r.distanceId === id) ?? routes[0];
  const [gpxPoints, setGpxPoints] = useState<{ url: string; points: GpxPoint[] } | null>(null);
  useEffect(() => {
    const url = route?.gpxUrl;
    if (!url) {
      setGpxPoints(null);
      return;
    }
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o GPX");
        return response.text();
      })
      .then((xml) => setGpxPoints({ url, points: readGpx(xml) }))
      .catch(() => {
        if (!controller.signal.aborted) setGpxPoints(null);
      });
    return () => controller.abort();
  }, [route?.gpxUrl]);
  const dist = distances.find((d) => d.id === route?.distanceId);
  if (!route || !dist) return null;
  const track = gpxPoints?.url === route.gpxUrl ? gpxPoints?.points ?? null : null;
  const positions = track?.map((p) => [p.lat, p.lon] as [number, number]) ?? [];
  const path = route.path;
  const fallbackPath = path.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  const markers = track ? route.points.map((p) => {
    const point = track[Math.min(track.length - 1, Math.max(0, Math.round((p.km / dist.distanceKm) * (track.length - 1))))];
    return { position: [point.lat, point.lon] as [number, number], label: p.name, color: POINT_STYLE[p.type].fill };
  }) : [];
  const elevation = track?.filter((p) => p.ele !== undefined).map((p) => p.ele!) ?? [];
  const chartData = elevation.length > 1 ? elevation : route.elevation;
  const types = [...new Set(route.points.map((p) => p.type))];

  return (
    <div className="space-y-5">
      {routes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Escolha a distância">
          {routes.map((r) => {
            const dd = distances.find((x) => x.id === r.distanceId);
            return (
              <button key={r.distanceId} role="tab" aria-selected={r.distanceId === id} onClick={() => setId(r.distanceId)} className={cn("rounded-xl px-4 py-2.5 text-[15px] font-semibold", r.distanceId === id ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200")}>
                {dd?.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-[#eef4ea]">
          {track ? (
            <RouteLeafletMap positions={positions} markers={markers} title={dist.name} />
          ) : <svg viewBox="0 0 100 100" className="aspect-4/3 w-full" role="img" aria-label={`Mapa do percurso ${dist.name}`}>
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#d7e3d0" strokeWidth="0.3" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
            <path d="M -5 92 C 20 82, 40 98, 60 88 S 95 80, 105 86 L 105 105 L -5 105 Z" fill="#bfdbfe" opacity="0.8" />
            <path d={fallbackPath} fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d={fallbackPath} fill="none" stroke="#e23d0b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            {route.points.map((p, i) => {
              const [x, y] = pointOnPath(path, p.km / dist.distanceKm);
              const s = POINT_STYLE[p.type];
              const big = p.type === "partida" || p.type === "chegada";
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={big ? 3 : 1.7} fill={s.fill} stroke="white" strokeWidth="0.7" />
                  {big && <text x={x + 4} y={y + 1.2} fontSize="3.4" fontWeight="700" fill="#0e1a33">{s.label}</text>}
                </g>
              );
            })}
          </svg>}
          {!track && <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-ink-200/70 bg-white px-4 py-3 text-xs font-semibold text-ink-600">
            {types.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: POINT_STYLE[t].fill }} /> {POINT_STYLE[t].label}
              </span>
            ))}
          </div>}
        </div>

        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2">
            {[
              { Icon: RouteIcon, label: "Distância", value: formatKm(dist.distanceKm) },
              { Icon: Mountain, label: "Desnível +", value: `${dist.elevationGain} m` },
              { Icon: Timer, label: "Tempo limite", value: dist.timeLimit ?? "—" },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-ink-50 p-3">
                <Icon className="size-4.5 text-brand-600" />
                <dt className="mt-2 text-xs text-ink-500">{label}</dt>
                <dd className="font-bold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[15px] text-ink-700"><strong>Piso:</strong> {route.surface}. {route.description}</p>
          {chartData.length > 1 && <ElevationChart data={chartData} km={dist.distanceKm} />}
        </div>
      </div>

      <div>
        <h4 className="mb-3 flex items-center gap-2 font-bold"><MapPinned className="size-4.5 text-brand-600" /> Pontos de apoio no percurso</h4>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {route.points.map((p, i) => {
            const s = POINT_STYLE[p.type];
            return (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-ink-200/70 bg-white p-3">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", s.color)}><s.Icon className="size-4.5" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink-900">{p.name}</span>
                  <span className="text-sm text-ink-500">km {String(p.km).replace(".", ",")}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
