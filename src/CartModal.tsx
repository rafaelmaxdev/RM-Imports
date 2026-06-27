import { useState, useEffect } from "react";
import useBodyScrollLock from "./hooks/useBodyScrollLock";
import { useCart } from "./CartContext";
import type { CartItem } from "./types";
import type { LojaConfig, PromocaoTipo, CachedImageMap } from "./types";
import { precoPersonalizacao, ADICIONAL_TAMANHO, formatarMoeda, getPrecoProduto, TIPOS_SEM_PERSONALIZACAO, tamanhosDisponiveis } from "./types";
import ImageCarousel from "./ImageCarousel";
import ImageLightbox from "./ImageLightbox";
import { parseImageUrls } from "./lib/db";
import { supabase } from "./lib/supabase";
import { tables, headerKeyMap } from "./sizeChartData";

interface CartModalProps {
  produto: {
    id: string;
    nome: string;
    imagem_urls: string[];
    imagem_urls_feminina?: string[];
    yupoo_url: string;
    tipo: string;
    temporada: string;
    feminino: boolean;
    preco_customizado?: number | null;
    promocao_tipo?: string | null;
    promocao_valor?: number | null;
    cached_image_urls?: import("./types").CachedImageMap | null;
    time?: string;
  };
  config: LojaConfig;
  onClose: () => void;
  onAdded: (nome: string) => void;
}

export default function CartModal({ produto, config, onClose, onAdded }: CartModalProps) {
  const { addToCart } = useCart();
  const [tamanho, setTamanho] = useState("");
  const [genero, setGenero] = useState("Masculino");
  const [personalizado, setPersonalizado] = useState(false);
  const [nomePersonalizado, setNomePersonalizado] = useState("");
  const [numeroPersonalizado, setNumeroPersonalizado] = useState("");
  const [erro, setErro] = useState("");
  const [lightbox, setLightbox] = useState<{ images: string[]; alt: string; index: number; cachedImageUrls?: CachedImageMap | null } | null>(null);
  const [showSizeChart, setShowSizeChart] = useState(false);

  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const semPersonalizacao = TIPOS_SEM_PERSONALIZACAO.includes(produto.tipo);
  const tamanhosTipo = tamanhosDisponiveis(produto.tipo, genero === "Feminino");

  const [feminineImages, setFeminineImages] = useState<string[]>([]);
  useEffect(() => {
    Promise.resolve(supabase.from("produtos").select("imagem_urls_feminina").eq("id", produto.id).single()).then(({ data }: any) => {
      if (data?.imagem_urls_feminina) {
        const imgs = Array.isArray(data.imagem_urls_feminina) ? data.imagem_urls_feminina.filter(Boolean) : [];
        setFeminineImages(imgs);
      }
    }).catch(() => {});
  }, [produto.id]);

  const allImages = genero === "Feminino" && feminineImages.length > 0
    ? feminineImages
    : parseImageUrls(produto.imagem_urls);
  const isFeminineMode = genero === "Feminino" && feminineImages.length > 0;

  const { base: precoBase, promo: precoPromo, emPromocao, discountLabel } = getPrecoProduto(
    produto.tipo,
    config,
    produto.preco_customizado,
    (produto.promocao_tipo as PromocaoTipo) ?? undefined,
    produto.promocao_valor,
    produto.time
  );
  const adicionalTam = ADICIONAL_TAMANHO[tamanho] || 0;
  const adicionalPers = personalizado ? precoPersonalizacao(produto.tipo) : 0;
  const precoFinal = (precoPromo ?? precoBase) + adicionalTam + adicionalPers;

  function handleConfirm() {
    if (!tamanho) {
      setErro("Selecione um tamanho.");
      return;
    }
    if (personalizado && (!nomePersonalizado.trim() || !numeroPersonalizado.trim())) {
      setErro("Preencha nome e número para personalização.");
      return;
    }

    const item: CartItem = {
      productId: produto.id,
      nome: produto.nome,
      imagemUrl: allImages[0] || "",
      yupooUrl: produto.yupoo_url,
      tipo: produto.tipo,
      temporada: produto.temporada,
      tamanho,
      genero,
      feminino: genero === "Feminino",
      personalizado,
      nomePersonalizado: personalizado ? nomePersonalizado.trim() : undefined,
      numeroPersonalizado: personalizado ? numeroPersonalizado.trim() : undefined,
      preco: precoFinal,
      precoBase: precoBase + adicionalTam + adicionalPers,
      cachedImageUrls: produto.cached_image_urls,
    };

    addToCart(item);
    onAdded(produto.nome);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4" onClick={onClose} role="presentation">
        <div className="bg-card-bg rounded-md p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Adicionar ${produto.nome} ao carrinho`}>
          {showSizeChart ? (
            /* ── Size chart view ── */
            <>
              <button
                className="flex items-center gap-1 text-sm text-accent hover:underline cursor-pointer bg-transparent border-none p-0 mb-3"
                onClick={() => setShowSizeChart(false)}
              >
                ← Voltar ao produto
              </button>
              <h3 className="mb-3 text-primary font-semibold text-lg">Guia de Tamanhos</h3>
              <p className="text-text-muted text-sm mb-3 leading-relaxed">
                Confira as medidas de cada versão para encontrar o tamanho ideal. As medidas estão em centímetros (cm).
              </p>
              <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="text-xs text-blue-800 font-semibold">💡 Dica</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  A versão Jogador costuma vestir mais justa. Recomendamos pegar <strong>1 ou 2 tamanhos acima</strong> do que você usaria na versão Torcedor.
                </p>
              </div>
              <div className="space-y-5">
                {tables.map((table) => (
                  <section key={table.title}>
                    <h4 className="text-sm font-bold text-primary mb-1">{table.title}</h4>
                    {table.subtitle && (
                      <p className="text-[11px] text-text-muted mb-2">{table.subtitle}</p>
                    )}
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-primary text-white">
                            {table.headers.map((h) => (
                              <th key={h} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, i) => (
                            <tr key={row.tam} className={`border-b border-border ${i % 2 === 0 ? "bg-card-bg" : "bg-bg-base"}`}>
                              {table.headers.map((h) => {
                                const key = headerKeyMap[h];
                                return (
                                  <td
                                    key={h}
                                    className={`px-2 py-1.5 whitespace-nowrap text-center ${
                                      h === "Tam." || h === "Tamanho" || h === "Tamanho BR" ? "font-bold text-primary" : "text-text-main"
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
            </>
          ) : (
            /* ── Product form view ── */
            <>
              <button
                className="absolute top-3 right-3 text-text-muted hover:text-primary cursor-pointer bg-transparent border-none text-xl leading-none p-1 z-10"
                onClick={onClose}
                aria-label="Fechar"
              >
                ✕
              </button>
              <h3 className="mb-4 text-primary font-semibold text-lg">Adicionar ao Carrinho</h3>

              <div className="mb-4 -mx-6 -mt-2">
                <ImageCarousel
                  images={allImages}
                  alt={produto.nome}
                  cachedImageUrls={isFeminineMode ? null : produto.cached_image_urls}
                  onImageClick={(i) => setLightbox({
                    images: allImages,
                    alt: produto.nome,
                    index: i,
                    cachedImageUrls: isFeminineMode ? null : produto.cached_image_urls,
                  })}
                />
              </div>

              <div className="mb-4 pb-4 border-b border-border">
                <div className="font-semibold">{produto.nome}</div>
                {emPromocao ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-accent font-bold text-lg">{formatarMoeda(precoPromo!)}</span>
                    <span className="text-text-muted text-sm line-through">{formatarMoeda(precoBase)}</span>
                  </div>
                ) : (
                  <div className="text-accent font-bold text-lg">{formatarMoeda(precoBase)}</div>
                )}
                {emPromocao && discountLabel && (
                  <span className="inline-block mt-1 text-[10px] font-extrabold px-2 py-0.5 bg-accent/15 text-accent rounded-sm uppercase tracking-wider">{discountLabel}</span>
                )}
              </div>

              {produto.tipo === "Jogador" && (
                <div className="mb-3 p-2.5 bg-blue-50 rounded-md border border-blue-200">
                  <p className="text-xs text-blue-800 font-semibold">💡 Dica de tamanho</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    A versão Jogador costuma vestir mais justa. Recomendamos pegar <strong>1 ou 2 tamanhos acima</strong> do que você usaria na versão Torcedor.
                  </p>
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-text-muted">Tamanho</label>
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline font-medium bg-transparent border-none cursor-pointer p-0"
                    onClick={() => setShowSizeChart(true)}
                  >
                    Guia de tamanhos
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {tamanhosTipo.filter((t) => !ADICIONAL_TAMANHO[t]).map((t) => (
                    <button
                      key={t}
                      className={`px-3 py-1.5 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors ${
                        tamanho === t ? "bg-primary text-white border-primary" : ""
                      }`}
                      onClick={() => {
                        setTamanho(t);
                        setErro("");
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {tamanhosTipo.filter((t) => ADICIONAL_TAMANHO[t]).map((t) => (
                    <button
                      key={t}
                      className={`px-3 py-1.5 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors flex flex-col items-center gap-0.5 ${
                        tamanho === t ? "bg-primary text-white border-primary" : ""
                      }`}
                      onClick={() => {
                        setTamanho(t);
                        setErro("");
                      }}
                    >
                      {t}
                      <span className="text-xs text-accent font-semibold">
                        +{formatarMoeda(ADICIONAL_TAMANHO[t])}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-text-muted mb-2">Modelo</label>
                <div className="flex gap-2">
                  {["Masculino", ...(produto.feminino ? ["Feminino"] as const : [])].map((g) => (
                    <button
                      key={g}
                      className={`px-4 py-2 border border-border bg-card-bg rounded-md cursor-pointer text-sm transition-colors ${
                        genero === g ? "bg-primary text-white border-primary" : ""
                      }`}
                      onClick={() => { setGenero(g); setTamanho(""); setErro(""); }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {!semPersonalizacao && (
              <div className="mb-4">
                <div className="flex items-center gap-1">
                  <input
                    id="personalizar-check"
                    type="checkbox"
                    checked={personalizado}
                    onChange={(e) => {
                      setPersonalizado(e.target.checked);
                      setErro("");
                    }}
                    className="w-4 h-4 accent-primary cursor-pointer m-0"
                  />
                  <label htmlFor="personalizar-check" className="text-sm font-medium cursor-pointer select-none">
                    Personalizar (+{formatarMoeda(precoPersonalizacao(produto.tipo))})
                  </label>
                </div>
              </div>
            )}

              {personalizado && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-muted mb-2">Nome</label>
                    <input
                      type="text"
                      value={nomePersonalizado}
                      onChange={(e) => {
                        setNomePersonalizado(e.target.value.toUpperCase());
                        setErro("");
                      }}
                      placeholder="ex: SILVA"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-text-muted mb-2">Número</label>
                    <input
                      type="text"
                      value={numeroPersonalizado}
                      onChange={(e) => {
                        setNumeroPersonalizado(e.target.value.replace(/[^0-9]/g, ""));
                        setErro("");
                      }}
                      placeholder="ex: 10"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-card-bg"
                    />
                  </div>
                </>
              )}

              {erro && <div className="text-accent text-sm mb-3 text-center">{erro}</div>}

              <div className="grid grid-cols-[1fr-auto] gap-x-4 gap-y-1 p-3 bg-bg-base rounded-md mb-3 text-sm">
                {emPromocao ? (
                  <>
                    <span className="line-through text-text-muted">Preço base:</span>
                    <span className="line-through text-text-muted">{formatarMoeda(precoBase)}</span>
                    <span className="text-accent font-semibold">Preço promocional:</span>
                    <span className="text-accent font-semibold">{formatarMoeda(precoPromo!)}</span>
                  </>
                ) : (
                  <>
                    <span>Preço base:</span>
                    <span>{formatarMoeda(precoBase)}</span>
                  </>
                )}
                {adicionalTam > 0 && (
                  <>
                    <span>Tamanho {tamanho}:</span>
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
                  <span>{formatarMoeda(precoFinal)}</span>
                </div>
              </div>

              <button
                className="w-full py-3 text-sm font-semibold bg-accent text-white rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConfirm}
                disabled={!tamanho}
              >
                Adicionar ao Carrinho
              </button>
            </>
          )}
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