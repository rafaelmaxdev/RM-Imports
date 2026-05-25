import { Link } from "react-router-dom";

interface SizeRow {
  tam: string;
  [key: string]: string;
}

interface SizeTable {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: SizeRow[];
}

const tables: SizeTable[] = [
  {
    title: "Versão Torcedor/Manga Longa/Goleiro/Treinamento",
    headers: ["Tam.", "Comprimento", "Largura", "Altura", "Peso"],
    rows: [
      { tam: "P", comprimento: "69-71", largura: "53-55", altura: "162-170", peso: "50-62" },
      { tam: "M", comprimento: "71-73", largura: "55-57", altura: "170-176", peso: "62-78" },
      { tam: "G", comprimento: "73-75", largura: "57-58", altura: "176-182", peso: "78-83" },
      { tam: "GG", comprimento: "75-78", largura: "58-60", altura: "182-190", peso: "83-90" },
      { tam: "2XL", comprimento: "78-81", largura: "60-62", altura: "190-195", peso: "90-97" },
      { tam: "3XL", comprimento: "81-83", largura: "62-64", altura: "192-197", peso: "97-104" },
    ],
  },
  {
    title: "Versão Feminina",
    headers: ["Tamanho", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "61-63", largura: "40-41", altura: "150-160" },
      { tam: "M", comprimento: "63-66", largura: "41-44", altura: "160-165" },
      { tam: "G", comprimento: "66-69", largura: "44-47", altura: "165-170" },
      { tam: "GG", comprimento: "69-71", largura: "47-50", altura: "170-175" },
    ],
  },
  {
    title: "Versão Jogador",
    headers: ["Tam.", "Comprimento", "Largura", "Altura", "Peso"],
    rows: [
      { tam: "P", comprimento: "67-69", largura: "49-51", altura: "162-170", peso: "50-62" },
      { tam: "M", comprimento: "69-71", largura: "51-53", altura: "170-175", peso: "62-75" },
      { tam: "G", comprimento: "71-73", largura: "53-55", altura: "175-180", peso: "75-80" },
      { tam: "GG", comprimento: "73-76", largura: "55-57", altura: "180-185", peso: "80-85" },
      { tam: "2XL", comprimento: "76-78", largura: "57-60", altura: "185-190", peso: "85-90" },
      { tam: "3XL", comprimento: "78-79", largura: "60-63", altura: "190-195", peso: "90-95" },
    ],
  },
  {
    title: "Camisa Polo",
    headers: ["Tam.", "Largura", "Comprimento", "Manga", "Altura", "Peso"],
    rows: [
      { tam: "P", largura: "48", comprimento: "70", manga: "34.5", altura: "160-170", peso: "60-65" },
      { tam: "M", largura: "50", comprimento: "72", manga: "36", altura: "165-175", peso: "65-70" },
      { tam: "G", largura: "52", comprimento: "74", manga: "37.5", altura: "175-180", peso: "70-75" },
      { tam: "GG", largura: "54", comprimento: "76", manga: "39", altura: "180-185", peso: "75-80" },
    ],
  },
  {
    title: "Camisa Retrô",
    headers: ["Tamanho", "Largura", "Comprimento", "Altura"],
    rows: [
      { tam: "P", largura: "48", comprimento: "67", altura: "160-165" },
      { tam: "M", largura: "50", comprimento: "70", altura: "165-170" },
      { tam: "G", largura: "52.5", comprimento: "73.5", altura: "170-175" },
      { tam: "GG", largura: "55", comprimento: "77", altura: "175-178" },
      { tam: "2XL", largura: "57", comprimento: "80", altura: "179-184" },
    ],
  },
];

const headerKeyMap: Record<string, string> = {
  "Tam.": "tam",
  "Tamanho": "tam",
  "Comprimento": "comprimento",
  "Largura": "largura",
  "Altura": "altura",
  "Peso": "peso",
  "Manga": "manga",
};

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