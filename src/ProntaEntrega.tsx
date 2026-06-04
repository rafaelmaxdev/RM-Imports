import { useState, useEffect, useMemo } from "react";
import { getEstoquePublico } from "./lib/db";
import { formatarMoeda, proxyImageUrl, PRECOS_BASE, WHATSAPP_NUMBER } from "./types";
import type { EstoqueItem } from "./types";
import { normalizarBusca } from "./lib/utils";

interface GroupedProduct {
  produto_id: string;
  nome: string;
  imagem: string;
  tipo: string;
  time: string;
  liga: string;
  temporada: string;
  sizes: { tamanho: string; quantidade: number }[];
}

function groupItems(items: EstoqueItem[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();

  for (const item of items) {
    if (item.quantidade <= 0) continue;

    const existing = map.get(item.produto_id);
    if (existing) {
      existing.sizes.push({ tamanho: item.tamanho, quantidade: item.quantidade });
    } else {
      map.set(item.produto_id, {
        produto_id: item.produto_id,
        nome: item.produto_nome ?? "Sem nome",
        imagem: item.produto_imagem ?? "",
        tipo: item.produto_tipo ?? "",
        time: item.produto_time ?? "",
        liga: item.produto_liga ?? "",
        temporada: item.produto_temporada ?? "",
        sizes: [{ tamanho: item.tamanho, quantidade: item.quantidade }],
      });
    }
  }

  // Sort sizes by the canonical TAMANHOS order
  const tamanhoOrder: Record<string, number> = {
    "P": 0, "M": 1, "G": 2, "GG": 3, "G1": 4, "G2": 5, "G3": 6,
  };

  for (const product of map.values()) {
    product.sizes.sort((a, b) => {
      const ai = tamanhoOrder[a.tamanho] ?? 99;
      const bi = tamanhoOrder[b.tamanho] ?? 99;
      return ai - bi;
    });
  }

  return Array.from(map.values());
}

export default function ProntaEntrega() {
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroBusca, setFiltroBusca] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getEstoquePublico();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao carregar estoque público:", err);
          setError("Erro ao carregar produtos. Tente novamente mais tarde.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => groupItems(items), [items]);

  const filtered = useMemo(() => {
    if (!filtroBusca.trim()) return grouped;

    const words = normalizarBusca(filtroBusca).split(" ").filter(Boolean);
    return grouped.filter((p) => {
      const campos = normalizarBusca([p.nome, p.time, p.liga, p.tipo, p.temporada].join(" "));
      return words.every((w) => campos.includes(w));
    });
  }, [grouped, filtroBusca]);

  const preco = (tipo: string): number => {
    return PRECOS_BASE[tipo] ?? 129.90;
  };

  const whatsappUrl = (produto: GroupedProduct, tamanho: string): string => {
    const valor = preco(produto.tipo);
    const message = encodeURIComponent(
      `Olá! Tenho interesse em:\n\n*${produto.nome}*\n• Tamanho: ${tamanho}\n• Preço: ${formatarMoeda(valor)}\n\n(Pronta Entrega)`
    );
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p>Carregando produtos...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
        <div className="text-center py-16 text-text-muted">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-lg font-semibold text-primary mb-2">Algo deu errado</p>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 text-sm font-semibold bg-primary text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (grouped.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-main mb-2">📦 Pronta Entrega</h1>
          <p className="text-sm sm:text-base text-text-muted">Camisas disponíveis para entrega imediata</p>
        </div>
        <div className="text-center py-16 text-text-muted">
          <p className="text-4xl mb-4">😔</p>
          <p className="text-lg font-semibold text-primary mb-2">
            Nenhuma camisa disponível para pronta entrega no momento.
          </p>
          <p className="mb-6">Volte em breve!</p>
          <a
            href="/"
            className="inline-block px-6 py-3 text-sm font-semibold bg-accent text-white rounded-md transition-opacity hover:opacity-90 no-underline"
          >
            ← Voltar à Loja
          </a>
        </div>
      </div>
    );
  }

  // ── Product grid with results ──
  return (
    <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-main mb-2">📦 Pronta Entrega</h1>
        <p className="text-sm sm:text-base text-text-muted">Camisas disponíveis para entrega imediata</p>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <label className="flex flex-col gap-0.5 max-w-md mx-auto">
          <span className="text-xs text-text-muted font-medium pl-1">Filtrar por nome, time ou liga</span>
          <input
            type="text"
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            placeholder="Buscar..."
            className="w-full px-3 py-2 border border-border rounded-md bg-card-bg text-sm"
          />
        </label>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-base font-semibold text-primary mb-1">Nenhum produto encontrado</p>
          <p className="text-sm">Tente ajustar a busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 items-stretch">
          {filtered.map((product) => {
            const valor = preco(product.tipo);

            return (
              <div
                key={product.produto_id}
                className="bg-card-bg rounded-lg overflow-hidden shadow-card border border-border hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/20 transition-all duration-300 ease-out flex flex-col h-full relative"
              >
                {/* Badge */}
                <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-accent text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10">
                  Pronta Entrega
                </span>

                {/* Image */}
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  {product.imagem ? (
                    <img
                      src={proxyImageUrl(product.imagem)}
                      alt={product.nome}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                      Sem imagem
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                  <h2 className="font-semibold text-xs sm:text-[0.95rem] mb-1 sm:mb-2 line-clamp-2 min-h-[2.5em] sm:min-h-[2.6em]">
                    {product.nome}
                  </h2>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                    {product.time && (
                      <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded">
                        {product.time}
                      </span>
                    )}
                    {product.liga && (
                      <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary/80 text-white rounded">
                        {product.liga}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 sm:gap-2 mb-1.5 sm:mb-2">
                    {product.tipo && (
                      <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                        {product.tipo}
                      </span>
                    )}
                    {product.temporada && (
                      <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                        {product.temporada}
                      </span>
                    )}
                  </div>

                  {/* Available sizes */}
                  <div className="mb-2 sm:mb-3">
                    <p className="text-[10px] sm:text-xs text-text-muted font-medium mb-1">Tamanhos disponíveis:</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {product.sizes.map((s) => (
                        <span key={s.tamanho} className="text-[10px] sm:text-xs">
                          <strong>{s.tamanho}</strong>: {s.quantidade}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mt-auto mb-2 sm:mb-3">
                    <span className="font-bold text-sm sm:text-lg text-accent">
                      {formatarMoeda(valor)}
                    </span>
                  </div>

                  {/* WhatsApp button per row per size */}
                  <div className="flex flex-col gap-1.5">
                    {product.sizes.map((s) => (
                      <a
                        key={s.tamanho}
                        href={whatsappUrl(product, s.tamanho)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold bg-green-500 text-white rounded-md transition-opacity hover:opacity-90 no-underline text-center flex items-center justify-center gap-1"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Pedir {s.tamanho}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
