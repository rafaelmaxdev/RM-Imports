import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatarMoeda } from "./types";
import {
  getOwnerAccounts,
  parseBRLToCents,
  recordOwnerWithdrawal,
  voidOwnerWithdrawal,
} from "./lib/ownerAccounts";
import type {
  Owner,
  OwnerAccountsResponse,
  OwnerWithdrawal,
} from "./lib/ownerAccounts";

export interface OwnerAccountsProps {
  refreshKey?: number;
  blockedReason?: string;
}

const RECORD_REFRESH_ERROR = "Saque registrado; não foi possível atualizar os saldos. Use Atualizar saldos.";
const VOID_REFRESH_ERROR = "Registro anulado; não foi possível atualizar os saldos. Use Atualizar saldos.";
type LoadResult = "success" | "failure" | "stale";

function todayInRecife(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function formatCents(cents: number): string {
  return formatarMoeda(cents / 100);
}

function ownerName(owner: Owner): string {
  return owner === "rafael" ? "Rafael" : "Renan";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Não foi possível processar a operação financeira.";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function canonicalFormKey(owner: Owner, amount: string, date: string, note: string): string | null {
  const amountCents = parseBRLToCents(amount);
  if (amountCents === null) return null;
  return `${owner}\u0000${amountCents}\u0000${date}\u0000${note.trim()}`;
}

export default function OwnerAccounts({ refreshKey, blockedReason }: OwnerAccountsProps) {
  const [accounts, setAccounts] = useState<OwnerAccountsResponse | null>(null);
  const [snapshotValid, setSnapshotValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [mutation, setMutation] = useState<"record" | "void" | null>(null);

  const [owner, setOwner] = useState<Owner>("rafael");
  const [amount, setAmount] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(todayInRecife);
  const [note, setNote] = useState("");
  const [recordError, setRecordError] = useState("");

  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [maxWithdrawals, setMaxWithdrawals] = useState(20);

  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const mutationRef = useRef<"record" | "void" | null>(null);
  const withdrawalIdRef = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const loadAccounts = useCallback(async (): Promise<LoadResult> => {
    const generation = ++generationRef.current;
    setLoading(true);
    setSnapshotValid(false);
    setRefreshError("");
    setStatusMessage("");

    try {
      const result = await getOwnerAccounts();
      if (!mountedRef.current || generation !== generationRef.current) return "stale";
      setAccounts(result);
      setSnapshotValid(true);
      setRefreshError("");
      return "success";
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return "stale";
      setSnapshotValid(false);
      setRefreshError(errorMessage(error));
      return "failure";
    } finally {
      if (mountedRef.current && generation === generationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts, refreshKey]);

  useEffect(() => {
    const current = withdrawalIdRef.current;
    if (!current) return;
    const key = canonicalFormKey(owner, amount, withdrawalDate, note);
    if (key !== current.key) withdrawalIdRef.current = null;
  }, [amount, note, owner, withdrawalDate]);

  const blocked = Boolean(blockedReason?.trim());
  const canWrite = accounts !== null
    && snapshotValid
    && !loading
    && mutation === null
    && !blocked;
  const today = todayInRecife();

  function stableWithdrawalId(key: string): string {
    if (withdrawalIdRef.current?.key === key) return withdrawalIdRef.current.id;
    const cryptoApi = globalThis.crypto;
    const id = typeof cryptoApi?.randomUUID === "function" ? cryptoApi.randomUUID() : null;
    if (!id) throw new Error("Não foi possível preparar o saque.");
    withdrawalIdRef.current = { key, id };
    return id;
  }

  async function handleRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accounts || !snapshotValid || loading || blocked || mutationRef.current) return;

    const amountCents = parseBRLToCents(amount);
    if (amountCents === null) {
      setRecordError("Informe um valor válido maior que zero.");
      return;
    }

    const available = accounts.balances.owners[owner].balanceCents;
    if (amountCents > available) {
      setRecordError(`O saque não pode ser maior que o saldo disponível de ${formatCents(Math.max(available, 0))}.`);
      return;
    }
    if (!withdrawalDate || withdrawalDate > today) {
      setRecordError("Escolha uma data válida até hoje.");
      return;
    }
    if (note.trim().length > 300) {
      setRecordError("A observação deve ter no máximo 300 caracteres.");
      return;
    }

    const cleanNote = note.trim();
    const key = canonicalFormKey(owner, amount, withdrawalDate, cleanNote);
    if (!key) {
      setRecordError("Informe um valor válido maior que zero.");
      return;
    }

    let id: string;
    try {
      id = stableWithdrawalId(key);
    } catch (error) {
      setRecordError(errorMessage(error));
      return;
    }

    mutationRef.current = "record";
    setMutation("record");
    setRecordError("");
    setStatusMessage("");
    try {
      await recordOwnerWithdrawal({
        id,
        owner,
        amountCents,
        withdrawalDate,
        note: cleanNote,
      });
      if (!mountedRef.current) return;
      setAmount("");
      setNote("");
      setRecordError("");
      withdrawalIdRef.current = null;
      const refreshed = await loadAccounts();
      if (!mountedRef.current) return;
      if (refreshed === "failure") setRefreshError(RECORD_REFRESH_ERROR);
      else if (refreshed === "success") setStatusMessage("Saque registrado.");
    } catch (error) {
      if (mountedRef.current) setRecordError(errorMessage(error));
    } finally {
      mutationRef.current = null;
      if (mountedRef.current) setMutation(null);
    }
  }

  function openVoid(withdrawal: OwnerWithdrawal) {
    if (!canWrite || mutationRef.current) return;
    setVoidingId(withdrawal.id);
    setVoidReason("");
    setVoidError("");
  }

  function closeVoid() {
    if (mutationRef.current) return;
    setVoidingId(null);
    setVoidReason("");
    setVoidError("");
  }

  async function handleVoid(withdrawal: OwnerWithdrawal) {
    if (!accounts || !snapshotValid || loading || blocked || mutationRef.current) return;
    const reason = voidReason.trim();
    if (!reason) {
      setVoidError("Informe o motivo da anulação.");
      return;
    }
    if (reason.length > 300) {
      setVoidError("O motivo deve ter no máximo 300 caracteres.");
      return;
    }

    mutationRef.current = "void";
    setMutation("void");
    setVoidError("");
    setStatusMessage("");
    try {
      await voidOwnerWithdrawal({ id: withdrawal.id, reason });
      if (!mountedRef.current) return;
      setVoidingId(null);
      setVoidReason("");
      setVoidError("");
      const refreshed = await loadAccounts();
      if (!mountedRef.current) return;
      if (refreshed === "failure") setRefreshError(VOID_REFRESH_ERROR);
      else if (refreshed === "success") setStatusMessage("Registro anulado.");
    } catch (error) {
      if (mountedRef.current) setVoidError(errorMessage(error));
    } finally {
      mutationRef.current = null;
      if (mountedRef.current) setMutation(null);
    }
  }

  const renderOwnerCard = (accountOwner: Owner) => {
    const balance = accounts!.balances.owners[accountOwner];
    return (
      <div key={accountOwner} className="rounded-lg border border-border bg-card-bg p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-primary">{ownerName(accountOwner)}</h4>
            <p className="text-xs text-text-muted">30% do lucro líquido</p>
          </div>
          <div className={`text-right text-lg font-bold ${balance.balanceCents < 0 ? "text-red-600" : "text-green-700"}`}>
            {formatCents(balance.balanceCents)}
            <div className="text-[11px] font-normal text-text-muted">saldo disponível</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs text-text-muted">
          <span>Total ganho: <strong className="text-text-main">{formatCents(balance.entitlementCents)}</strong></span>
          <span className="text-right">Saques: <strong className="text-text-main">{formatCents(balance.withdrawnCents)}</strong></span>
        </div>
        {balance.balanceCents < 0 && (
          <p className="mt-2 text-xs font-medium text-red-700">
            Novos ajustes ou custos reduziram este saldo; saques positivos estão impedidos.
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="mb-6 rounded-lg border border-border bg-card-bg p-4" aria-busy={loading}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-primary">Sócios e reserva da loja</h3>
          <p className="text-sm text-text-muted">Saldo global: todos os períodos. Não muda com o filtro de mês.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAccounts()}
          disabled={loading || mutation !== null}
          aria-busy={loading}
          className="min-h-[44px] rounded-md bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <span className="inline-flex items-center gap-1.5"><span className="animate-spin" aria-hidden="true">↻</span> Atualizando…</span> : "Atualizar saldos"}
        </button>
      </div>

      {statusMessage && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">
          {statusMessage}
        </div>
      )}

      {refreshError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900" role="alert">
          <span>{refreshError}</span>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            disabled={loading || mutation !== null}
            aria-busy={loading}
            className="min-h-[44px] rounded-md border border-yellow-300 bg-white px-3 py-2 text-xs font-semibold text-yellow-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {blockedReason && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900" role="alert">
          {blockedReason}
        </div>
      )}

      {!accounts && loading && (
        <p className="py-4 text-sm text-text-muted">Carregando saldos dos sócios…</p>
      )}

      {accounts && (
        <>
          {!snapshotValid && (
            <p className="mb-3 text-xs font-medium text-yellow-800">Exibindo o último saldo válido; ações desabilitadas até atualizar.</p>
          )}

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {renderOwnerCard("rafael")}
            {renderOwnerCard("renan")}
            <div className="rounded-lg border border-border bg-bg-base p-3">
              <h4 className="font-semibold text-primary">Loja</h4>
              <p className="text-xs text-text-muted">40% do lucro líquido</p>
              <div className="mt-2 text-xl font-bold text-green-700" title="Centavos que não podem ser divididos igualmente permanecem na loja.">
                {formatCents(accounts.balances.retainedStoreCents)}
              </div>
              <p className="mt-1 text-xs text-text-muted">Lucro retido para reinvestimento.</p>
            </div>
          </div>

          <p className="mb-3 text-xs text-text-muted">
            60% do lucro líquido para os sócios, dividido igualmente. 40% ficam na loja. Despesas já descontadas; saques não são gastos da loja.
          </p>
          <p className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-900">
            Controle interno de lucros; não movimenta dinheiro nem representa o saldo bancário.
          </p>

          <div className="mb-4 rounded-md border border-border bg-bg-base p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-text-muted">Lucro líquido apurado</h4>
                <div className={`text-2xl font-bold ${accounts.summary.profitCents < 0 ? "text-red-600" : "text-primary"}`}>
                  {formatCents(accounts.summary.profitCents)}
                </div>
              </div>
              <span className="text-xs text-text-muted">
                {countLabel(accounts.summary.eligibleOrderCount, "pedido entregue elegível", "pedidos entregues elegíveis")}
              </span>
            </div>

            {accounts.summary.profitCents < 0 && (
              <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                Novos ajustes e custos reduziram o lucro; não há novos saques positivos até existir saldo disponível.
              </p>
            )}

            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold text-accent">Ver composição do lucro</summary>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-text-muted sm:grid-cols-4">
                <span>Receita: <strong className="text-text-main">{formatCents(accounts.summary.revenueCents)}</strong></span>
                <span>Produtos: <strong className="text-text-main">{formatCents(accounts.summary.productCostCents)}</strong></span>
                <span>Frete: <strong className="text-text-main">{formatCents(accounts.summary.shippingCostCents)}</strong></span>
                <span>Importação: <strong className="text-text-main">{formatCents(accounts.summary.importCostCents)}</strong></span>
                <span>Taxas MP reais: <strong className="text-text-main">{formatCents(accounts.summary.mpFeeCents)}</strong></span>
                <span>Comissões: <strong className="text-text-main">{formatCents(accounts.summary.commissionCents)}</strong></span>
                <span>Despesas extras: <strong className="text-text-main">{formatCents(accounts.summary.extraCostCents)}</strong></span>
              </div>
            </details>
          </div>

          {(accounts.summary.pendingOrderCount > 0
            || accounts.summary.awaitingCostCount > 0
            || accounts.summary.awaitingFeeCount > 0) && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              {accounts.summary.pendingOrderCount > 0 && (
                <p>{countLabel(accounts.summary.pendingOrderCount, "pedido em andamento", "pedidos em andamento")} — {formatCents(accounts.summary.pendingRevenueCents)} em vendas ainda fora da divisão.</p>
              )}
              {accounts.summary.awaitingCostCount > 0 && (
                <p>{countLabel(accounts.summary.awaitingCostCount, "pedido aguardando custo", "pedidos aguardando custos")}. Informe frete e importação como zero quando não houver cobrança.</p>
              )}
              {accounts.summary.awaitingFeeCount > 0 && (
                <p>{countLabel(accounts.summary.awaitingFeeCount, "pedido com taxa de pagamento pendente", "pedidos com taxas de pagamento pendentes")}.</p>
              )}
              <p className="mt-1 font-semibold">Não entram na divisão até concluir entrega e custos.</p>
            </div>
          )}

          {recordError && <p className="mb-3 text-sm text-red-700" role="alert">{recordError}</p>}
          {canWrite && (
            <form onSubmit={handleRecord} className="mb-5 rounded-md border border-border p-3">
              <h4 className="mb-3 text-sm font-semibold text-text-muted">Registrar saque</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-text-muted">
                  Sócio
                  <select
                    value={owner}
                    onChange={(event) => setOwner(event.target.value as Owner)}
                    className="mt-1 block min-h-[42px] w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-main"
                  >
                    <option value="rafael">Rafael</option>
                    <option value="renan">Renan</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-text-muted">
                  Valor (R$)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                    className="mt-1 block min-h-[42px] w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-main"
                  />
                </label>
                <label className="text-xs font-semibold text-text-muted">
                  Data
                  <input
                    type="date"
                    value={withdrawalDate}
                    max={today}
                    onChange={(event) => setWithdrawalDate(event.target.value)}
                    className="mt-1 block min-h-[42px] w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-main"
                  />
                </label>
                <label className="text-xs font-semibold text-text-muted">
                  Observação (opcional)
                  <input
                    type="text"
                    value={note}
                    maxLength={300}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-1 block min-h-[42px] w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-main"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-text-muted">Saldo de {ownerName(owner)}: {formatCents(accounts.balances.owners[owner].balanceCents)}</span>
                <button
                  type="submit"
                  disabled={mutation !== null}
                  className="min-h-[42px] rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mutation === "record" ? "Registrando…" : "Registrar saque"}
                </button>
              </div>
            </form>
          )}

          <div>
            <h4 className="mb-3 text-sm font-semibold text-text-muted">Histórico de saques</h4>
            {accounts.withdrawals.length === 0 ? (
              <p className="text-xs text-text-muted">Nenhum saque registrado.</p>
            ) : (
              <div className="w-full max-w-full overflow-x-auto">
                <table className="min-w-[620px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-text-muted">Data</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-text-muted">Pessoa</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-text-muted">Valor</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-text-muted">Observação</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-text-muted">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.withdrawals.slice(0, maxWithdrawals).map((withdrawal) => {
                      const voided = withdrawal.voided_at !== null;
                      return (
                        <tr key={withdrawal.id} className={`border-b border-border ${voided ? "bg-bg-base/60 text-text-muted" : "hover:bg-bg-base"}`}>
                          <td className="px-2 py-2 align-top">{withdrawal.withdrawal_date.split("-").reverse().join("/")}</td>
                          <td className="px-2 py-2 align-top">{ownerName(withdrawal.owner)}</td>
                          <td className="px-2 py-2 text-right align-top font-medium">{formatCents(withdrawal.amount_cents)}</td>
                          <td className="max-w-[260px] whitespace-pre-wrap break-words px-2 py-2 align-top">
                            {withdrawal.note || "—"}
                            {voided && withdrawal.void_reason && <p className="mt-1 text-xs">Motivo da anulação: {withdrawal.void_reason}</p>}
                          </td>
                          <td className="px-2 py-2 text-right align-top">
                            {voided ? (
                              <span className="text-xs font-semibold">Anulado</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!canWrite || mutation !== null}
                                onClick={() => openVoid(withdrawal)}
                                className="min-h-[40px] rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Anular registro
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {voidingId && (
                      <tr>
                        <td colSpan={5} className="px-2 pb-3 pt-2">
                          <div className="max-w-md rounded-md border border-red-200 bg-red-50 p-3" role="dialog" aria-label="Anular registro">
                            <label className="block text-xs font-semibold text-red-900">
                              Motivo da anulação
                              <input
                                type="text"
                                value={voidReason}
                                maxLength={300}
                                onChange={(event) => setVoidReason(event.target.value)}
                                className="mt-1 block min-h-[42px] w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-normal text-text-main"
                              />
                            </label>
                            {voidError && <p className="mt-2 text-xs text-red-700" role="alert">{voidError}</p>}
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={mutation !== null}
                                onClick={() => {
                                  const withdrawal = accounts.withdrawals.find((item) => item.id === voidingId);
                                  if (withdrawal) void handleVoid(withdrawal);
                                }}
                                className="min-h-[40px] rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {mutation === "void" ? "Anulando…" : "Confirmar anulação"}
                              </button>
                              <button
                                type="button"
                                disabled={mutation !== null}
                                onClick={closeVoid}
                                className="min-h-[40px] rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-text-muted disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {accounts.withdrawals.length > maxWithdrawals && (
                  <button
                    type="button"
                    onClick={() => setMaxWithdrawals((current) => current + 20)}
                    className="mt-3 min-h-[40px] w-full rounded-md border border-border bg-accent/5 py-2 text-xs font-semibold text-accent hover:bg-accent/10"
                  >
                    Mostrar mais ({maxWithdrawals} de {accounts.withdrawals.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
