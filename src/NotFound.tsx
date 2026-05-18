import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="text-center py-16 px-4">
      <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
      <p className="text-text-muted mb-6">Página não encontrada</p>
      <Link
        to="/"
        className="inline-block px-6 py-3 bg-accent text-white rounded-md no-underline font-semibold transition-opacity hover:opacity-90"
      >
        Voltar à Loja
      </Link>
    </div>
  );
}
