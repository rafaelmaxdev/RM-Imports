import type { Order } from "../types";
import { buildOrderTrackingLink } from "./orderTracking";

export function montarMensagemCliente(order: Order): string {
  const nome = order.endereco?.nome.trim().split(/\s+/)[0];
  const retirada = order.endereco?.deliveryMethod === "retirada";
  const mensagens: Record<Order["status"], string> = {
    pendente: "está aguardando a confirmação do pagamento. ⏳\n\nSe você já pagou, confira a atualização no acompanhamento ou fale com a gente.",
    pago: "teve o pagamento confirmado! ✅\n\nVamos dar continuidade à preparação do seu pedido.",
    enviado_fornecedor: "foi encaminhado ao fornecedor! 📤\n\nA próxima etapa é a preparação das peças para envio à nossa loja.",
    em_producao: "está em preparação com o fornecedor! 📦\n\nEstamos aguardando o envio para a nossa loja.",
    a_caminho: `está a caminho da nossa loja! 📦\n\nQuando chegar, avisaremos sobre a próxima etapa ${retirada ? "da retirada" : "da entrega"}.`,
    em_estoque: `chegou à nossa loja! 📦\n\n${retirada ? "Avisaremos quando estiver disponível para retirada." : "Avisaremos quando sair para entrega."}`,
    em_entrega: retirada
      ? "está disponível para retirada! 🛍️\n\nResponda esta mensagem para combinar a retirada com a gente."
      : "saiu para entrega! 🚚\n\nFique de olho no contato informado no pedido para facilitar o recebimento.",
    entregue: "foi marcado como entregue! ✅\n\nObrigado por comprar com a RM Imports! Se precisar de ajuda com a compra, fale com a gente.",
    cancelado: "foi cancelado.\n\nSe tiver dúvidas sobre o cancelamento ou algum pagamento realizado, fale com a gente.",
    reembolsado: "foi marcado como reembolsado.\n\nO prazo para o valor aparecer depende do meio de pagamento. Se precisar de ajuda, fale com a gente.",
  };
  const link = buildOrderTrackingLink("https://rm-imports.vercel.app", order.id);

  return `${nome ? `Olá, ${nome}!` : "Olá!"} Aqui é da *RM Imports* 👋\n\nSeu pedido *${order.id}* ${mensagens[order.status]}\n\nAcompanhe seu pedido:\n${link}\n\nQualquer dúvida, é só responder esta mensagem.`;
}
