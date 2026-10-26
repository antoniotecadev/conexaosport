import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type {
  Banner,
  Category,
  CategorySlug,
  EventStatus,
  Participant,
  PaymentStatus,
  RaceResult,
  ResultStatus,
  SportsEvent,
  Sponsor,
  User,
} from "@/lib/types";
import { currentTier } from "@/lib/event-utils";

// ───────────── Includes partilhados pelas queries ─────────────

export const eventListInclude = {
  category: true,
  distances: { orderBy: { sortOrder: "asc" }, include: { tiers: { orderBy: { sortOrder: "asc" } } } },
} satisfies Prisma.EventInclude;

export const eventDetailInclude = {
  category: true,
  distances: {
    orderBy: { sortOrder: "asc" },
    include: {
      tiers: { orderBy: { sortOrder: "asc" } },
      route: { include: { points: { orderBy: { km: "asc" } } } },
    },
  },
  kitPickups: { orderBy: { date: "asc" } },
  schedule: { orderBy: { sortOrder: "asc" } },
  regulation: { orderBy: { sortOrder: "asc" } },
  sponsors: { include: { sponsor: true } },
} satisfies Prisma.EventInclude;

type EventListRow = Prisma.EventGetPayload<{ include: typeof eventListInclude }>;
type EventDetailRow = Prisma.EventGetPayload<{ include: typeof eventDetailInclude }>;

// ───────────── Conversões básicas ─────────────

/** Coluna @db.Date → "YYYY-MM-DD" */
export const toDay = (d: Date) => d.toISOString().slice(0, 10);

/** Enum da BD (inscricoes_abertas) → valor da interface (inscricoes-abertas) */
const toUi = <T extends string>(v: string) => v.replace(/_/g, "-") as T;

export function msToHms(ms: number | null) {
  if (ms === null) return null;
  const s = Math.round(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

function paceOf(ms: number | null, km: number) {
  if (ms === null || !km) return null;
  const p = ms / 1000 / km;
  return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
}

// ───────────── Eventos ─────────────

/**
 * Estado mostrado ao público. "Últimas vagas", "Esgotado" e "Inscrições encerradas"
 * não são guardados na BD: calculam-se aqui a partir das vagas e das datas.
 */
function publicStatus(row: EventListRow, today: string): EventStatus {
  if (row.status !== "inscricoes_abertas") return toUi<EventStatus>(row.status);
  if (today > toDay(row.registrationCloses)) return "inscricoes-encerradas";
  if (today < toDay(row.registrationOpens)) return "brevemente";
  const total = row.distances.reduce((a, d) => a + d.totalSlots, 0);
  const left = row.distances.reduce((a, d) => a + Math.max(0, d.totalSlots - d.slotsTaken), 0);
  if (left === 0) return "esgotado";
  if (left < total * 0.1) return "ultimas-vagas";
  return "inscricoes-abertas";
}

export function mapSponsor(s: Prisma.SponsorGetPayload<object>): Sponsor {
  return { id: s.id, name: s.name, logo: s.logoUrl, url: s.url ?? "#", tier: s.tier, active: s.active };
}

/** `editorial`: devolve o estado guardado na BD (para o painel) em vez do estado calculado para o público. */
export function mapEvent(row: EventListRow | EventDetailRow, today: string, opts: { editorial?: boolean } = {}): SportsEvent {
  const detail = "kitPickups" in row ? (row as EventDetailRow) : null;

  const distances: SportsEvent["distances"] = row.distances.map((d) => ({
    id: d.code,
    name: d.name,
    distanceKm: Number(d.distanceKm),
    startTime: d.startTime,
    tiers: d.tiers.map((t) => ({ label: t.label, until: toDay(t.until), price: t.price })),
    totalSlots: d.totalSlots,
    slotsTaken: d.slotsTaken,
    minAge: d.minAge,
    elevationGain: d.elevationGain,
    timeLimit: d.timeLimit ?? undefined,
  }));

  const event: SportsEvent = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    edition: row.edition,
    category: row.categorySlug as CategorySlug,
    categoryName: row.category.name,
    date: toDay(row.date),
    startTime: row.startTime,
    province: row.province,
    city: row.city,
    venue: row.venue,
    address: row.address,
    mapUrl: row.mapUrl ?? `https://maps.google.com/?q=${encodeURIComponent(`${row.venue}, ${row.city}`)}`,
    poster: row.posterUrl,
    cover: row.coverUrl,
    status: opts.editorial ? toUi<EventStatus>(row.status === "rascunho" ? "brevemente" : row.status) : publicStatus(row, today),
    registrationOpens: toDay(row.registrationOpens),
    registrationCloses: toDay(row.registrationCloses),
    summary: row.summary,
    description: row.description,
    highlights: row.highlights,
    organizer: { name: row.organizerName, phone: row.organizerPhone, email: row.organizerEmail },
    distances,
    kit: {
      pickup: detail?.kitPickups.map((k) => ({ date: toDay(k.date), from: k.from, to: k.to })) ?? [],
      location: row.kitLocation,
      address: row.kitAddress,
      items: row.kitItems,
      notes: row.kitNotes,
    },
    schedule: detail?.schedule.map((s) => ({ time: s.time, activity: s.activity })) ?? [],
    regulation: detail?.regulation.map((r) => ({ title: r.title, items: r.items })) ?? [],
    routes:
      detail?.distances.flatMap((d) =>
        d.route
          ? [
              {
                distanceId: d.code,
                description: d.route.description,
                surface: d.route.surface,
                gpxUrl: d.route.gpxUrl,
                path: d.route.path as [number, number][],
                elevation: d.route.elevation as number[],
                points: d.route.points.map((p) => ({ km: Number(p.km), name: p.name, type: p.type })),
              },
            ]
          : [],
      ) ?? [],
    sponsorIds: detail?.sponsors.map((s) => s.sponsorId) ?? [],
    sponsors: detail?.sponsors.map((s) => s.sponsor).filter((s) => s.active).map(mapSponsor),
    createdAt: row.createdAt.toISOString(),
    featured: row.featured,
    resultsPublished: row.resultsPublished,
  };
  event.priceFrom = distances.length ? Math.min(...distances.map((d) => currentTier(d, today).price)) : 0;
  return event;
}

// ───────────── Catálogo ─────────────

export function mapCategory(c: Prisma.CategoryGetPayload<object>): Category {
  return { slug: c.slug as CategorySlug, name: c.name, description: c.description };
}

export function mapBanner(b: Prisma.BannerGetPayload<object>): Banner {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.imageUrl,
    ctaLabel: b.ctaLabel,
    href: b.href,
    kind: b.kind,
    active: b.active,
    order: b.sortOrder,
  };
}

// ───────────── Inscritos (lista pública) ─────────────

export const publicParticipantSelect = {
  id: true,
  bib: true,
  athleteName: true,
  gender: true,
  ageGroup: true,
  club: true,
  province: true,
  nationality: true,
  status: true,
  createdAt: true,
  event: { select: { slug: true } },
  distance: { select: { code: true } },
} satisfies Prisma.RegistrationSelect;

type PublicParticipantRow = Prisma.RegistrationGetPayload<{ select: typeof publicParticipantSelect }>;

const PAYMENT_BY_REGISTRATION: Record<PublicParticipantRow["status"], PaymentStatus> = {
  confirmada: "confirmado",
  pagamento_pendente: "pendente",
  cancelada: "cancelado",
  expirada: "cancelado",
};

/** Só campos públicos — nunca BI, telefone, e-mail ou dados de saúde. */
export function mapParticipant(r: PublicParticipantRow): Participant {
  return {
    id: r.id,
    eventSlug: r.event.slug,
    distanceId: r.distance.code,
    bib: r.bib ?? "—",
    name: r.athleteName,
    gender: r.gender,
    ageGroup: r.ageGroup,
    club: r.club,
    province: r.province,
    nationality: r.nationality,
    paymentStatus: PAYMENT_BY_REGISTRATION[r.status],
    registeredAt: r.createdAt.toISOString(),
  };
}

// ───────────── Resultados ─────────────

export const resultInclude = {
  event: { select: { slug: true } },
  distance: { select: { code: true, distanceKm: true } },
} satisfies Prisma.ResultInclude;

type ResultRow = Prisma.ResultGetPayload<{ include: typeof resultInclude }>;

export function mapResult(r: ResultRow): RaceResult {
  const splits = (r.splits as { label: string; timeMs: number | null }[]) ?? [];
  return {
    id: r.id,
    eventSlug: r.event.slug,
    distanceId: r.distance.code,
    bib: r.bib,
    name: r.name,
    gender: r.gender,
    ageGroup: r.ageGroup,
    club: r.club,
    nationality: r.nationality,
    position: r.position,
    positionGender: r.positionGender,
    positionAgeGroup: r.positionAgeGroup,
    chipTime: msToHms(r.chipTimeMs),
    gunTime: msToHms(r.gunTimeMs),
    pace: paceOf(r.chipTimeMs, Number(r.distance.distanceKm)),
    status: toUi<ResultStatus>(r.status),
    splits: splits.map((s) => ({ label: s.label, time: msToHms(s.timeMs) ?? "—" })),
  };
}

// ───────────── Utilizadores ─────────────

export const profileInclude = { _count: { select: { staffOf: true } } } satisfies Prisma.ProfileInclude;
type ProfileRow = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

export function mapProfile(p: ProfileRow): User {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone ?? "",
    role: p.role,
    birthDate: p.birthDate ? toDay(p.birthDate) : "",
    gender: p.gender ?? undefined,
    documentType: p.documentType === "PASSAPORTE" ? "Passaporte" : "BI",
    documentNumber: p.documentNumber ?? "",
    province: p.province ?? "",
    city: p.city ?? "",
    club: p.club ?? "",
    tshirt: p.tshirt ?? undefined,
    bloodType: p.bloodType ?? undefined,
    emergencyContact: { name: p.emergencyName ?? "", phone: p.emergencyPhone ?? "", relation: p.emergencyRelation ?? "" },
    notifications: { sms: p.notifySms, email: p.notifyEmail, whatsapp: p.notifyWhatsapp },
    staffEvents: p._count.staffOf,
    createdAt: p.createdAt.toISOString(),
    active: p.active,
  };
}
