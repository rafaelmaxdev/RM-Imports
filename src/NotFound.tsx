import { Link } from "react-router-dom";
import "./index.css";

export default function NotFound() {
  return (
    <div className="not-found-page">
      <h1>404</h1>
      <p>Página não encontrada</p>
      <Link to="/" className="btn btn-primary">
        Voltar à Loja
      </Link>
    </div>
  );
}
