// Modelos de dados do portal: contrato entre o servidor (src/server/mappers.ts, a partir da BD) e os componentes.

export type CategorySlug = string;

export interface Category {
  slug: CategorySlug;
  name: string;
  description: string;
}

export type EventStatus =
  | "brevemente" // inscrições ainda não abriram
  | "inscricoes-abertas"
  | "ultimas-vagas"
  | "esgotado"
  | "inscricoes-encerradas" // prazo de inscrição terminou
  | "a-decorrer"
  | "terminado"
  | "cancelado";

export interface PriceTier {
  label: string; // ex.: "1ª fase"
  until: string; // ISO date (inclusive)
  price: number; // Kz
}

export interface EventDistance {
  id: string;
  name: string; // ex.: "10 km Corrida"
  distanceKm: number;
  startTime: string; // HH:mm
  tiers: PriceTier[];
  totalSlots: number;
  slotsTaken: number;
  minAge: number;
  elevationGain: number; // metros
  timeLimit?: string; // ex.: "6h00"
}

export interface RoutePoint {
  km: number;
  name: string;
  type: "partida" | "chegada" | "agua" | "abastecimento" | "medico" | "controlo";
}

export interface EventRoute {
  distanceId: string;
  description: string;
  surface: string; // ex.: "Asfalto 100%"
  gpxUrl?: string | null;
  // Caminho estilizado (coordenadas 0–100) usado para desenhar o mapa do percurso
  path: [number, number][];
  elevation: number[]; // altitude em metros, amostras ao longo do percurso
  points: RoutePoint[];
}

export interface RegulationSection {
  title: string;
  items: string[];
}

export interface SportsEvent {
  id: string;
  slug: string;
  title: string;
  edition: number;
  category: CategorySlug;
  date: string; // ISO YYYY-MM-DD
  startTime: string; // HH:mm (hora de Luanda, WAT)
  province: string;
  city: string;
  venue: string;
  address: string;
  mapUrl: string;
  poster: string; // cartaz (vertical)
  cover: string; // imagem horizontal
  status: EventStatus;
  registrationOpens: string; // ISO
  registrationCloses: string; // ISO
  summary: string;
  description: string[];
  highlights: string[];
  organizer: { name: string; phone: string; email: string };
  distances: EventDistance[];
  kit: {
    pickup: { date: string; from: string; to: string }[];
    location: string;
    address: string;
    items: string[];
    notes: string[];
  };
  schedule: { time: string; activity: string }[];
  regulation: RegulationSection[];
  routes: EventRoute[];
  sponsorIds: string[];
  createdAt: string; // ISO — usado para "Adicionados recentemente"
  featured?: boolean;
  // Preenchidos pela base de dados (src/server/mappers.ts); ausentes nos mocks
  categoryName?: string;
  resultsPublished?: boolean;
  priceFrom?: number; // preço mais baixo em vigor hoje (Kz)
  sponsors?: Sponsor[]; // só na página de detalhe
}

export type Gender = "M" | "F";

export type PaymentStatus = "confirmado" | "pendente" | "cancelado";

export interface Participant {
  id: string;
  eventSlug: string;
  distanceId: string;
  bib: string; // dorsal
  name: string;
  gender: Gender;
  ageGroup: string; // ex.: "Sénior", "Veterano 40"
  club: string;
  province: string;
  nationality: string;
  paymentStatus: PaymentStatus;
  registeredAt: string; // ISO
}

export type ResultStatus = "terminou" | "desistiu" | "desclassificado" | "nao-partiu";

export interface RaceResult {
  id: string;
  eventSlug: string;
  distanceId: string;
  bib: string;
  name: string;
  gender: Gender;
  ageGroup: string;
  club: string;
  nationality: string;
  position: number | null; // geral
  positionGender: number | null;
  positionAgeGroup: number | null;
  chipTime: string | null; // HH:MM:SS
  gunTime: string | null;
  pace: string | null; // min/km
  status: ResultStatus;
  splits: { label: string; time: string }[];
}

export type UserRole = "atleta" | "organizador" | "admin";

/** Utilizador com sessão iniciada. Os campos de texto vêm vazios ("") se ainda não foram preenchidos
 * (são pedidos na primeira inscrição). */
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  birthDate: string;
  gender?: Gender;
  documentType: "BI" | "Passaporte";
  documentNumber: string;
  province: string;
  city: string;
  club: string;
  tshirt?: TShirtSize;
  bloodType?: string;
  emergencyContact: { name: string; phone: string; relation: string };
  notifications?: { sms: boolean; email: boolean; whatsapp: boolean };
  /** Nº de eventos onde a pessoa está na equipa (organizador/staff) — dá acesso ao painel. */
  staffEvents?: number;
  createdAt: string;
  active: boolean;
}

export type TShirtSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

/** Pagamento MANUAL (D1): o atleta paga fora do site e envia o comprovativo. */
export type PaymentMethod = "multicaixa-express" | "transferencia" | "deposito" | "kwik";

/** Estado de um pagamento manual. */
export type PaymentState = "pendente" | "em-analise" | "confirmado" | "rejeitado" | "expirado" | "cancelado" | "reembolsado";

/** Contas para onde o atleta paga (do evento ou, por omissão, da ConexãoSport). */
export interface PaymentAccounts {
  iban: { bank: string; holder: string; iban: string }[];
  multicaixaExpress?: { phone: string; holder: string };
  kwik?: { id: string; holder: string };
  depositInstructions?: string;
  /** WhatsApp (só dígitos, com 244) para onde o atleta envia o comprovativo — do organizador do evento. */
  whatsapp?: string;
  proofDeadlineHours: number;
}

export type RegistrationStatus = "confirmada" | "pagamento-pendente" | "cancelada" | "expirada";

export interface Registration {
  id: string;
  code: string; // código da inscrição, ex.: CS-2026-00123
  userId: string;
  userName: string;
  eventSlug: string;
  distanceId: string;
  bib: string;
  status: RegistrationStatus;
  tshirt: TShirtSize;
  payment: {
    method: PaymentMethod;
    state: PaymentState;
    amount: number;
    reference: string; // descritivo a indicar no pagamento (= código da inscrição)
    expiresAt?: string; // prazo para enviar o comprovativo
    confirmedAt?: string;
    reviewNote?: string; // motivo da rejeição
  };
  kitStatus: "por-levantar" | "levantado";
  createdAt: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  ctaLabel: string;
  href: string;
  kind: "evento" | "publicidade" | "memoria"; // memoria = fotos de edições anteriores
  active: boolean;
  order: number;
}

export interface Sponsor {
  id: string;
  name: string;
  logo: string;
  url: string;
  tier: "principal" | "oficial" | "apoio";
  active: boolean;
}

/** Inscrição do utilizador com o evento e a distância (perfil). */
export interface RegistrationWithEvent extends Registration {
  event: SportsEvent;
  distance: EventDistance | undefined;
  /** Contas para pagar (só nas inscrições por pagar). */
  accounts?: PaymentAccounts;
}

/** Resultado do utilizador com o evento e a distância (perfil). */
export interface ResultWithEvent extends RaceResult {
  event: SportsEvent;
  distance: EventDistance | undefined;
}
