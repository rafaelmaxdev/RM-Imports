import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "login" | "denied" | "ok">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");

  async function checkAdmin(sessionToken: string): Promise<boolean> {
    try {
      const res = await fetch("/api/check-admin", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      return data.isAdmin === true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const isAdmin = await checkAdmin(data.session.access_token);
        setStatus(isAdmin ? "ok" : "denied");
      } else {
        setStatus("login");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const isAdmin = await checkAdmin(session.access_token);
        setStatus(isAdmin ? "ok" : "denied");
      } else {
        setStatus("login");
      }
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
    return <div className="text-center py-16 text-text-muted text-lg">Verificando...</div>;
  }

  if (status === "denied") {
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <div className="bg-card-bg p-8 rounded-md shadow-card text-center max-w-sm w-full">
          <h2 className="text-xl text-primary mb-2">Acesso Negado</h2>
          <p className="text-sm text-text-muted mb-6">
            Sua conta não possui permissão de administrador.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (status === "login") {
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <div className="bg-card-bg p-8 rounded-md shadow-card text-center max-w-sm w-full">
          <h2 className="text-xl text-primary mb-2">Acesso Restrito</h2>
          <p className="text-sm text-text-muted mb-6">Faça login para gerenciar produtos.</p>
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErro("");
              }}
              placeholder="Email"
              required
              autoFocus
              className="w-full px-3 py-2.5 text-base border border-border rounded-md"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErro("");
              }}
              placeholder="Senha"
              required
              className="w-full px-3 py-2.5 text-base border border-border rounded-md mt-2"
            />
            {erro && <span className="block mt-2 text-accent text-sm">{erro}</span>}
            <button
              type="submit"
              className="mt-3 w-full py-3 text-base font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
