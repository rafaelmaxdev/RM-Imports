import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { DbProduto } from "./lib/db";
import { parseImageUrls } from "./lib/db";
import { useCart } from "./CartContext";
import ImageCarousel from "./ImageCarousel";
import { slugify } from "./lib/utils";
import type { CartItem, LojaConfig, PromocaoTipo } from "./types";
import { track } from "@vercel/analytics";
import {
  ADICIONAL_TAMANHO,
  formatarMoeda,
  getCachedImageUrl,
  getPrecoProduto,
  precoPersonalizacao,
  tamanhosDisponiveis,
  TIPOS_SEM_PERSONALIZACAO,
} from "./types";

const OG_PROPERTIES = ["og:title", "og:description", "og:image"] as const;

type MetaSnapshot = {
  element: HTMLMetaElement | null;
  previousContent: string | null;
  created: boolean;
};

function absoluteUrl(value: string): string {
  return new URL(value, window.location.origin).href;
}

function productUrl(produto: DbProduto): string {
  return `/produto/${produto.id}/${slugify(produto.nome)}`;
}

export default function ProductPage({ produtos, config }: { produtos: DbProduto[]; config: LojaConfig }) {
  const { id } = useParams<{ id: string; slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const produto = produtos.find((item) => item.id === id);
  const { addToCart } = useCart();
  const [genero, setGenero] = useState("Masculino");
  const [tamanho, setTamanho] = useState("");
  const [personalizado, setPersonalizado] = useState(false);
  const [nomePersonalizado, setNomePersonalizado] = useState("");
  const [numeroPersonalizado, setNumeroPersonalizado] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!produto) return;

    const previousTitle = document.title;
    const descriptionElement = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const descriptionCreated = !descriptionElement;
    const descriptionMeta = descriptionElement ?? document.createElement("meta");
    const previousDescription = descriptionMeta.getAttribute("content");
    if (descriptionCreated) {
      descriptionMeta.setAttribute("name", "description");
      document.head.appendChild(descriptionMeta);
    }

    const metaSnapshots = OG_PROPERTIES.map((property): MetaSnapshot & { property: string } => {
      const element = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      const created = !element;
      const meta = element ?? document.createElement("meta");
      const previousContent = meta.getAttribute("content");
      if (created) {
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
      }
      return { property, element: meta, previousContent, created };
    });

    const canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonicalElement;
    const canonical = canonicalElement ?? document.createElement("link");
    const previousHref = canonical.getAttribute("href");
    if (canonicalCreated) {
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }

    const images = parseImageUrls(produto.imagem_urls);
    const imageUrl = images[0]
      ? absoluteUrl(getCachedImageUrl(images[0], produto.cached_image_urls, 0, "large"))
      : absoluteUrl("/logo.png");
    const structuredPriceInfo = getPrecoProduto(
      produto.tipo,
      config,
      produto.preco_customizado,
      (produto.promocao_tipo as PromocaoTipo) ?? undefined,
      produto.promocao_valor,
      produto.time,
    );
    const structuredData = (document.getElementById("product-structured-data") as HTMLScriptElement | null)
      ?? document.createElement("script");
    structuredData.id = "product-structured-data";
    structuredData.type = "application/ld+json";
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: produto.nome,
      image: imageUrl,
      sku: produto.id,
      brand: { "@type": "Brand", name: "RM Imports" },
      url: absoluteUrl(productUrl(produto)),
      offers: {
        "@type": "Offer",
        price: structuredPriceInfo.promo ?? structuredPriceInfo.base,
        priceCurrency: "BRL",
        availability: "https://schema.org/PreOrder",
      },
    });
    if (!structuredData.isConnected) document.head.appendChild(structuredData);
    const title = `${produto.nome} | RM Imports`;
    const description = `${produto.nome} — ${produto.time}, ${produto.tipo} ${produto.temporada}. Compre na RM Imports com frete grátis em Bezerros-PE.`;

    const viewEventKey = `product_viewed_${produto.id}`;
    if (!sessionStorage.getItem(viewEventKey)) {
      track("product_viewed", { product_id: produto.id, tipo: produto.tipo });
      sessionStorage.setItem(viewEventKey, "1");
    }

    document.title = title;
    descriptionMeta.setAttribute("content", description);
    metaSnapshots.forEach(({ element, property }) => {
      element?.setAttribute(
        "content",
        property === "og:title" ? title : property === "og:description" ? description : imageUrl,
      );
    });
    canonical.setAttribute("href", absoluteUrl(productUrl(produto)));

    return () => {
      document.title = previousTitle;
      if (descriptionCreated) {
        descriptionMeta.remove();
      } else if (previousDescription === null) {
        descriptionMeta.removeAttribute("content");
      } else {
        descriptionMeta.setAttribute("content", previousDescription);
      }

      metaSnapshots.forEach(({ element, previousContent, created }) => {
        if (created) {
          element?.remove();
        } else if (previousContent === null) {
          element?.removeAttribute("content");
        } else {
          element?.setAttribute("content", previousContent);
        }
      });

      if (canonicalCreated) {
        canonical.remove();
      } else if (previousHref === null) {
        canonical.removeAttribute("href");
      } else {
        canonical.setAttribute("href", previousHref);
      }

      structuredData.remove();
    };
  }, [config, produto]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setGenero("Masculino");
    setTamanho("");
    setPersonalizado(false);
    setNomePersonalizado("");
    setNumeroPersonalizado("");
    setFeedback("");
  }, [produto?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!produto) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-primary mb-3">Produto não encontrado</h1>
        <p className="text-text-muted mb-6">Esse produto não está mais disponível.</p>
        <Link to="/" className="inline-block px-5 py-3 bg-accent text-white rounded-md font-semibold hover:opacity-90">
          Voltar à loja
        </Link>
      </div>
    );
  }

  const produtoAtual = produto;

  async function handleShare() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: produtoAtual.nome, text: `Confira ${produtoAtual.nome}`, url });
        setFeedback("Link compartilhado");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setFeedback("Link copiado");
      } else {
        setFeedback("Não foi possível compartilhar");
      }
    } catch {
      setFeedback("Não foi possível compartilhar");
    }
  }

  const priceInfo = getPrecoProduto(
    produto.tipo,
    config,
    produto.preco_customizado,
    (produto.promocao_tipo as PromocaoTipo) ?? undefined,
    produto.promocao_valor,
    produto.time,
  );
  const images = parseImageUrls(produto.imagem_urls);
  const currentIndex = produtos.findIndex((item) => item.id === produto.id);
  const distanceAfterCurrent = (item: DbProduto) =>
    (produtos.indexOf(item) - currentIndex + produtos.length) % produtos.length;
  const relatedProducts = produtos
    .filter((item) => item.id !== produto.id)
    .sort((a, b) => {
      const sameTeam = Number(b.time === produto.time) - Number(a.time === produto.time);
      if (sameTeam !== 0) return sameTeam;

      const matchingTags = (item: DbProduto) =>
        Number(item.liga === produto.liga)
        + Number(item.tipo === produto.tipo)
        + Number(item.temporada === produto.temporada);
      return matchingTags(b) - matchingTags(a) || distanceAfterCurrent(a) - distanceAfterCurrent(b);
    })
    .slice(0, 4);
  const tamanhosTipo = tamanhosDisponiveis(produto.tipo, genero === "Feminino");
  const semPersonalizacao = TIPOS_SEM_PERSONALIZACAO.includes(produto.tipo);
  const imagensFemininas = parseImageUrls(produto.imagem_urls_feminina);
  const modeloFemininoComImagens = genero === "Feminino" && imagensFemininas.length > 0;
  const imagensDoModelo = modeloFemininoComImagens ? imagensFemininas : images;
  const personalizacaoAtiva = personalizado && !semPersonalizacao;
  const adicionalTam = ADICIONAL_TAMANHO[tamanho] || 0;
  const adicionalPers = personalizacaoAtiva ? precoPersonalizacao(produto.tipo) : 0;
  const precoFinal = (priceInfo.promo ?? priceInfo.base) + adicionalTam + adicionalPers;
  const formularioCompleto = Boolean(
    tamanho && (!personalizacaoAtiva || (nomePersonalizado.trim() && numeroPersonalizado.trim())),
  );
  const ctaLabel = !tamanho
    ? "Selecione um tamanho"
    : personalizacaoAtiva && (!nomePersonalizado.trim() || !numeroPersonalizado.trim())
      ? "Preencha a personalização"
      : "Adicionar ao carrinho";
  const from = location.state?.from;
  const returnPath = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  function handleAddToCart() {
    if (!formularioCompleto) return;

    const item: CartItem = {
      productId: produtoAtual.id,
      nome: produtoAtual.nome,
      imagemUrl: imagensDoModelo[0] || "",
      yupooUrl: produtoAtual.yupoo_url,
      tipo: produtoAtual.tipo,
      temporada: produtoAtual.temporada,
      tamanho,
      genero,
      feminino: genero === "Feminino",
      personalizado: personalizacaoAtiva,
      nomePersonalizado: personalizacaoAtiva ? nomePersonalizado.trim() : undefined,
      numeroPersonalizado: personalizacaoAtiva ? numeroPersonalizado.trim() : undefined,
      preco: precoFinal,
      precoBase: priceInfo.base + adicionalTam + adicionalPers,
      cachedImageUrls: modeloFemininoComImagens ? null : produtoAtual.cached_image_urls,
    };

    addToCart(item);
    track("add_to_cart", {
      product_id: produtoAtual.id,
      tipo: produtoAtual.tipo,
      tamanho,
      preco: precoFinal,
    });
  }

  return (
    <div id="main-content" className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(returnPath)}
        className="mb-3 text-sm text-accent hover:underline cursor-pointer bg-transparent border-none p-0"
      >
        ← Voltar
      </button>
      <nav className="flex flex-wrap items-center gap-2 text-sm text-text-muted mb-5" aria-label="Breadcrumb">
        <Link to="/" className="text-accent hover:underline">Loja</Link>
        <span aria-hidden="true">/</span>
        <span>{produto.liga}</span>
        <span aria-hidden="true">/</span>
        <span className="text-text-main" aria-current="page">{produto.nome}</span>
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-12">
        <div className="overflow-hidden rounded-2xl border border-border bg-[#eeeeeb] shadow-card sm:rounded-3xl lg:col-start-1 lg:row-start-1">
          <ImageCarousel
            key={genero}
            images={imagensDoModelo}
            alt={produto.nome}
            cachedImageUrls={modeloFemininoComImagens ? null : produto.cached_image_urls}
          />
        </div>

        <section className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:rounded-3xl lg:border lg:border-border lg:bg-card-bg lg:p-7 lg:shadow-card">
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="rounded-md bg-primary/7 px-2 py-1 font-bold text-primary">{produto.time}</span>
            <span className="rounded-md bg-primary/7 px-2 py-1 font-bold text-primary">{produto.liga}</span>
            <span className="rounded-md bg-primary/7 px-2 py-1 font-bold text-primary">{produto.tipo}</span>
            <span className="rounded-md bg-primary/7 px-2 py-1 font-bold text-primary">{produto.temporada}</span>
          </div>

          <h1 className="mb-4 text-3xl font-black leading-tight tracking-[-0.03em] text-primary sm:text-4xl">{produto.nome}</h1>

          <div className="mb-5">
            {priceInfo.promo != null ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black tracking-tight text-accent">{formatarMoeda(priceInfo.promo)}</span>
                <span className="text-text-muted line-through">{formatarMoeda(priceInfo.base)}</span>
              </div>
            ) : (
              <span className="text-3xl font-black tracking-tight text-accent">{formatarMoeda(priceInfo.base)}</span>
            )}
            {priceInfo.emPromocao && priceInfo.discountLabel && (
              <span className="inline-block mt-2 text-xs font-bold px-2 py-1 bg-accent/15 text-accent rounded uppercase">
                {priceInfo.discountLabel}
              </span>
            )}
            <p className="mt-2 text-xs text-text-muted">Pagamento em até 12x via Mercado Pago</p>
          </div>

          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 block text-sm font-semibold text-text-muted">Modelo</legend>
              <div className="flex flex-wrap gap-2">
                {["Masculino", ...(produto.feminino ? ["Feminino"] : [])].map((modelo) => (
                  <button
                    key={modelo}
                    type="button"
                    aria-pressed={genero === modelo}
                    className={`rounded-md border border-border bg-card-bg px-4 py-2 text-sm transition-colors cursor-pointer ${
                      genero === modelo ? "border-primary bg-primary text-white" : ""
                    }`}
                    onClick={() => {
                      setGenero(modelo);
                      setTamanho("");
                    }}
                  >
                    {modelo}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-text-muted">
                <span>Tamanho</span>
                <Link to="/tamanhos" className="text-xs font-medium text-accent hover:underline">Guia de tamanhos</Link>
              </legend>
              <div className="flex flex-wrap gap-2">
                {tamanhosTipo.map((t) => {
                  const adicional = ADICIONAL_TAMANHO[t] || 0;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={tamanho === t}
                      className={`flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-card-bg px-3 py-2 text-sm leading-tight transition-colors ${
                        tamanho === t ? "border-primary bg-primary text-white" : ""
                      }`}
                       onClick={() => {
                         setTamanho(t);
                         track("size_selected", { product_id: produtoAtual.id, tipo: produtoAtual.tipo, tamanho: t });
                       }}
                    >
                      <span>{t}</span>
                      {adicional > 0 && (
                        <span className={tamanho === t ? "text-xs font-semibold text-white" : "text-xs font-semibold text-accent"}>
                          +{formatarMoeda(adicional)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {!semPersonalizacao && (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={personalizado}
                  onChange={(event) => setPersonalizado(event.target.checked)}
                  className="m-0 h-4 w-4 cursor-pointer accent-primary"
                />
                Personalizar (+{formatarMoeda(precoPersonalizacao(produto.tipo))})
              </label>
            )}

            {personalizacaoAtiva && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-text-muted" htmlFor="product-personalized-name">
                  Nome
                  <input
                    id="product-personalized-name"
                    type="text"
                    value={nomePersonalizado}
                    onChange={(event) => setNomePersonalizado(event.target.value.toUpperCase())}
                    placeholder="ex: SILVA"
                    className="mt-2 w-full rounded-md border border-border bg-card-bg px-3 py-2 text-sm text-text-main"
                  />
                </label>
                <label className="block text-sm font-semibold text-text-muted" htmlFor="product-personalized-number">
                  Número
                  <input
                    id="product-personalized-number"
                    type="text"
                    inputMode="numeric"
                    value={numeroPersonalizado}
                    onChange={(event) => setNumeroPersonalizado(event.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="ex: 10"
                    className="mt-2 w-full rounded-md border border-border bg-card-bg px-3 py-2 text-sm text-text-main"
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-bg-base p-3 text-sm" aria-label="Resumo do total">
              {priceInfo.promo != null ? (
                <>
                  <span className="text-text-muted line-through">Preço base:</span>
                  <span className="text-text-muted line-through">{formatarMoeda(priceInfo.base)}</span>
                  <span className="font-semibold text-accent">Preço promocional:</span>
                  <span className="font-semibold text-accent">{formatarMoeda(priceInfo.promo)}</span>
                </>
              ) : (
                <>
                  <span>Preço base:</span>
                  <span>{formatarMoeda(priceInfo.base)}</span>
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
              <div className="col-span-2 mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total:</span>
                <span>{formatarMoeda(precoFinal)}</span>
              </div>
            </div>

            <p className="text-xs text-text-muted">Produção e entrega em até 30 dias • suporte via WhatsApp</p>
            <button
              type="button"
              className="min-h-12 w-full cursor-pointer rounded-xl bg-accent px-5 text-sm font-bold text-white transition-colors hover:bg-[#d93648] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleAddToCart}
              disabled={!formularioCompleto}
            >
              {ctaLabel}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 mt-4">
            <button
              type="button"
              className="text-sm text-text-muted hover:text-accent underline cursor-pointer bg-transparent border-none p-0"
              onClick={handleShare}
            >
              Compartilhar
            </button>
          </div>
          <p className="mt-3 text-xs text-text-muted">Confira as medidas antes de comprar.</p>
          <p className="min-h-5 mt-3 text-sm text-primary" aria-live="polite">{feedback}</p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-text-muted" aria-label="Benefícios">
            <li className="rounded-xl bg-bg-base p-3"><strong className="mb-1 block text-primary">Pagamento seguro</strong>Via Mercado Pago</li>
           <li className="rounded-xl bg-bg-base p-3"><strong className="mb-1 block text-primary">Entrega grátis</strong>Em Bezerros-PE</li>
          </ul>
        </section>

        <div className="grid gap-4 md:grid-cols-2 lg:col-start-1 lg:row-start-2">
          <section className="rounded-2xl border border-border bg-card-bg p-5 shadow-card" aria-labelledby="product-details-title">
            <h2 id="product-details-title" className="text-lg font-bold text-primary mb-3">Detalhes do produto</h2>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Time</dt>
                <dd className="text-right font-medium text-text-main">{produto.time}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Liga</dt>
                <dd className="text-right font-medium text-text-main">{produto.liga}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Temporada</dt>
                <dd className="text-right font-medium text-text-main">{produto.temporada}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Modelo/tipo</dt>
                <dd className="text-right font-medium text-text-main">{produto.tipo}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Versões</dt>
                <dd className="text-right font-medium text-text-main">{produto.feminino ? "Masculina e feminina" : "Masculina"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card-bg p-5 shadow-card" aria-labelledby="delivery-details-title">
            <h2 id="delivery-details-title" className="text-lg font-bold text-primary mb-3">Entrega e pagamento</h2>
            <ul className="grid gap-2 text-sm text-text-main">
              <li>Entrega grátis em Bezerros-PE.</li>
              <li>Retirada em Caruaru.</li>
              <li>Pagamento seguro e parcelamento via Mercado Pago.</li>
            </ul>
          </section>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-10" aria-labelledby="related-products-title">
          <div className="mb-5">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-accent">Você também pode gostar</p>
            <h2 id="related-products-title" className="text-xl font-bold text-primary">Produtos relacionados</h2>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">Encontre outros modelos para completar sua coleção.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {relatedProducts.map((related) => {
              const relatedImages = parseImageUrls(related.imagem_urls);
              const relatedImage = relatedImages[0]
                ? getCachedImageUrl(relatedImages[0], related.cached_image_urls, 0, "small")
                : "/logo.png";
              const relatedPriceInfo = getPrecoProduto(
                related.tipo,
                config,
                related.preco_customizado,
                (related.promocao_tipo as PromocaoTipo) ?? undefined,
                related.promocao_valor,
                related.time,
              );
              return (
                <Link
                  key={related.id}
                  to={productUrl(related)}
                  state={{ from: location.pathname }}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card-bg shadow-card transition-all hover:-translate-y-1 hover:border-accent/30 hover:shadow-card-hover motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className="aspect-square overflow-hidden bg-gray-100">
                    <img
                      src={relatedImage}
                      alt={related.nome}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                      loading="lazy"
                    />
                  </div>
                   <div className="flex flex-1 flex-col p-3 transition-colors duration-200 group-hover:bg-accent/5 group-focus-visible:bg-accent/5">
                     <h3 className="min-h-10 line-clamp-2 font-semibold text-sm leading-5 text-text-main transition-colors duration-200 group-hover:text-accent group-focus-visible:text-accent">{related.nome}</h3>
                    <p className="mt-2 text-sm font-bold text-accent">
                      {formatarMoeda(relatedPriceInfo.promo ?? relatedPriceInfo.base)}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                        <span className={`inline-flex w-fit items-center rounded-full bg-primary/7 px-2 py-1 text-xs font-bold text-primary transition-colors duration-200 ${related.time === produto.time ? "group-hover:bg-accent group-hover:text-white group-focus-visible:bg-accent group-focus-visible:text-white" : "group-hover:bg-primary/10 group-hover:text-primary group-focus-visible:bg-primary/10 group-focus-visible:text-primary"}`}>
                          {related.time}
                        </span>
                        <span className={`inline-flex w-fit items-center rounded-full bg-bg-base px-2 py-1 text-xs font-medium text-text-muted transition-colors duration-200 ${related.tipo === produto.tipo ? "group-hover:bg-accent group-hover:text-white group-focus-visible:bg-accent group-focus-visible:text-white" : "group-hover:bg-primary/10 group-hover:text-primary group-focus-visible:bg-primary/10 group-focus-visible:text-primary"}`}>
                          {related.tipo}
                        </span>
                        <span className={`inline-flex w-fit items-center rounded-full bg-bg-base px-2 py-1 text-xs font-medium text-text-muted transition-colors duration-200 ${related.temporada === produto.temporada ? "group-hover:bg-accent group-hover:text-white group-focus-visible:bg-accent group-focus-visible:text-white" : "group-hover:bg-primary/10 group-hover:text-primary group-focus-visible:bg-primary/10 group-focus-visible:text-primary"}`}>
                          {related.temporada}
                        </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
