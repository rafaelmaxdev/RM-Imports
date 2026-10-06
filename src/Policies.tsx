import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WHATSAPP_SUPPORT } from "./types";

export type PolicyKind = "frete" | "reembolso" | "trocas" | "privacidade";

type PolicySection = {
  heading: string;
  content: ReactNode;
};

type Policy = {
  title: string;
  summary: string;
  description: string;
  sections: readonly PolicySection[];
};

const LAST_UPDATED = "27 de setembro de 2026";
const FINAL_NOTE = "Estas políticas complementam, sem limitar, os direitos assegurados pela legislação brasileira aplicável.";

const POLICIES: Record<PolicyKind, Policy> = {
  frete: {
    title: "Política de entrega e retirada",
    summary: "Como funcionam o atendimento local, a produção e a combinação da entrega ou retirada do seu pedido.",
    description: "Entenda os prazos de produção, entrega e retirada da RM Imports.",
    sections: [
      {
        heading: "Onde atendemos",
        content: (
          <p>
            A RM Imports oferece entrega gratuita somente em Bezerros-PE. Também é possível retirar o pedido em Caruaru-PE,
            mediante combinação prévia pelo WhatsApp. No momento, não prometemos envio nacional; confirme as opções disponíveis
            antes de concluir a compra.
          </p>
        ),
      },
      {
        heading: "Produção e entrega",
        content: (
          <p>
            Depois do pagamento e da confirmação dos detalhes do pedido, a produção normalmente leva de 3 a 4 dias úteis e,
            no máximo, 7 dias úteis. Quando a produção estiver concluída, a entrega ou a disponibilização para retirada ocorre
            em até 30 dias úteis. São etapas consecutivas: primeiro acontece a produção e, somente depois de concluída, começa
            a contar o prazo de entrega ou disponibilização. Não é um único prazo corrido.
          </p>
        ),
      },
      {
        heading: "Contagem e atualizações",
        content: (
          <p>
            Todos os prazos são contados em dias úteis. Fatos externos podem exigir atualização de uma data, como mudanças
            operacionais ou dificuldades de transporte. Se isso acontecer, a RM Imports informa o cliente pelo WhatsApp e
            mantém o acompanhamento do pedido.
          </p>
        ),
      },
      {
        heading: "Conferência antes da entrega",
        content: (
          <p>
            Antes da entrega ou da disponibilização, o fornecedor envia registros e fotos. A RM Imports confere o modelo, o
            tamanho, a personalização e a condição do produto para reduzir divergências antes de combinar o recebimento.
          </p>
        ),
      },
      {
        heading: "Endereço e reagendamento",
        content: (
          <p>
            Informe endereço e contato corretos e mantenha o WhatsApp disponível. Se precisar mudar o horário ou a data
            combinada, avise pelo WhatsApp assim que possível para que o reagendamento seja alinhado.
          </p>
        ),
      },
      {
        heading: "Quando houver atraso",
        content: (
          <p>
            Se o pedido ultrapassar o prazo informado, entre em contato pelo WhatsApp. A RM Imports fará a apuração do caso,
            explicará a situação e buscará uma solução adequada, sempre considerando as circunstâncias e os direitos do
            consumidor.
          </p>
        ),
      },
    ],
  },
  reembolso: {
    title: "Política de cancelamento e reembolso",
    summary: "Informações para arrependimento, cancelamento, correção de pedidos e devolução de valores.",
    description: "Conheça as regras de cancelamento e reembolso da RM Imports.",
    sections: [
      {
        heading: "Arrependimento em compras online",
        content: (
          <p>
            Para uma compra online, o arrependimento pode ser solicitado em até 7 dias corridos após o recebimento, sem
            restringir os direitos previstos no Código de Defesa do Consumidor. Para a devolução, o produto deve estar sem uso
            e sem lavagem, acompanhado dos itens recebidos. A conferência normal do produto faz parte do atendimento e não
            elimina direitos legais.
          </p>
        ),
      },
      {
        heading: "Como solicitar",
        content: (
          <p>
            Envie a solicitação pelo WhatsApp com o número do pedido e o motivo do contato. A RM Imports confirmará o
            recebimento e orientará os próximos passos para cancelamento, devolução ou reembolso.
          </p>
        ),
      },
      {
        heading: "Cancelamento e etapa da produção",
        content: (
          <p>
            Um cancelamento solicitado antes ou depois do início da produção será analisado conforme a etapa em que o pedido
            estiver. Essa análise não afasta nenhum direito legal aplicável ao caso.
          </p>
        ),
      },
      {
        heading: "Forma e prazo do reembolso",
        content: (
          <p>
            Quando aprovado, o pagamento será devolvido pelo mesmo meio utilizado na compra. O prazo para o crédito aparecer
            depende do Mercado Pago, do banco ou da administradora do cartão depois da aprovação do reembolso.
          </p>
        ),
      },
      {
        heading: "Divergência ou defeito excepcional",
        content: (
          <p>
            A RM Imports realiza uma inspeção preventiva antes da entrega. Se, ainda assim, houver divergência ou defeito
            excepcional, providenciaremos uma nova peça sem custo. Um novo prazo será informado, considerando até 7 dias úteis
            para a produção e até 30 dias úteis para a entrega ou disponibilização após a produção. Se a reposição for inviável
            ou outra solução legal for aplicável, serão oferecidas as alternativas cabíveis, inclusive o reembolso.
          </p>
        ),
      },
    ],
  },
  trocas: {
    title: "Política de troca e devolução",
    summary: "Veja como pedir troca por tamanho, correção de divergências e atendimento para situações excepcionais.",
    description: "Saiba como funcionam as trocas e devoluções na RM Imports.",
    sections: [
      {
        heading: "Tamanho escolhido pelo cliente",
        content: (
          <p>
            Se o tamanho escolhido pelo cliente não servir, a solicitação deve ser feita em até 7 dias corridos. A troca
            depende da disponibilidade em estoque. Quando possível, a RM Imports assume o transporte e a entrega local. O
            produto deve estar sem uso e sem lavagem, com as etiquetas e os itens recebidos.
          </p>
        ),
      },
      {
        heading: "Se não houver estoque",
        content: (
          <p>
            Se o tamanho ou modelo desejado estiver indisponível, informaremos a falta de estoque e apresentaremos as
            alternativas disponíveis. O direito de arrependimento permanece quando for aplicável à compra.
          </p>
        ),
      },
      {
        heading: "Divergência em relação ao pedido",
        content: (
          <p>
            Se o produto recebido tiver modelo, tamanho ou personalização diferente do pedido, a RM Imports fará a correção
            integral sem custo para o cliente.
          </p>
        ),
      },
      {
        heading: "Defeito excepcional",
        content: (
          <p>
            Em um defeito excepcional, entre em contato pelo WhatsApp e envie fotos ou vídeos que ajudem na análise. Se a
            situação for confirmada, providenciaremos uma nova peça gratuitamente e informaremos o novo prazo. Esse fluxo não
            limita as garantias legais aplicáveis.
          </p>
        ),
      },
      {
        heading: "Passo a passo pelo WhatsApp",
        content: (
          <ol className="list-decimal space-y-2 pl-5">
            <li>Informe o número do pedido.</li>
            <li>Descreva o que aconteceu e diga qual solução você solicita.</li>
            <li>Envie fotos ou vídeos quando forem úteis para demonstrar a divergência ou o defeito.</li>
            <li>Combine a coleta, a entrega ou a retirada em Caruaru-PE.</li>
          </ol>
        ),
      },
      {
        heading: "Conferência na devolução",
        content: (
          <p>
            A inspeção feita quando o produto é devolvido busca verificar sinais de uso ou danos posteriores. Ela não impede o
            exercício de direitos legais nem substitui a análise individual de cada situação.
          </p>
        ),
      },
    ],
  },
  privacidade: {
    title: "Política de privacidade",
    summary: "Saiba quais dados a RM Imports utiliza, por que precisa deles e como você pode exercer seus direitos.",
    description: "Veja como a RM Imports trata dados pessoais, pedidos e mensagens de suporte.",
    sections: [
      {
        heading: "Dados que podemos receber",
        content: (
          <p>
            Podemos receber nome, telefone, endereço, e-mail, CPF, itens e informações do pedido, além das mensagens
            trocadas com o suporte. O e-mail e o CPF são coletados para processar o pagamento e ajudar na análise de
            segurança e prevenção a fraudes. O pagamento é processado pelo Mercado Pago, e a loja não armazena o número
            completo nem a senha do cartão.
          </p>
        ),
      },
      {
        heading: "Para que usamos os dados",
        content: (
          <p>
            Os dados são usados para processar a compra, preparar e entregar o pedido, prestar suporte, prevenir fraudes,
            cumprir obrigações legais e melhorar o site e a experiência de navegação.
          </p>
        ),
      },
      {
        heading: "Compartilhamento necessário",
        content: (
          <p>
            O e-mail e o CPF são compartilhados com o Mercado Pago para processar o pagamento e ajudar na análise de
            segurança. Compartilhamos somente o mínimo necessário com o Mercado Pago, com o Supabase e a infraestrutura que
            sustenta a loja, e com fornecedores ou serviços de logística quando isso for necessário para atender o pedido. O
            e-mail e o CPF não aparecem em registros públicos do pedido. A RM Imports não vende dados pessoais.
          </p>
        ),
      },
      {
        heading: "Armazenamento local e métricas",
        content: (
          <p>
            Podemos usar armazenamento local essencial para manter o carrinho e facilitar o acesso ao pedido neste dispositivo.
            Também utilizamos métricas técnicas e analytics para acompanhar desempenho, estabilidade e uso do site. Não
            fazemos promessa sobre cookies além dos recursos efetivamente utilizados pela loja.
          </p>
        ),
      },
      {
        heading: "Segurança e retenção",
        content: (
          <p>
            Os dados de identificação usados no checkout são tratados em áreas restritas do backend. O acesso é limitado às
            finalidades do atendimento, do pagamento, da segurança e às obrigações legais aplicáveis.
            As informações são mantidas pelo período necessário a essas finalidades e ao cumprimento das obrigações legais.
          </p>
        ),
      },
      {
        heading: "Seus direitos pela LGPD",
        content: (
          <p>
            Você pode solicitar confirmação do tratamento, acesso, correção, informações sobre o uso, exclusão quando cabível
            e revogação do consentimento. Para exercer esses direitos, fale com a RM Imports pelo WhatsApp; poderemos pedir
            dados mínimos para confirmar a identidade e localizar o pedido.
          </p>
        ),
      },
      {
        heading: "Menores de idade",
        content: (
          <p>
            Compras devem ser realizadas ou acompanhadas por um responsável. Caso uma situação envolvendo menor precise de
            atenção, o responsável pode procurar a RM Imports pelo WhatsApp.
          </p>
        ),
      },
    ],
  },
};

export default function Policies({ kind }: { kind: PolicyKind }) {
  const policy = POLICIES[kind];

  useEffect(() => {
    const previousTitle = document.title;
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const metaDescription = existingMeta ?? document.createElement("meta");
    const previousDescription = metaDescription.getAttribute("content");

    if (!existingMeta) {
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }

    document.title = `${policy.title} | RM Imports`;
    metaDescription.setAttribute("content", policy.description);

    return () => {
      document.title = previousTitle;

      if (existingMeta) {
        if (previousDescription === null) {
          existingMeta.removeAttribute("content");
        } else {
          existingMeta.setAttribute("content", previousDescription);
        }
      } else {
        metaDescription.remove();
      }
    };
  }, [policy]);

  const whatsappUrl = `https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent(`Olá! Preciso de ajuda sobre a ${policy.title}.`)}`;

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16" aria-labelledby="policy-title">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to="/" className="font-semibold text-primary no-underline transition-colors hover:text-accent">
              Início
            </Link>
          </li>
          <li aria-hidden="true" className="text-text-muted">/</li>
          <li aria-current="page">{policy.title}</li>
        </ol>
      </nav>

      <header className="border-b border-border pb-8 sm:pb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Políticas RM Imports</p>
        <h1 id="policy-title" className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
          {policy.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-text-muted sm:text-lg">{policy.summary}</p>
        <p className="mt-5 text-sm text-text-muted">
          <span className="font-semibold text-text-main">Última atualização:</span> {LAST_UPDATED}
        </p>
      </header>

      <div className="space-y-4 py-8 sm:py-10">
        {policy.sections.map((section, index) => {
          const sectionId = `policy-section-${index + 1}`;

          return (
            <section key={section.heading} aria-labelledby={sectionId} className="rounded-2xl border border-border bg-card-bg p-5 shadow-card sm:p-7">
              <div className="flex gap-4 sm:gap-5">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-white">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={sectionId} className="text-lg font-extrabold tracking-tight text-primary sm:text-xl">
                    {section.heading}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-text-muted sm:text-base">{section.content}</div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="policy-support-title" className="rounded-2xl bg-primary p-6 text-white shadow-card sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Atendimento</p>
        <h2 id="policy-support-title" className="mt-2 text-2xl font-black tracking-tight">Ficou com alguma dúvida?</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
          Fale com a RM Imports pelo WhatsApp para confirmar um prazo, combinar a entrega ou pedir ajuda com seu pedido.
        </p>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white no-underline transition-opacity hover:opacity-90"
        >
          Falar pelo WhatsApp
        </a>
      </section>

      <p className="mt-8 border-t border-border pt-6 text-sm leading-6 text-text-muted">{FINAL_NOTE}</p>
    </article>
  );
}
