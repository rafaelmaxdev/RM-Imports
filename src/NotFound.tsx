import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  useEffect(() => {
    document.title = "Página não encontrada — RM Imports";
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Fora de campo</p>
      <h1 className="mb-3 mt-2 text-8xl font-black tracking-[-0.06em] text-primary">404</h1>
      <p className="mb-8 text-lg text-text-muted">Esta página não faz parte da escalação.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/"
          className="rounded-full bg-accent px-6 py-3 font-bold text-white no-underline transition-colors hover:bg-[#d93648]"
        >
          Voltar à loja
        </Link>
        <Link
          to="/pronta-entrega"
          className="rounded-full border border-border bg-card-bg px-6 py-3 font-bold text-text-main no-underline transition-colors hover:border-accent"
        >
          Pronta entrega
        </Link>
        <Link
          to="/meu-pedido"
          className="rounded-full border border-border bg-card-bg px-6 py-3 font-bold text-text-main no-underline transition-colors hover:border-accent"
        >
          Meu pedido
        </Link>
      </div>
    </div>
  );
}
