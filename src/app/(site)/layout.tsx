import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Saltar para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo" className="min-h-[60vh]">{children}</main>
      <SiteFooter />
      <WhatsAppButton />
      <MobileTabBar />
    </>
  );
}
