import { Link } from "react-router-dom";
import { tables, headerKeyMap } from "./sizeChartData";

export default function SizeChart() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/"
          className="text-text-muted hover:text-accent transition-colors text-sm no-underline flex items-center gap-1"
        >
          ← Loja
        </Link>
        <span className="text-text-muted/40">|</span>
        <h1 className="text-2xl font-bold text-primary">Guia de Tamanhos</h1>
      </div>

      <p className="text-text-muted text-sm mb-4 leading-relaxed">
        Confira abaixo as medidas de cada versão para encontrar o tamanho ideal. 
        As medidas estão em centímetros (cm) e o peso em quilogramas (kg).
      </p>

      <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800 font-semibold">💡 Dica</p>
        <p className="text-sm text-blue-700 mt-1">
          A versão Jogador costuma vestir mais justa. Recomendamos pegar{" "}
          <strong>1 ou 2 tamanhos acima</strong> do que você usaria na versão Torcedor.
        </p>
      </div>

      <div className="space-y-10">
        {tables.map((table) => (
          <section key={table.title}>
            <h2 className="text-lg font-bold text-primary mb-3 pb-2 border-b-2 border-accent/30">
              {table.title}
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
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
                              h === "Tam." || h === "Tamanho"
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
          className="inline-block px-6 py-3 bg-accent text-white font-semibold rounded-md hover:opacity-90 transition-opacity no-underline"
        >
          Voltar à Loja
        </Link>
      </div>
    </div>
  );
}