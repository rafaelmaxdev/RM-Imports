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

export const tables: SizeTable[] = [
  {
    title: "Versão Torcedor/Manga Longa/Goleiro/Treinamento",
    headers: ["Tam.", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "69-71", largura: "53-55", altura: "162-170" },
      { tam: "M", comprimento: "71-73", largura: "55-57", altura: "170-176" },
      { tam: "G", comprimento: "73-75", largura: "57-58", altura: "176-182" },
      { tam: "GG", comprimento: "75-78", largura: "58-60", altura: "182-190" },
      { tam: "2XL", comprimento: "78-81", largura: "60-62", altura: "190-195" },
      { tam: "3XL", comprimento: "81-83", largura: "62-64", altura: "192-197" },
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
    headers: ["Tam.", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "67-69", largura: "49-51", altura: "162-170" },
      { tam: "M", comprimento: "69-71", largura: "51-53", altura: "170-175" },
      { tam: "G", comprimento: "71-73", largura: "53-55", altura: "175-180" },
      { tam: "GG", comprimento: "73-76", largura: "55-57", altura: "180-185" },
      { tam: "2XL", comprimento: "76-78", largura: "57-60", altura: "185-190" },
      { tam: "3XL", comprimento: "78-79", largura: "60-63", altura: "190-195" },
    ],
  },
  {
    title: "Camisa Polo",
    headers: ["Tam.", "Largura", "Comprimento", "Manga", "Altura"],
    rows: [
      { tam: "P", largura: "48", comprimento: "70", manga: "34.5", altura: "160-170" },
      { tam: "M", largura: "50", comprimento: "72", manga: "36", altura: "165-175" },
      { tam: "G", largura: "52", comprimento: "74", manga: "37.5", altura: "175-180" },
      { tam: "GG", largura: "54", comprimento: "76", manga: "39", altura: "180-185" },
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

export const headerKeyMap: Record<string, string> = {
  "Tam.": "tam",
  "Tamanho": "tam",
  "Comprimento": "comprimento",
  "Largura": "largura",
  "Altura": "altura",
  "Manga": "manga",
};