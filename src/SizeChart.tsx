import { Link } from "react-router-dom";
import { tables, headerKeyMap } from "./sizeChartData";

export default function SizeChart() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="text-text-muted hover:text-accent transition-colors text-sm no-underline flex items-center gap-1"
        >
          ← Loja
        </Link>
        <span className="text-text-muted/40">|</span>
        <h1 className="text-3xl font-black tracking-tight text-primary sm:text-4xl">Guia de tamanhos</h1>
      </div>

      <p className="text-text-muted text-sm mb-4 leading-relaxed">
        Confira abaixo as medidas de cada versão para encontrar o tamanho ideal. 
        As medidas estão em centímetros (cm).
      </p>

      <div className="mb-8 rounded-2xl border border-primary/10 bg-primary/5 p-5">
        <p className="text-sm font-bold text-primary">Como escolher</p>
        <p className="mt-1 text-sm text-text-muted">
          A versão Jogador costuma vestir mais justa. Recomendamos pegar{" "}
          <strong>1 ou 2 tamanhos acima</strong> do que você usaria na versão Torcedor.
        </p>
      </div>

      <div className="space-y-10">
        {tables.map((table) => (
          <section key={table.title}>
            <h2 className="text-lg font-bold text-primary mb-1 pb-2 border-b-2 border-accent/30">
              {table.title}
            </h2>
            {table.subtitle && (
              <p className="text-xs text-text-muted mb-3 mt-1">{table.subtitle}</p>
            )}
            <div className="overflow-x-auto rounded-2xl border border-border bg-card-bg shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary text-white">
                    {table.headers.map((h) => (
                      <th key={h} className="px-4 py-2.5 text-center font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr
                      key={row.tam}
                      className={`border-b border-border transition-colors hover:bg-accent/5 ${
                        i % 2 === 0 ? "bg-card-bg" : "bg-bg-base"
                      }`}
                    >
                      {table.headers.map((h) => {
                        const key = headerKeyMap[h];
                        return (
                          <td
                            key={h}
                            className={`px-4 py-2.5 whitespace-nowrap text-center ${
                              h === "Tam." || h === "Tamanho" || h === "Tamanho BR"
                                ? "font-bold text-primary"
                                : "text-text-main"
                            }`}
                          >
                            {row[key] || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/"
          className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 font-bold text-white no-underline transition-colors hover:bg-[#d93648]"
        >
          Voltar à Loja
        </Link>
      </div>
    </div>
  );
}
