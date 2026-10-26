"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Handshake,
  Image as ImageIcon,
  Info,
  Map as MapIcon,
  Package,
  Plus,
  Ruler,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EVENT_STATUS } from "@/lib/format";
import { PROVINCES } from "@/lib/constants";
import { route as makeRoute } from "@/lib/route-helpers";
import type { CategorySlug, EventDistance, EventStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type AdminEvent, slugify, uid, useAdmin } from "./admin-store";
import { FileUpload, FormSection, ImageUpload, Toggle } from "./admin-ui";

type StepId = "info" | "media" | "distances" | "kit" | "schedule" | "regulation" | "route" | "sponsors";

const STEPS: { id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "info", label: "Informação básica", icon: Info },
  { id: "media", label: "Cartaz & imagem", icon: ImageIcon },
  { id: "distances", label: "Distâncias & preços", icon: Ruler },
  { id: "kit", label: "Kit", icon: Package },
  { id: "schedule", label: "Programa", icon: ClipboardList },
  { id: "regulation", label: "Regulamento", icon: FileText },
  { id: "route", label: "Percurso", icon: MapIcon },
  { id: "sponsors", label: "Patrocinadores", icon: Handshake },
];

type Errors = Record<string, string>;

function emptyDistance(): EventDistance {
  return { id: uid("d"), name: "", distanceKm: 0, startTime: "07:00", tiers: [{ label: "Preço único", until: "", price: 0 }], totalSlots: 0, slotsTaken: 0, minAge: 16, elevationGain: 0, timeLimit: "" };
}

function emptyEvent(): AdminEvent {
  return {
    id: uid("ev"),
    slug: "",
    title: "",
    edition: 1,
    category: "corrida",
    date: "",
    startTime: "07:00",
    province: "Luanda",
    city: "Luanda",
    venue: "",
    address: "",
    mapUrl: "",
    poster: "",
    cover: "",
    status: "brevemente",
    registrationOpens: "",
    registrationCloses: "",
    summary: "",
    description: [],
    highlights: [],
    organizer: { name: "", phone: "", email: "" },
    distances: [emptyDistance()],
    kit: { pickup: [], location: "", address: "", items: [], notes: [] },
    schedule: [],
    regulation: [],
    routes: [],
    sponsorIds: [],
    createdAt: new Date().toISOString(),
    draft: true,
    regulationPdf: null,
    routeFiles: {},
  };
}

/** Em que passo está cada campo (para saltar para o primeiro erro). */
function stepOf(key: string): StepId {
  if (key.startsWith("dist") || key === "distances") return "distances";
  if (key.startsWith("kit")) return "kit";
  if (key.startsWith("schedule")) return "schedule";
  if (key.startsWith("reg-")) return "regulation";
  if (key === "poster") return "media";
  return "info";
}

function validate(e: AdminEvent, publish: boolean, slugTaken: boolean): Errors {
  const err: Errors = {};
  if (!e.title.trim()) err.title = "Indique o título do evento.";
  if (!e.slug.trim()) err.slug = "Indique o endereço (slug) do evento.";
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) err.slug = "Use apenas letras minúsculas, números e hífenes.";
  else if (slugTaken) err.slug = "Já existe um evento com este endereço.";
  if (!publish) return err;

  if (!e.date) err.date = "Indique a data do evento.";
  if (!e.startTime) err.startTime = "Indique a hora de início.";
  if (!e.city.trim()) err.city = "Indique a cidade.";
  if (!e.venue.trim()) err.venue = "Indique o local.";
  if (!e.edition || e.edition < 1) err.edition = "A edição deve ser 1 ou superior.";
  if (!e.registrationOpens) err.registrationOpens = "Indique quando abrem as inscrições.";
  if (!e.registrationCloses) err.registrationCloses = "Indique quando fecham as inscrições.";
  if (e.registrationOpens && e.registrationCloses && e.registrationCloses < e.registrationOpens) err.registrationCloses = "O fecho tem de ser depois da abertura.";
  if (e.registrationCloses && e.date && e.registrationCloses > e.date) err.registrationCloses = "As inscrições devem fechar até ao dia do evento.";
  if (!e.summary.trim()) err.summary = "Escreva um resumo curto (aparece nos cartões).";
  else if (e.summary.length > 220) err.summary = "O resumo deve ter no máximo 220 caracteres.";
  if (e.mapUrl && !/^https?:\/\//.test(e.mapUrl)) err.mapUrl = "O link deve começar por http:// ou https://";
  if (!e.poster) err.poster = "Carregue o cartaz do evento.";

  if (e.distances.length === 0) err.distances = "Adicione pelo menos uma distância.";
  e.distances.forEach((d, i) => {
    if (!d.name.trim()) err[`dist-${i}-name`] = "Indique o nome.";
    if (!(d.distanceKm > 0)) err[`dist-${i}-km`] = "Km inválido.";
    if (!d.startTime) err[`dist-${i}-start`] = "Indique a hora.";
    if (!(d.totalSlots > 0)) err[`dist-${i}-slots`] = "Indique as vagas.";
    if (d.tiers.length === 0) err[`dist-${i}-tiers`] = "Adicione pelo menos um preço.";
    d.tiers.forEach((t, j) => {
      if (!t.label.trim()) err[`dist-${i}-tier-${j}-label`] = "Indique a fase.";
      if (!t.until) err[`dist-${i}-tier-${j}-until`] = "Indique a data.";
      if (!(t.price >= 0) || Number.isNaN(t.price)) err[`dist-${i}-tier-${j}-price`] = "Preço inválido.";
    });
  });
  e.kit.pickup.forEach((p, i) => {
    if (!p.date) err[`kit-${i}-date`] = "Indique a data.";
  });
  e.schedule.forEach((s, i) => {
    if (!s.time || !s.activity.trim()) err[`schedule-${i}`] = "Preencha a hora e a actividade.";
  });
  e.regulation.forEach((r, i) => {
    if (!r.title.trim()) err[`reg-${i}`] = "Indique o título da secção.";
  });
  return err;
}

export function EventForm({ eventId }: { eventId?: string }) {
  const { data, hydrated } = useAdmin();
  const existing = eventId ? data.events.find((e) => e.id === eventId) : undefined;

  // Espera pelos dados guardados no navegador para não abrir o formulário com dados desactualizados
  if (!hydrated) return null;
  if (eventId && !existing) {
    return (
      <EmptyState
        title="Evento não encontrado"
        description="Este evento pode ter sido eliminado."
        action={
          <ButtonLink href="/admin/eventos" variant="outline">
            <ArrowLeft /> Voltar aos eventos
          </ButtonLink>
        }
      />
    );
  }
  return <EventFormInner key={existing?.id ?? "novo"} initial={existing} />;
}

function EventFormInner({ initial }: { initial?: AdminEvent }) {
  const { data, create, update } = useAdmin();
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial;
  const [ev, setEv] = useState<AdminEvent>(() => (initial ? JSON.parse(JSON.stringify(initial)) : emptyEvent()));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [step, setStep] = useState<StepId>("info");
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState<null | "draft" | "publish">(null);

  const set = (patch: Partial<AdminEvent>) => setEv((e) => ({ ...e, ...patch }));
  const slugTaken = (slug: string) => data.events.some((x) => x.slug === slug && x.id !== ev.id);

  // Revalida em tempo real depois da primeira tentativa de guardar
  const liveErrors = useMemo(() => (submitted ? validate(ev, submitted === "publish", slugTaken(ev.slug)) : errors), [ev, submitted]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = (k: string) => liveErrors[k];
  const stepErrors = (s: StepId) => Object.keys(liveErrors).filter((k) => stepOf(k) === s).length;

  function setTitle(title: string) {
    const patch: Partial<AdminEvent> = { title };
    if (!slugTouched) patch.slug = slugify(`${title}${ev.date ? `-${ev.date.slice(0, 4)}` : ""}`);
    set(patch);
  }
  function setDate(date: string) {
    const patch: Partial<AdminEvent> = { date };
    if (!slugTouched && ev.title) patch.slug = slugify(`${ev.title}${date ? `-${date.slice(0, 4)}` : ""}`);
    set(patch);
  }

  function save(mode: "draft" | "publish") {
    const e = validate(ev, mode === "publish", slugTaken(ev.slug));
    setSubmitted(mode);
    setErrors(e);
    const keys = Object.keys(e);
    if (keys.length) {
      setStep(stepOf(keys[0]));
      toast({ tone: "error", title: "Há campos por corrigir", description: `${keys.length} ${keys.length === 1 ? "erro encontrado" : "erros encontrados"}. Veja os passos assinalados a vermelho.` });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Garante um percurso por distância (o mapa estilizado é gerado automaticamente)
    const routes = ev.distances.map((d, i) => {
      const r = ev.routes.find((x) => x.distanceId === d.id);
      if (r) return r;
      return makeRoute(d.id, d.distanceKm || 1, { seed: 100 + i + ev.title.length, base: 20, amplitude: Math.max(5, d.elevationGain / 4), surface: "", description: "" });
    });
    const final: AdminEvent = { ...ev, routes, draft: mode === "draft", title: ev.title.trim() };
    if (isNew) create("events", final);
    else update("events", ev.id, final);
    toast({
      title: mode === "publish" ? "Evento publicado" : "Rascunho guardado",
      description: final.title,
    });
    router.push("/admin/eventos");
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="pb-4">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/admin/eventos" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900">
            <ArrowLeft className="size-4" /> Eventos
          </Link>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{isNew ? "Criar evento" : ev.title || "Editar evento"}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            {ev.draft ? <Badge tone="gray">Rascunho</Badge> : <Badge tone="green">Publicado</Badge>}
            {!isNew && <span>/eventos/{ev.slug}</span>}
          </div>
        </div>
        {!isNew && !ev.draft && (
          <ButtonLink href={`/eventos/${ev.slug}`} target="_blank" variant="outline" size="sm">
            <ExternalLink /> Ver no site
          </ButtonLink>
        )}
      </div>

      {Object.keys(liveErrors).length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Corrija os campos assinalados antes de guardar.</p>
            <p className="mt-0.5">
              Passos com erros:{" "}
              {STEPS.filter((s) => stepErrors(s.id) > 0)
                .map((s) => s.label)
                .join(", ")}
              .
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Navegação por passos */}
        <nav aria-label="Secções do formulário" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ol className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
            {STEPS.map((s, i) => {
              const n = stepErrors(s.id);
              const active = s.id === step;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                      active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-white hover:text-ink-900",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                        n ? "bg-red-500 text-white" : active ? "bg-white/15" : "bg-ink-200/70 text-ink-600",
                      )}
                    >
                      {n ? "!" : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {step === "info" && <InfoStep ev={ev} set={set} err={err} setTitle={setTitle} setDate={setDate} onSlug={(slug) => (setSlugTouched(true), set({ slug }))} />}
          {step === "media" && <MediaStep ev={ev} set={set} err={err} />}
          {step === "distances" && <DistancesStep ev={ev} set={set} err={err} />}
          {step === "kit" && <KitStep ev={ev} set={set} err={err} />}
          {step === "schedule" && <ScheduleStep ev={ev} set={set} err={err} />}
          {step === "regulation" && <RegulationStep ev={ev} set={set} err={err} />}
          {step === "route" && <RouteStep ev={ev} set={set} />}
          {step === "sponsors" && <SponsorsStep ev={ev} set={set} />}

          <div className="flex justify-between">
            <Button variant="ghost" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1].id)}>
              <ChevronLeft /> Anterior
            </Button>
            <Button variant="ghost" disabled={stepIndex === STEPS.length - 1} onClick={() => setStep(STEPS[stepIndex + 1].id)}>
              Seguinte <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      {/* Barra de gravação fixa */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="hidden text-sm text-ink-500 sm:block">
            {ev.draft ? "Os rascunhos não aparecem no site." : "Este evento está visível no site."} Campos com <span className="text-brand-600">*</span> são obrigatórios para publicar.
          </p>
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => save("draft")}>
              <Save /> Guardar rascunho
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => save("publish")}>
              <Send /> {ev.draft ? "Publicar" : "Guardar e publicar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type StepProps = { ev: AdminEvent; set: (p: Partial<AdminEvent>) => void; err: (k: string) => string | undefined };

const num = (v: string) => (v === "" ? 0 : Number(v));

function InfoStep({ ev, set, err, setTitle, setDate, onSlug }: StepProps & { setTitle: (v: string) => void; setDate: (v: string) => void; onSlug: (v: string) => void }) {
  const { data } = useAdmin();
  return (
    <>
      <FormSection title="Informação básica" description="Dados principais que aparecem na página do evento.">
        <Field label="Título" htmlFor="title" required error={err("title")}>
          <Input id="title" value={ev.title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Maratona Internacional de Luanda" aria-invalid={!!err("title")} />
        </Field>
        <Field label="Endereço (slug)" htmlFor="slug" required error={err("slug")} hint="Gerado a partir do título. Aparece no link: /eventos/…">
          <Input id="slug" value={ev.slug} onChange={(e) => onSlug(slugify(e.target.value) || e.target.value.toLowerCase())} aria-invalid={!!err("slug")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Categoria" htmlFor="category" required>
            <Select id="category" value={ev.category} onChange={(e) => set({ category: e.target.value as CategorySlug })}>
              {data.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Edição" htmlFor="edition" required error={err("edition")}>
            <Input id="edition" type="number" min={1} value={ev.edition || ""} onChange={(e) => set({ edition: num(e.target.value) })} aria-invalid={!!err("edition")} />
          </Field>
          <Field label="Estado" htmlFor="status" required>
            <Select id="status" value={ev.status} onChange={(e) => set({ status: e.target.value as EventStatus })}>
              {(Object.keys(EVENT_STATUS) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EVENT_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Data" htmlFor="date" required error={err("date")}>
            <Input id="date" type="date" value={ev.date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!err("date")} />
          </Field>
          <Field label="Hora de início" htmlFor="startTime" required error={err("startTime")} hint="Hora de Luanda (WAT)">
            <Input id="startTime" type="time" value={ev.startTime} onChange={(e) => set({ startTime: e.target.value })} aria-invalid={!!err("startTime")} />
          </Field>
          <Field label="Abertura das inscrições" htmlFor="opens" required error={err("registrationOpens")}>
            <Input id="opens" type="date" value={ev.registrationOpens} onChange={(e) => set({ registrationOpens: e.target.value })} aria-invalid={!!err("registrationOpens")} />
          </Field>
          <Field label="Fecho das inscrições" htmlFor="closes" required error={err("registrationCloses")}>
            <Input id="closes" type="date" value={ev.registrationCloses} onChange={(e) => set({ registrationCloses: e.target.value })} aria-invalid={!!err("registrationCloses")} />
          </Field>
        </div>
        <Toggle checked={!!ev.featured} onChange={(featured) => set({ featured })} label="Destacar na página inicial" />
      </FormSection>

      <FormSection title="Local">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Província" htmlFor="province" required>
            <Select id="province" value={ev.province} onChange={(e) => set({ province: e.target.value })}>
              {PROVINCES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cidade / município" htmlFor="city" required error={err("city")}>
            <Input id="city" value={ev.city} onChange={(e) => set({ city: e.target.value })} aria-invalid={!!err("city")} />
          </Field>
          <Field label="Local" htmlFor="venue" required error={err("venue")} hint="Ex.: Marginal de Luanda">
            <Input id="venue" value={ev.venue} onChange={(e) => set({ venue: e.target.value })} aria-invalid={!!err("venue")} />
          </Field>
          <Field label="Morada" htmlFor="address">
            <Input id="address" value={ev.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>
        <Field label="Link do mapa" htmlFor="mapUrl" error={err("mapUrl")} hint="Link do Google Maps para o ponto de partida.">
          <Input id="mapUrl" type="url" value={ev.mapUrl} onChange={(e) => set({ mapUrl: e.target.value })} placeholder="https://maps.google.com/?q=…" aria-invalid={!!err("mapUrl")} />
        </Field>
      </FormSection>

      <FormSection title="Descrição">
        <Field label="Resumo" htmlFor="summary" required error={err("summary")} hint={`${ev.summary.length}/220 caracteres · aparece nos cartões de evento.`}>
          <Textarea id="summary" rows={2} className="min-h-20" value={ev.summary} onChange={(e) => set({ summary: e.target.value })} aria-invalid={!!err("summary")} />
        </Field>
        <Field label="Descrição completa" htmlFor="description" hint="Separe os parágrafos com uma linha em branco.">
          <Textarea
            id="description"
            rows={6}
            value={ev.description.join("\n\n")}
            onChange={(e) => set({ description: e.target.value.split(/\n\s*\n/) })}
            onBlur={() => set({ description: ev.description.map((p) => p.trim()).filter(Boolean) })}
          />
        </Field>
        <Field label="Destaques" hint="Pequenas frases, ex.: “Percurso plano”, “Medalha para todos”.">
          <ListEditor items={ev.highlights} onChange={(highlights) => set({ highlights })} placeholder="Novo destaque" addLabel="Adicionar destaque" />
        </Field>
      </FormSection>

      <FormSection title="Organizador">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Nome" htmlFor="org-name">
            <Input id="org-name" value={ev.organizer.name} onChange={(e) => set({ organizer: { ...ev.organizer, name: e.target.value } })} />
          </Field>
          <Field label="Telemóvel" htmlFor="org-phone">
            <Input id="org-phone" type="tel" value={ev.organizer.phone} onChange={(e) => set({ organizer: { ...ev.organizer, phone: e.target.value } })} placeholder="+244 9XX XXX XXX" />
          </Field>
          <Field label="E-mail" htmlFor="org-email">
            <Input id="org-email" type="email" value={ev.organizer.email} onChange={(e) => set({ organizer: { ...ev.organizer, email: e.target.value } })} />
          </Field>
        </div>
      </FormSection>
    </>
  );
}

function MediaStep({ ev, set, err }: StepProps) {
  return (
    <FormSection title="Cartaz & imagem" description="As imagens são pré-visualizadas localmente (upload simulado).">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,240px)_1fr]">
        <Field label="Cartaz (vertical)" required error={err("poster")} hint="Recomendado 1080 × 1350 px.">
          <ImageUpload value={ev.poster} onChange={(poster) => set({ poster })} aspect="aspect-[4/5]" label="Carregar cartaz" />
        </Field>
        <Field label="Imagem de capa (horizontal)" hint="Usada no topo da página do evento. Recomendado 1920 × 1080 px.">
          <ImageUpload value={ev.cover} onChange={(cover) => set({ cover })} aspect="aspect-video" label="Carregar imagem de capa" />
        </Field>
      </div>
    </FormSection>
  );
}

function DistancesStep({ ev, set, err }: StepProps) {
  const setDist = (i: number, patch: Partial<EventDistance>) => set({ distances: ev.distances.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  const removeDist = (i: number) => {
    const id = ev.distances[i].id;
    set({ distances: ev.distances.filter((_, k) => k !== i), routes: ev.routes.filter((r) => r.distanceId !== id) });
  };

  return (
    <>
      {err("distances") && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{err("distances")}</p>}
      {ev.distances.map((d, i) => (
        <FormSection
          key={d.id}
          title={d.name || `Distância ${i + 1}`}
          description={d.slotsTaken > 0 ? `${d.slotsTaken} vagas já preenchidas` : undefined}
          action={
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => removeDist(i)} aria-label="Remover distância">
              <Trash2 /> <span className="hidden sm:inline">Remover</span>
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Nome" required error={err(`dist-${i}-name`)} className="sm:col-span-2">
              <Input value={d.name} onChange={(e) => setDist(i, { name: e.target.value })} placeholder="Ex.: 10 km Corrida" aria-invalid={!!err(`dist-${i}-name`)} />
            </Field>
            <Field label="Distância (km)" required error={err(`dist-${i}-km`)}>
              <Input type="number" step="0.001" min={0} value={d.distanceKm || ""} onChange={(e) => setDist(i, { distanceKm: num(e.target.value) })} aria-invalid={!!err(`dist-${i}-km`)} />
            </Field>
            <Field label="Hora de partida" required error={err(`dist-${i}-start`)}>
              <Input type="time" value={d.startTime} onChange={(e) => setDist(i, { startTime: e.target.value })} aria-invalid={!!err(`dist-${i}-start`)} />
            </Field>
            <Field label="Vagas" required error={err(`dist-${i}-slots`)}>
              <Input type="number" min={0} value={d.totalSlots || ""} onChange={(e) => setDist(i, { totalSlots: num(e.target.value) })} aria-invalid={!!err(`dist-${i}-slots`)} />
            </Field>
            <Field label="Idade mínima">
              <Input type="number" min={0} value={d.minAge} onChange={(e) => setDist(i, { minAge: num(e.target.value) })} />
            </Field>
            <Field label="Desnível positivo (m)">
              <Input type="number" min={0} value={d.elevationGain} onChange={(e) => setDist(i, { elevationGain: num(e.target.value) })} />
            </Field>
            <Field label="Tempo limite">
              <Input value={d.timeLimit ?? ""} onChange={(e) => setDist(i, { timeLimit: e.target.value })} placeholder="Ex.: 2h00" />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-800">Preços por fase</p>
            {err(`dist-${i}-tiers`) && <p className="mb-2 text-sm text-red-600">{err(`dist-${i}-tiers`)}</p>}
            <div className="space-y-3">
              {d.tiers.map((t, j) => {
                const setTier = (patch: Partial<typeof t>) => setDist(i, { tiers: d.tiers.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                const e1 = err(`dist-${i}-tier-${j}-label`);
                const e2 = err(`dist-${i}-tier-${j}-until`);
                const e3 = err(`dist-${i}-tier-${j}-price`);
                return (
                  <div key={j} className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                    <div className="col-span-2 sm:col-span-1">
                      <Input value={t.label} onChange={(e) => setTier({ label: e.target.value })} placeholder="Fase (ex.: 1.ª fase)" aria-label="Fase" aria-invalid={!!e1} className="h-11" />
                      {e1 && <p className="mt-1 text-xs text-red-600">{e1}</p>}
                    </div>
                    <div>
                      <Input type="date" value={t.until} onChange={(e) => setTier({ until: e.target.value })} aria-label="Válido até" aria-invalid={!!e2} className="h-11" />
                      {e2 ? <p className="mt-1 text-xs text-red-600">{e2}</p> : <p className="mt-1 text-xs text-ink-500">Válido até</p>}
                    </div>
                    <div>
                      <div className="relative">
                        <Input type="number" min={0} step={500} value={t.price || ""} onChange={(e) => setTier({ price: num(e.target.value) })} aria-label="Preço em Kz" aria-invalid={!!e3} className="h-11 pr-10" />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-400">Kz</span>
                      </div>
                      {e3 && <p className="mt-1 text-xs text-red-600">{e3}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="col-span-2 w-full sm:col-span-1 sm:w-10" onClick={() => setDist(i, { tiers: d.tiers.filter((_, k) => k !== j) })} aria-label="Remover fase">
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button variant="soft" size="sm" className="mt-3" onClick={() => setDist(i, { tiers: [...d.tiers, { label: `${d.tiers.length + 1}.ª fase`, until: "", price: 0 }] })}>
              <Plus /> Adicionar fase de preço
            </Button>
          </div>
        </FormSection>
      ))}
      <Button variant="outline" className="w-full border-dashed" onClick={() => set({ distances: [...ev.distances, emptyDistance()] })}>
        <Plus /> Adicionar distância
      </Button>
    </>
  );
}

function KitStep({ ev, set, err }: StepProps) {
  const kit = ev.kit;
  const setKit = (patch: Partial<AdminEvent["kit"]>) => set({ kit: { ...kit, ...patch } });
  return (
    <>
      <FormSection
        title="Levantamento do kit"
        description="Dias e horários em que os atletas podem levantar o kit."
        action={
          <Button variant="soft" size="sm" onClick={() => setKit({ pickup: [...kit.pickup, { date: "", from: "10:00", to: "18:00" }] })}>
            <Plus /> Dia
          </Button>
        }
      >
        {kit.pickup.length === 0 && <p className="text-sm text-ink-500">Ainda não há datas de levantamento.</p>}
        {kit.pickup.map((p, i) => {
          const setP = (patch: Partial<typeof p>) => setKit({ pickup: kit.pickup.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-start">
              <div className="col-span-2 sm:col-span-1">
                <Input type="date" value={p.date} onChange={(e) => setP({ date: e.target.value })} aria-label="Data" aria-invalid={!!err(`kit-${i}-date`)} className="h-11" />
                {err(`kit-${i}-date`) && <p className="mt-1 text-xs text-red-600">{err(`kit-${i}-date`)}</p>}
              </div>
              <Input type="time" value={p.from} onChange={(e) => setP({ from: e.target.value })} aria-label="Das" className="h-11" />
              <Input type="time" value={p.to} onChange={(e) => setP({ to: e.target.value })} aria-label="Até" className="h-11" />
              <Button variant="ghost" size="icon" className="col-span-2 w-full sm:col-span-1 sm:w-10" onClick={() => setKit({ pickup: kit.pickup.filter((_, k) => k !== i) })} aria-label="Remover dia">
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Local de levantamento">
            <Input value={kit.location} onChange={(e) => setKit({ location: e.target.value })} placeholder="Ex.: Pavilhão Multiusos do Kilamba" />
          </Field>
          <Field label="Morada">
            <Input value={kit.address} onChange={(e) => setKit({ address: e.target.value })} />
          </Field>
        </div>
      </FormSection>
      <FormSection title="O que inclui o kit">
        <ListEditor items={kit.items} onChange={(items) => setKit({ items })} placeholder="Ex.: T-shirt técnica oficial" addLabel="Adicionar item" />
      </FormSection>
      <FormSection title="Notas para o atleta">
        <ListEditor items={kit.notes} onChange={(notes) => setKit({ notes })} placeholder="Ex.: Apresente o BI no levantamento" addLabel="Adicionar nota" multiline />
      </FormSection>
    </>
  );
}

function ScheduleStep({ ev, set, err }: StepProps) {
  const rows = ev.schedule;
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => set({ schedule: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  return (
    <FormSection
      title="Programa do dia"
      description="Horário das actividades no dia do evento."
      action={
        <Button variant="outline" size="sm" onClick={() => set({ schedule: [...rows].sort((a, b) => a.time.localeCompare(b.time)) })} disabled={rows.length < 2}>
          Ordenar por hora
        </Button>
      }
    >
      {rows.length === 0 && <p className="text-sm text-ink-500">Ainda não há actividades no programa.</p>}
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-start gap-2">
            <Input type="time" value={r.time} onChange={(e) => setRow(i, { time: e.target.value })} aria-label="Hora" className="h-11 w-32 shrink-0" />
            <Input value={r.activity} onChange={(e) => setRow(i, { activity: e.target.value })} placeholder="Actividade" aria-label="Actividade" className="h-11" aria-invalid={!!err(`schedule-${i}`)} />
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => set({ schedule: rows.filter((_, k) => k !== i) })} aria-label="Remover actividade">
              <Trash2 />
            </Button>
          </div>
          {err(`schedule-${i}`) && <p className="mt-1 text-xs text-red-600">{err(`schedule-${i}`)}</p>}
        </div>
      ))}
      <Button variant="soft" size="sm" onClick={() => set({ schedule: [...rows, { time: "", activity: "" }] })}>
        <Plus /> Adicionar actividade
      </Button>
    </FormSection>
  );
}

function RegulationStep({ ev, set, err }: StepProps) {
  const secs = ev.regulation;
  const setSec = (i: number, patch: Partial<(typeof secs)[number]>) => set({ regulation: secs.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= secs.length) return;
    const next = [...secs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ regulation: next });
  };
  return (
    <>
      <FormSection title="Regulamento em PDF" description="Opcional. Os atletas podem descarregar o regulamento completo.">
        <FileUpload accept="application/pdf" value={ev.regulationPdf} onChange={(regulationPdf) => set({ regulationPdf })} label="Carregar PDF" />
      </FormSection>
      {secs.map((s, i) => (
        <FormSection
          key={i}
          title={s.title || `Secção ${i + 1}`}
          action={
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" className="size-9" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir secção">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon" className="size-9" onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label="Descer secção">
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon" className="size-9 text-red-600 hover:bg-red-50" onClick={() => set({ regulation: secs.filter((_, k) => k !== i) })} aria-label="Remover secção">
                <Trash2 />
              </Button>
            </div>
          }
        >
          <Field label="Título da secção" required error={err(`reg-${i}`)}>
            <Input value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} placeholder="Ex.: 1. Organização" aria-invalid={!!err(`reg-${i}`)} />
          </Field>
          <Field label="Regras">
            <ListEditor items={s.items} onChange={(items) => setSec(i, { items })} placeholder="Escreva uma regra" addLabel="Adicionar regra" multiline />
          </Field>
        </FormSection>
      ))}
      <Button variant="outline" className="w-full border-dashed" onClick={() => set({ regulation: [...secs, { title: `${secs.length + 1}. `, items: [] }] })}>
        <Plus /> Adicionar secção
      </Button>
    </>
  );
}

function RouteStep({ ev, set }: Omit<StepProps, "err">) {
  if (ev.distances.length === 0) return <EmptyState icon={<MapIcon />} title="Sem distâncias" description="Adicione distâncias no passo “Distâncias & preços” para descrever os percursos." />;
  const files = ev.routeFiles ?? {};
  return (
    <>
      {ev.distances.map((d, i) => {
        const r = ev.routes.find((x) => x.distanceId === d.id);
        const setRoute = (patch: { description?: string; surface?: string }) => {
          if (r) set({ routes: ev.routes.map((x) => (x.distanceId === d.id ? { ...x, ...patch } : x)) });
          else {
            const created = makeRoute(d.id, d.distanceKm || 1, { seed: 100 + i, base: 20, amplitude: Math.max(5, d.elevationGain / 4), surface: "", description: "" });
            set({ routes: [...ev.routes, { ...created, ...patch }] });
          }
        };
        const f = files[d.id] ?? {};
        const setFile = (patch: { gpx?: string; image?: string }) => set({ routeFiles: { ...files, [d.id]: { ...f, ...patch } } });
        return (
          <FormSection key={d.id} title={d.name || `Distância ${i + 1}`} description={d.distanceKm ? `${d.distanceKm} km · ${d.elevationGain} m D+` : undefined}>
            <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
              <div className="space-y-5">
                <Field label="Descrição do percurso">
                  <Textarea rows={3} value={r?.description ?? ""} onChange={(e) => setRoute({ description: e.target.value })} placeholder="Ex.: Ida e volta pela Marginal até à Ilha de Luanda." />
                </Field>
                <Field label="Piso">
                  <Input value={r?.surface ?? ""} onChange={(e) => setRoute({ surface: e.target.value })} placeholder="Ex.: Asfalto 100%" />
                </Field>
                <Field label="Ficheiro GPX" hint="Opcional. Upload simulado.">
                  <FileUpload
                    accept=".gpx,application/gpx+xml"
                    value={f.gpx ? { name: f.gpx.split("/").pop() ?? f.gpx, url: f.gpx } : null}
                    onChange={(v) => setFile({ gpx: v?.url })}
                    label="Carregar GPX"
                  />
                </Field>
              </div>
              <Field label="Imagem do mapa" hint="Opcional.">
                <ImageUpload value={f.image ?? ""} onChange={(image) => setFile({ image })} aspect="aspect-square" label="Carregar mapa" />
              </Field>
            </div>
          </FormSection>
        );
      })}
    </>
  );
}

function SponsorsStep({ ev, set }: Omit<StepProps, "err">) {
  const { data } = useAdmin();
  const toggle = (id: string) => set({ sponsorIds: ev.sponsorIds.includes(id) ? ev.sponsorIds.filter((x) => x !== id) : [...ev.sponsorIds, id] });
  const TIER = { principal: "Principal", oficial: "Oficial", apoio: "Apoio" } as const;
  return (
    <FormSection title="Patrocinadores do evento" description={`${ev.sponsorIds.length} seleccionados. Gerir a lista em Patrocinadores.`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {data.sponsors.map((s) => {
          const on = ev.sponsorIds.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-2xl border-2 bg-white p-4 text-center transition-colors",
                on ? "border-brand-500 bg-brand-50/40" : "border-ink-200 hover:border-ink-300",
                !s.active && "opacity-60",
              )}
            >
              {on && (
                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Check className="size-3.5" />
                </span>
              )}
              <span className="flex h-12 w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.logo ? <img src={s.logo} alt="" className="max-h-12 max-w-full object-contain" /> : <Handshake className="size-6 text-ink-300" />}
              </span>
              <span className="text-sm font-semibold text-ink-900">{s.name}</span>
              <span className="text-xs text-ink-500">
                {TIER[s.tier]}
                {!s.active && " · inactivo"}
              </span>
            </button>
          );
        })}
      </div>
    </FormSection>
  );
}

/** Lista editável de textos (itens do kit, notas, regras…). */
function ListEditor({ items, onChange, placeholder, addLabel, multiline }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string; multiline?: boolean }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          {multiline ? (
            <Textarea rows={2} className="min-h-12 py-2.5" value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} placeholder={placeholder} aria-label={placeholder} />
          ) : (
            <Input className="h-11" value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} placeholder={placeholder} aria-label={placeholder} />
          )}
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remover">
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button variant="soft" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}
