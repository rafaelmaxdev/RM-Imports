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
    return <div className="text-center py-16 text-text-muted text-lg">Verificando...</div>;
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
