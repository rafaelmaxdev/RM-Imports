import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  useEffect(() => {
    document.title = "Página não encontrada — RM Imports";
  }, []);

  return (
    <div className="text-center py-16 px-4 max-w-lg mx-auto">
      <h1 className="text-6xl font-bold text-primary mb-2">404</h1>
      <p className="text-text-muted mb-8">Página não encontrada</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/"
          className="px-6 py-3 bg-accent text-white rounded-md no-underline font-semibold transition-opacity hover:opacity-90"
        >
          🏠 Loja
        </Link>
        <Link
          to="/pronta-entrega"
          className="px-6 py-3 border border-border bg-card-bg text-text-main rounded-md no-underline font-semibold transition-colors hover:border-accent"
        >
          📦 Pronta Entrega
        </Link>
        <Link
          to="/meu-pedido"
          className="px-6 py-3 border border-border bg-card-bg text-text-main rounded-md no-underline font-semibold transition-colors hover:border-accent"
        >
          🔍 Meu Pedido
        </Link>
      </div>
    </div>
  );
}
