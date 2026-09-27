import { Link } from "react-router-dom";
import { WHATSAPP_SUPPORT } from "./types";
import rmImportsLogo from "./assets/rm-imports-logo-transparent.png";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const whatsappUrl = `https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent("Olá! Preciso de ajuda.")}`;

  return (
    <footer className="mt-auto bg-primary text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid gap-6 border-b border-white/10 pb-8 sm:grid-cols-3 sm:gap-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5h6" />
                <path d="M8 3h8a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1Z" />
                <rect x="5" y="5" width="14" height="16" rx="2" />
                <path d="m9 13 2 2 4-4" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Conferência antes da entrega</h2>
              <p className="mt-1 text-sm leading-6 text-white/65">Modelo, tamanho e personalização verificados.</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path d="M12 14v2" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Pagamento protegido</h2>
              <p className="mt-1 text-sm leading-6 text-white/65">Processamento seguro pelo Mercado Pago.</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Atendimento local</h2>
              <p className="mt-1 text-sm leading-6 text-white/65">Entrega grátis em Bezerros e retirada em Caruaru.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-10 pt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <section className="flex flex-col items-center text-center">
            <img src={rmImportsLogo} alt="RM Imports" width={120} height={80} className="h-20 w-[120px] object-contain" />
            <p className="mt-4 max-w-[260px] text-center text-sm leading-6 text-white/65">
              Produção em até 7 dias úteis. Após a produção, entrega em até 30 dias úteis.
            </p>
          </section>

          <section className="flex flex-col items-center text-center" aria-labelledby="footer-policies-title">
            <h2 id="footer-policies-title" className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">Políticas</h2>
            <ul className="list-none space-y-3 p-0 text-center text-sm text-white/70">
              <li><Link to="/politica-de-entrega" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Entrega e retirada</Link></li>
              <li><Link to="/politica-de-reembolso" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Cancelamento e reembolso</Link></li>
              <li><Link to="/politica-de-troca-e-devolucao" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Troca e devolução</Link></li>
              <li><Link to="/politica-de-privacidade" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Privacidade</Link></li>
            </ul>
          </section>

          <section className="flex flex-col items-center text-center" aria-labelledby="footer-support-title">
            <h2 id="footer-support-title" className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">Atendimento</h2>
            <ul className="list-none space-y-3 p-0 text-center text-sm text-white/70">
              <li><a href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">WhatsApp</a></li>
              <li><Link to="/meu-pedido" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Meu pedido</Link></li>
              <li><Link to="/tamanhos" className="rounded-sm no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Tamanhos</Link></li>
            </ul>
          </section>

          <section className="flex flex-col items-center text-center" aria-labelledby="footer-payment-title">
            <h2 id="footer-payment-title" className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">Redes e pagamento</h2>
            <div className="flex flex-col items-center gap-4">
              <a
                href="https://www.instagram.com/rmimports.10/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-sm text-sm text-white/75 no-underline transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                aria-label="Instagram da RM Imports"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
                <span>@rmimports.10</span>
              </a>
              <div className="flex flex-wrap justify-center gap-2" aria-label="Formas de pagamento">
                <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white/80">Pix</span>
                <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white/80">Crédito</span>
                <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white/80">Débito</span>
              </div>
              <p className="max-w-[240px] text-center text-xs leading-5 text-white/50">Pagamentos processados pelo Mercado Pago.</p>
            </div>
          </section>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs leading-5 text-white/50">
          <p>© {currentYear} RM Imports. Todos os direitos reservados.</p>
          <p>RM Imports — Bezerros e Caruaru, PE.</p>
        </div>
      </div>
    </footer>
  );
}
