import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "login" | "ok">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "ok" : "login");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "ok" : "login");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErro("Email ou senha inválidos");
  }

  if (status === "checking") {
    return <div className="loading-page">Verificando...</div>;
  }

  if (status === "login") {
    return (
      <div className="gate-container">
        <div className="gate-box">
          <h2>Acesso Restrito</h2>
          <p>Faça login para gerenciar produtos.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(""); }}
              placeholder="Email"
              required
              autoFocus
            />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErro(""); }}
              placeholder="Senha"
              required
              style={{ marginTop: "0.5rem" }}
            />
            {erro && <span className="gate-erro">{erro}</span>}
            <button type="submit" className="btn btn-add" style={{ marginTop: "0.75rem", width: "100%" }}>
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
