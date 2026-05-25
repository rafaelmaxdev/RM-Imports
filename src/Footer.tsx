import { WHATSAPP_SUPPORT } from "./types";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-primary text-white mt-auto relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Sobre */}
          <div>
            <h3 className="text-lg font-bold mb-3">RM Imports</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              Camisas de futebol com qualidade premium. Entrega em até 30 dias.
            </p>
          </div>

          {/* Atendimento */}
          <div>
            <h3 className="text-lg font-bold mb-3">Atendimento</h3>
            <ul className="space-y-2 text-sm text-white/70 list-none m-0 p-0">
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent("Olá! Preciso de ajuda.")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/70 hover:text-white no-underline transition-colors"
                >
                  💬 WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Informações */}
          <div>
            <h3 className="text-lg font-bold mb-3">Informações</h3>
            <ul className="space-y-2 text-sm text-white/70 list-none m-0 p-0">
              <li>💳 Pix, Cartão de Crédito e Débito</li>
            </ul>
          </div>

          {/* Pagamento */}
          <div>
            <h3 className="text-lg font-bold mb-3">Formas de Pagamento</h3>
            <div className="flex flex-wrap gap-2 text-sm text-white/70">
              <span className="bg-white/10 px-2 py-1 rounded">Pix</span>
              <span className="bg-white/10 px-2 py-1 rounded">Visa</span>
              <span className="bg-white/10 px-2 py-1 rounded">Mastercard</span>
              <span className="bg-white/10 px-2 py-1 rounded">Elo</span>
              <span className="bg-white/10 px-2 py-1 rounded">Débito</span>
            </div>
            <p className="text-xs text-white/50 mt-3">
              Pagamentos processados pelo Mercado Pago
            </p>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-6 text-center text-sm text-white/50">
          <p>© {currentYear} RM Imports. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
