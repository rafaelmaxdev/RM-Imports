import { useState, useEffect, useMemo } from "react";
import { getEstoquePublico, getProdutosByIds, getLojaConfig, parseImageUrls } from "./lib/db";
import { supabase } from "./lib/supabase";
import type { DbProduto } from "./lib/db";
import type { EstoqueItem, LojaConfig, PromocaoTipo, CachedImageMap, CartItem } from "./types";
import { useCart } from "./CartContext";
import ImageCarousel from "./ImageCarousel";
import ImageLightbox from "./ImageLightbox";
import {
  formatarMoeda,
  getPrecoProduto,
  precoPersonalizacao,
  ADICIONAL_TAMANHO,
  TAMANHOS_POR_TIPO,
  TAMANHOS_FEMININA,
  TAMANHOS,
} from "./types";
import { normalizarBusca } from "./lib/utils";
import { TIPO_SHORT } from "./lib/status";
import useBodyScrollLock from "./hooks/useBodyScrollLock";

const PRONTA_ENTREGA_MARKUP = 1.15;

// ── Grouped product ──

interface GroupedProduct {
  produto_id: string;
  nome: string;
  tipo: string;
  time: string;
  liga: string;
  temporada: string;
  feminino: boolean;
  stockTipo: "masculino" | "feminino" | "ambos";
  imagemUrls: string[];
  imagemUrlsFeminina: string[];
  yupooUrl: string;
  cachedImageUrls: CachedImageMap | null;
  precoCustomizado: number | null;
  promocaoTipo: PromocaoTipo | undefined;
  promocaoValor: number | null;
  sizes: { tamanho: string; quantidade: number; personalizado: boolean; nome_personalizado?: string | null; numero_personalizado?: string | null; feminino: boolean }[];
}

const TAMANHO_ORDER: Record<string, number> = {
  P: 0, M: 1, G: 2, GG: 3, G1: 4, G2: 5, G3: 6,
};

function groupEstoqueItems(estoque: EstoqueItem[], produtos: DbProduto[]): GroupedProduct[] {
  const productMap = new Map<string, DbProduto>();
  for (const p of produtos) {
    productMap.set(p.id, p);
  }

  // Collect sizes per produto_id
  const sizeMap = new Map<string, GroupedProduct["sizes"]>();
  for (const item of estoque) {
    if (item.quantidade <= 0) continue;
    let sizes = sizeMap.get(item.produto_id);
    if (!sizes) {
      sizes = [];
      sizeMap.set(item.produto_id, sizes);
    }
    sizes.push({ tamanho: item.tamanho, quantidade: item.quantidade, personalizado: item.personalizado ?? false, nome_personalizado: item.nome_personalizado, numero_personalizado: item.numero_personalizado, feminino: item.feminino });
  }

  // Sort sizes within each product
  for (const sizes of sizeMap.values()) {
    sizes.sort((a, b) => (TAMANHO_ORDER[a.tamanho] ?? 99) - (TAMANHO_ORDER[b.tamanho] ?? 99));
  }

  // Build result — one entry per produto_id
  const seen = new Set<string>();
  const result: GroupedProduct[] = [];

  for (const item of estoque) {
    if (seen.has(item.produto_id)) continue;
    seen.add(item.produto_id);

    const sizes = sizeMap.get(item.produto_id);
    if (!sizes || sizes.length === 0) continue;

    const p = productMap.get(item.produto_id);

    const feminineFromEstoque = item.produto_imagens_femininas ?? [];
    const feminineFromProd = p ? parseImageUrls(p.imagem_urls_feminina) : [];
    const feminineUrls = feminineFromProd.length > 0 ? feminineFromProd : feminineFromEstoque;
    const masculineUrls = p ? parseImageUrls(p.imagem_urls) : (item.produto_imagem ? [item.produto_imagem] : []);
    const temMasculino = sizes.some((s) => !s.feminino);
    const temFeminino = sizes.some((s) => s.feminino);
    const stockTipo = temMasculino && temFeminino ? "ambos" : temFeminino ? "feminino" : "masculino";
    const displayUrls = stockTipo === "feminino" && feminineUrls.length > 0 ? feminineUrls
      : stockTipo === "ambos" ? [...masculineUrls, ...feminineUrls]
      : masculineUrls;
    console.log("[PE debug]", { nome: item.produto_nome, produto_id: item.produto_id, sizes: sizes.map(s => ({ t: s.tamanho, f: s.feminino })), temMasculino, temFeminino, stockTipo, feminineUrls, masculineUrls, displayUrls });
    result.push({
      produto_id: item.produto_id,
      nome: p?.nome ?? item.produto_nome ?? "Sem nome",
      tipo: p?.tipo ?? item.produto_tipo ?? "",
      time: p?.time ?? item.produto_time ?? "",
      liga: p?.liga ?? item.produto_liga ?? "",
      temporada: p?.temporada ?? item.produto_temporada ?? "",
      feminino: p?.feminino ?? false,
      stockTipo,
      imagemUrls: displayUrls,
      imagemUrlsFeminina: feminineUrls,
      yupooUrl: p?.yupoo_url ?? "",
      cachedImageUrls: p?.cached_image_urls ?? null,
      precoCustomizado: p?.preco_customizado ?? null,
      promocaoTipo: p?.promocao_tipo as PromocaoTipo | undefined,
      promocaoValor: p?.promocao_valor ?? null,
      sizes,
    });
  }

  return result;
}

// ── Product detail modal ──

interface DetailModalProps {
  product: GroupedProduct;
  config: LojaConfig;
  onClose: () => void;
  onAdded: (nome: string) => void;
}

function ProntaEntregaDetailModal({ product, config, onClose, onAdded }: DetailModalProps) {
  const { addToCart } = useCart();


  const temMasculino = product.sizes.some((s) => !s.feminino);
  const [genero, setGenero] = useState<"Masculino" | "Feminino">(temMasculino ? "Masculino" : "Feminino");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: string[];
    alt: string;
    index: number;
    cachedImageUrls: CachedImageMap | null;
  } | null>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const [feminineImages, setFeminineImages] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("produtos").select("imagem_urls_feminina").eq("id", product.produto_id).single().then(({ data }: any) => {
      if (data?.imagem_urls_feminina) {
        const fem = Array.isArray(data.imagem_urls_feminina) ? data.imagem_urls_feminina.filter(Boolean) : [];
        setFeminineImages(fem);
      }
    });
  }, [product.produto_id]);
  const isFeminineMode = genero === "Feminino" && feminineImages.length > 0;

  const allImages =
    isFeminineMode
      ? feminineImages
      : product.imagemUrls;

  const availableSizes = product.sizes.filter((s) => {
    const isFeminino = genero === "Feminino";
    const genderMatch = s.feminino === isFeminino;
    const sizeMatch = isFeminino ? TAMANHOS_FEMININA.includes(s.tamanho) : (TAMANHOS_POR_TIPO[product.tipo] ?? TAMANHOS).includes(s.tamanho);
    return genderMatch && sizeMatch;
  });

  // Pricing
  const priceInfo = getPrecoProduto(
    product.tipo,
    config,
    product.precoCustomizado,
    product.promocaoTipo,
    product.promocaoValor,
    product.time,
  );
  const { base, promo, emPromocao, badge, discountLabel } = priceInfo;
  const selectedSizeInfo = selectedIdx !== null ? availableSizes[selectedIdx] ?? null : null;
  const selectedTam = selectedSizeInfo?.tamanho ?? "";
  const adicionalTam = ADICIONAL_TAMANHO[selectedTam] || 0;
  const adicionalPers = selectedSizeInfo?.personalizado ? precoPersonalizacao(product.tipo) : 0;
  const precoBaseMarcado = Math.round((base + adicionalTam + adicionalPers) * PRONTA_ENTREGA_MARKUP * 100) / 100;
  const precoPromoMarcado = promo !== null ? Math.round((promo + adicionalTam + adicionalPers) * PRONTA_ENTREGA_MARKUP * 100) / 100 : null;
  const prontaEntregaPrice = precoPromoMarcado ?? precoBaseMarcado;
  const prontaEntregaBasePrice = precoBaseMarcado;

  function handleConfirm() {
    if (selectedIdx === null || !selectedSizeInfo) {
      setErro("Selecione um tamanho.");
      return;
    }

    const item: CartItem = {
      productId: product.produto_id,
      nome: product.nome,
      imagemUrl: allImages[0] || product.imagemUrls[0] || "",
      yupooUrl: product.yupooUrl,
      tipo: product.tipo,
      temporada: product.temporada,
      tamanho: selectedSizeInfo.tamanho,
      genero,
      feminino: genero === "Feminino",
      personalizado: selectedSizeInfo.personalizado ?? false,
      nomePersonalizado: selectedSizeInfo.personalizado ? (selectedSizeInfo.nome_personalizado ?? undefined) : undefined,
      numeroPersonalizado: selectedSizeInfo.personalizado ? (selectedSizeInfo.numero_personalizado ?? undefined) : undefined,
      preco: prontaEntregaPrice,
      precoBase: priceInfo.base + adicionalTam + adicionalPers,
      prontaEntrega: true,
    };

    addToCart(item);
    onAdded(product.nome);
    onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="bg-card-bg rounded-md p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Adicionar ${product.nome} ao carrinho`}
        >
          {/* Close button */}
          <button
            className="absolute top-3 right-3 text-text-muted hover:text-primary cursor-pointer bg-transparent border-none text-xl leading-none p-1 z-10"
            onClick={onClose}
            aria-label="Fechar"
          >
            ✕
          </button>

          <h3 className="mb-4 text-primary font-semibold text-lg">Adicionar ao Carrinho</h3>

          {/* Image carousel */}
          {allImages.length > 0 && (
            <div className="mb-4 -mx-6 -mt-2">
              <ImageCarousel
                images={allImages}
                alt={product.nome}
                cachedImageUrls={product.stockTipo === "masculino" ? product.cachedImageUrls : null}
                onImageClick={(i) =>
                  setLightbox({
                    images: allImages,
                    alt: product.nome,
                    index: i,
                    cachedImageUrls: product.stockTipo === "masculino" ? product.cachedImageUrls : null,
                  })
                }
              />
            </div>
          )}

          {/* Product name & pricing header */}
          <div className="mb-4 pb-4 border-b border-border">
            <div className="font-semibold">{product.nome}</div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-accent font-bold text-lg">{formatarMoeda(prontaEntregaPrice)}</span>
              {promo !== null && (
                <span className="text-text-muted text-sm line-through">{formatarMoeda(prontaEntregaBasePrice)}</span>
              )}
              <span className="text-xs text-text-muted font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded-sm">Pronta Entrega</span>
            </div>
            {emPromocao && badge && (
              <span className="inline-block mt-1 text-[10px] font-extrabold px-1.5 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">
                {discountLabel || badge}
              </span>
            )}
          </div>

          {/* Gender selection (only for products with feminino flag) */}
          {product.feminino && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text-muted mb-2">Modelo</label>
              <div className="flex gap-2">
                {(["Masculino", "Feminino"] as const).map((g) => {
                  const count = product.sizes.filter((s) => g === "Feminino" ? s.feminino : !s.feminino).length;
                  return (
                    <button
                      key={g}
                      className={`px-4 py-2 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors ${
                        genero === g ? "bg-primary text-white border-primary" : ""
                      } ${count === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (count === 0) return;
                        setGenero(g);
                        setSelectedIdx(null);
                        setErro("");
                      }}
                    >
                      {g} {count > 0 ? `(${count})` : "(indisponível)"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size selection — only sizes in stock */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-text-muted mb-2">Tamanho</label>
            {availableSizes.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nenhum tamanho disponível para {genero.toLowerCase()} no momento.
              </p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {availableSizes.map((s, idx) => (
                  <button
                    key={`${s.tamanho}-${idx}`}
                    className={`px-3 py-1.5 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors flex flex-col items-center gap-0.5 ${
                      selectedIdx === idx ? "bg-primary text-white border-primary" : ""
                    }`}
                    onClick={() => {
                      setSelectedIdx(idx);
                      setErro("");
                    }}
                  >
                    <span>{s.tamanho}</span>
                    <span className="text-[10px] opacity-70">({s.quantidade} {s.quantidade === 1 ? 'un' : 'uns'}{s.quantidade === 1 ? <span className="text-orange-500 font-semibold ml-0.5">última!</span> : ''})</span>
                    {s.personalizado && (
                      <span className="text-[10px] text-accent font-semibold">★ {s.nome_personalizado || ''}{s.nome_personalizado && s.numero_personalizado ? ' #' : ''}{s.numero_personalizado || ''}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Personalization info for selected size */}
          {selectedSizeInfo?.personalizado && (
            <div className="mb-4 p-2.5 bg-accent/10 border border-accent/20 rounded-md">
              <div className="text-xs font-semibold text-accent mb-1">✦ Item Personalizado</div>
              <div className="text-sm">
                {selectedSizeInfo.nome_personalizado && <span>Nome: <strong>{selectedSizeInfo.nome_personalizado}</strong></span>}
                {selectedSizeInfo.nome_personalizado && selectedSizeInfo.numero_personalizado && <span> • </span>}
                {selectedSizeInfo.numero_personalizado && <span>Número: <strong>#{selectedSizeInfo.numero_personalizado}</strong></span>}
              </div>
            </div>
          )}

          {erro && <div className="text-accent text-sm mb-3 text-center">{erro}</div>}

          {/* Price breakdown */}
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-3 bg-bg-base rounded-md mb-3 text-sm">
            {emPromocao && promo !== null && (
              <>
                <span className="text-accent font-semibold">{discountLabel || "Promoção"}</span>
                <span className="text-accent font-semibold">-{formatarMoeda(base - promo)}</span>
              </>
            )}
            <span>Base{(emPromocao && promo !== null) ? ' (original)' : ''}:</span>
            <span>{formatarMoeda(base)}</span>
            {adicionalTam > 0 && (
              <>
                <span>Tamanho {selectedTam}:</span>
                <span>+{formatarMoeda(adicionalTam)}</span>
              </>
            )}
            {adicionalPers > 0 && (
              <>
                <span>Personalização:</span>
                <span>+{formatarMoeda(adicionalPers)}</span>
              </>
            )}
            <div className="col-span-2 flex justify-between font-bold text-base pt-2 border-t border-border mt-1">
              <span>Total:</span>
              <span>{formatarMoeda(prontaEntregaPrice)}</span>
            </div>
          </div>

          <button
            className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleConfirm}
            disabled={selectedIdx === null}
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </div>

      {/* Image lightbox overlay */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          alt={lightbox.alt}
          initialIndex={lightbox.index}
          cachedImageUrls={lightbox.cachedImageUrls}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

// ── Page component ──

export default function ProntaEntrega() {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [produtos, setProdutos] = useState<DbProduto[]>([]);
  const [config, setConfig] = useState<LojaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<GroupedProduct | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastProduto, setToastProduto] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: string[];
    alt: string;
    index: number;
    cachedImageUrls: CachedImageMap | null;
  } | null>(null);

  useBodyScrollLock(!!produtoSelecionado);

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [estoqueData, lojaConfig] = await Promise.all([
          getEstoquePublico(),
          getLojaConfig(),
        ]);

        if (!cancelled) {
          setEstoque(estoqueData);
          setConfig(lojaConfig);
          const ids = [...new Set(estoqueData.map((e) => e.produto_id))];
          const produtosData = await getProdutosByIds(ids);
          setProdutos(produtosData);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao carregar dados da pronta entrega:", err);
          setError("Erro ao carregar produtos. Tente novamente mais tarde.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toast timer
  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => setToastVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

  // Group estoque items with full product data
  const grouped = useMemo(() => groupEstoqueItems(estoque, produtos), [estoque, produtos]);

  // Text search filter
  const filtered = useMemo(() => {
    if (!filtroBusca.trim()) return grouped;

    const words = normalizarBusca(filtroBusca).split(" ").filter(Boolean);
    return grouped.filter((p) => {
      const campos = normalizarBusca([p.nome, p.time, p.liga, p.tipo, p.temporada].join(" "));
      return words.every((w) => campos.includes(w));
    });
  }, [grouped, filtroBusca]);

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

  // ── Product grid ──

  return (
    <>
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
            {filtered.map((p) => {
              const priceInfo = getPrecoProduto(
                p.tipo,
                config!,
                p.precoCustomizado,
                p.promocaoTipo,
                p.promocaoValor,
                p.time,
              );
              const { base, promo, emPromocao, badge, discountLabel } = priceInfo;
              const precoBaseMarcado = Math.round(base * PRONTA_ENTREGA_MARKUP * 100) / 100;
              const pePrice = promo !== null ? Math.round(promo * PRONTA_ENTREGA_MARKUP * 100) / 100 : precoBaseMarcado;

              return (
                <div
                  key={p.produto_id}
                  className="product-card-hover bg-card-bg rounded-lg overflow-hidden shadow-card border border-border hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/20 transition-all duration-300 ease-out cursor-default flex flex-col h-full relative"
                >
                  {/* Badges */}
                  <span className="absolute top-1 left-1 sm:top-2 sm:left-2 bg-accent text-white text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10 leading-tight">
                    Pronta Entrega
                  </span>

                  {emPromocao && (
                    <span className="animate-promo-pulse absolute top-1 right-1 sm:top-2 sm:right-2 bg-accent text-white text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-2 py-0.5 rounded-sm shadow-md uppercase tracking-wider z-10 leading-tight">
                      {badge || "PROMO"}
                    </span>
                  )}

                  {/* Image */}
                  <div className="aspect-square bg-gray-100 overflow-hidden relative group/img">
                    {p.imagemUrls.length > 0 ? (
                      <>
                        <ImageCarousel
                          images={p.imagemUrls}
                          alt={p.nome}
                          cachedImageUrls={p.stockTipo === "masculino" ? p.cachedImageUrls : null}
                          onImageClick={(i) =>
                            setLightbox({
                              images: p.imagemUrls,
                              alt: p.nome,
                              index: i,
                              cachedImageUrls: p.stockTipo === "masculino" ? p.cachedImageUrls : null,
                            })
                          }
                        />
                        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none flex items-center gap-0.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="11" y1="8" x2="11" y2="14" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                          </svg>
                          Ampliar
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                        Sem imagem
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2.5 sm:p-4 flex flex-col flex-1">
                    <div className="font-semibold text-xs sm:text-[0.95rem] mb-1 sm:mb-2 line-clamp-2 min-h-[2.5em] sm:min-h-[2.6em]">
                      {p.nome}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 sm:gap-2 mb-1.5 sm:mb-2 overflow-hidden">
                      {p.time && (
                        <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary text-white rounded">
                          {p.time}
                        </span>
                      )}
                      {p.liga && (
                        <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-primary/80 text-white rounded">
                          {p.liga}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 sm:gap-2 mb-1.5 sm:mb-2 overflow-hidden">
                      {p.tipo && (
                        <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-gray-200 text-gray-700 rounded" title={p.tipo}>
                          {TIPO_SHORT[p.tipo] || p.tipo}
                        </span>
                      )}
                      {p.temporada && (
                        <span className="text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 bg-gray-200 text-gray-700 rounded" title={p.temporada}>
                          {p.temporada}
                        </span>
                      )}
                    </div>

                    {/* Available sizes */}
                    <div className="mb-2 sm:mb-3">
                      <p className="text-[10px] sm:text-xs text-text-muted font-medium mb-1">
                        Tamanhos disponíveis
                        {p.stockTipo === "feminino" && <span className="text-pink-500"> (Feminino)</span>}
                      </p>
                      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                        {p.sizes.slice(0, 4).map((s, idx) => (
                          <span key={`${s.tamanho}-${idx}`} className="text-[10px] sm:text-xs">
                            <strong>{s.tamanho}</strong> ({s.quantidade} {s.quantidade === 1 ? 'unidade' : 'unidades'}){s.personalizado ? ' ★' : ''}{s.feminino && p.stockTipo === "ambos" ? <span className="text-pink-500 ml-0.5">F</span> : ''}{s.quantidade === 1 ? <span className="text-orange-500 ml-0.5 font-semibold">última!</span> : ''}
                          </span>
                        ))}
                        {p.sizes.length > 4 && (
                          <button
                            className="text-[10px] sm:text-xs text-accent font-semibold bg-transparent border-none cursor-pointer hover:underline p-0"
                            onClick={() => setProdutoSelecionado(p)}
                          >
                            +{p.sizes.length - 4} ver mais
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mt-auto mb-2 sm:mb-3">
                      <div className="flex items-baseline gap-1 sm:gap-2 min-h-[1.25rem] sm:min-h-[1.75rem]">
                        <span className="font-bold text-sm sm:text-lg text-accent">{formatarMoeda(pePrice)}</span>
                        {promo !== null && (
                          <span className="text-text-muted text-[10px] sm:text-sm line-through">
                            {formatarMoeda(Math.round(base * PRONTA_ENTREGA_MARKUP * 100) / 100)}
                          </span>
                        )}
                      </div>
                      <div className="min-h-[1rem] sm:min-h-[1.25rem]">
                        {emPromocao && badge && (
                          <span className="inline-block text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">
                            {discountLabel || badge}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Add to cart button */}
                    <button
                      className="w-full py-2 sm:py-3 text-xs sm:text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 mt-auto flex-shrink-0 h-9 sm:h-11 flex items-center justify-center"
                      onClick={() => setProdutoSelecionado(p)}
                    >
                      Adicionar ao Carrinho
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      {produtoSelecionado && config && (
        <ProntaEntregaDetailModal
          product={produtoSelecionado}
          config={config}
          onClose={() => setProdutoSelecionado(null)}
          onAdded={(nome) => {
            setToastProduto(nome);
            setToastVisible(true);
          }}
        />
      )}

      {/* Image lightbox overlay (from card images) */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          alt={lightbox.alt}
          initialIndex={lightbox.index}
          cachedImageUrls={lightbox.cachedImageUrls}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Toast notification */}
      <div
        className={`fixed bottom-8 left-1/2 bg-primary text-white px-6 py-3 rounded-md shadow-lg text-sm font-semibold z-[2000] pointer-events-none transition-all duration-300 ${
          toastVisible ? "animate-toast opacity-100" : "opacity-0 translate-y-25"
        }`}
      >
        ✓ {toastProduto} adicionado ao carrinho
      </div>
    </>
  );
}
