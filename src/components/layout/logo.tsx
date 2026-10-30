import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Símbolo (o atleta a correr) — o mesmo ícone dos favicons. */
export function LogoMark({ className }: { className?: string }) {
  return (
    // Removido o 'size-9' (que forçava 36x36 quadrado) e adicionado suporte a largura proporcional
    <div className={cn("relative h-20 w-88", className)}>
      <Image
        src="/logotipo-conexaosport.png"
        alt="Conexão Sport Logo"
        fill
        sizes="(max-width: 768px) 150px, 200px"
        priority
        className="object-contain object-left"
      />
    </div>
  );
}


/** Símbolo + nome, como no logotipo original (public/logotipo-conexaosport.png): "Conexão" escuro, "Sport" laranja, em itálico. */
export function Logo({ invert, className }: { invert?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2", className)} aria-label="ConexãoSport — página inicial">
      <LogoMark />
      {/* <span className={cn("font-display text-[27px] leading-none font-extrabold tracking-tight italic", invert ? "text-white" : "text-ink-900")}>
        Conexão<span className="text-brand-600">Sport</span>
      </span> */}
    </Link>
  );
}
