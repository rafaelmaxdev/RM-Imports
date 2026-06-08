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
    title: "Versão Torcedor",
    headers: ["Tam.", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "69-71", largura: "53-55", altura: "162-170" },
      { tam: "M", comprimento: "71-73", largura: "55-57", altura: "170-176" },
      { tam: "G", comprimento: "73-75", largura: "57-58", altura: "176-182" },
      { tam: "GG", comprimento: "75-78", largura: "58-60", altura: "182-190" },
      { tam: "G1", comprimento: "78-81", largura: "60-62", altura: "190-195" },
      { tam: "G2", comprimento: "81-83", largura: "62-64", altura: "192-197" },
      { tam: "G3", comprimento: "84-85", largura: "64-66", altura: "194-199" },
    ],
  },
  {
    title: "Versão Torcedor (Feminina)",
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
      { tam: "G1", comprimento: "76-78", largura: "57-60", altura: "185-190" },
      { tam: "G2", comprimento: "78-79", largura: "60-63", altura: "190-195" },
      { tam: "G3", comprimento: "80", largura: "63-66", altura: "195-200" },
    ],
  },
  {
    title: "Versão Jogador (Feminina)",
    headers: ["Tamanho", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "59-61", largura: "36-37", altura: "150-158" },
      { tam: "M", comprimento: "61-64", largura: "37-40", altura: "158-163" },
      { tam: "G", comprimento: "64-67", largura: "40-44", altura: "163-168" },
      { tam: "GG", comprimento: "67-69", largura: "44-47", altura: "167-172" },
    ],
  },
  {
    title: "Manga Longa / Retrô / Treinamento / Goleiro",
    headers: ["Tam.", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "69-71", largura: "53-55", altura: "162-170" },
      { tam: "M", comprimento: "71-73", largura: "55-57", altura: "170-176" },
      { tam: "G", comprimento: "73-75", largura: "57-58", altura: "176-182" },
      { tam: "GG", comprimento: "75-78", largura: "58-60", altura: "182-190" },
      { tam: "G1", comprimento: "78-81", largura: "60-62", altura: "190-195" },
    ],
  },
  {
    title: "Polo",
    headers: ["Tam.", "Comprimento", "Largura", "Altura"],
    rows: [
      { tam: "P", comprimento: "69-71", largura: "53-55", altura: "162-170" },
      { tam: "M", comprimento: "71-73", largura: "55-57", altura: "170-176" },
      { tam: "G", comprimento: "73-75", largura: "57-58", altura: "176-182" },
      { tam: "GG", comprimento: "75-78", largura: "58-60", altura: "182-190" },
    ],
  },
  {
    title: "NBA (Basquete)",
    headers: ["Tamanho BR", "Numeração", "Peito (cm)", "Comprimento (cm)"],
    rows: [
      { tam: "P", numeracao: "44", peito: "108", comprimento: "76" },
      { tam: "M", numeracao: "48", peito: "116", comprimento: "80" },
      { tam: "G", numeracao: "50", peito: "122", comprimento: "82" },
      { tam: "GG", numeracao: "52", peito: "126", comprimento: "84" },
      { tam: "G1", numeracao: "54", peito: "130", comprimento: "86" },
      { tam: "G2", numeracao: "56", peito: "134", comprimento: "88" },
    ],
  },
];

export const headerKeyMap: Record<string, string> = {
  "Tam.": "tam",
  "Tamanho": "tam",
  "Tamanho BR": "tam",
  "Comprimento": "comprimento",
  "Comprimento (cm)": "comprimento",
  "Largura": "largura",
  "Altura": "altura",
  "Manga": "manga",
  "Numeração": "numeracao",
  "Peito (cm)": "peito",
};