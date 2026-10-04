const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const SECOND = 1000;

export interface PromotionCountdownProps {
  endsAt?: string | null;
  now: number;
  compact?: boolean;
  discountLabel?: string | null;
}

export interface RemainingParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function getRemainingParts(endsAt?: string | null, now = Date.now()): RemainingParts | null {
  if (!endsAt || typeof endsAt !== "string" || !Number.isFinite(now)) return null;

  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;

  const remaining = end - now;
  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  let remainder = remaining;
  const days = Math.floor(remainder / DAY);
  remainder %= DAY;
  const hours = Math.floor(remainder / HOUR);
  remainder %= HOUR;
  const minutes = Math.floor(remainder / MINUTE);
  const seconds = Math.floor((remainder % MINUTE) / SECOND);

  return { days, hours, minutes, seconds, expired: false };
}

export function formatRemaining(endsAt?: string | null, now = Date.now()): string | null {
  const parts = getRemainingParts(endsAt, now);
  if (!parts) return null;
  if (parts.expired) return "Oferta encerrada";

  return `${parts.days}d ${String(parts.hours).padStart(2, "0")}h ${String(parts.minutes).padStart(2, "0")}m ${String(parts.seconds).padStart(2, "0")}s`;
}

function formatDeadline(endsAt: string): string {
  const end = Date.parse(endsAt);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(end - SECOND));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.day}/${values.month}, ${values.hour}:${values.minute} (PE)`;
}

export default function PromotionCountdown({ endsAt, now, compact = false, discountLabel }: PromotionCountdownProps) {
  const parts = getRemainingParts(endsAt, now);
  if (!parts) return null;
  if (parts.expired) return <span className="inline-block max-w-full text-xs text-text-muted">Oferta encerrada</span>;

  const values = [
    [String(parts.days).padStart(2, "0"), "Dias"],
    [String(parts.hours).padStart(2, "0"), "Horas"],
    [String(parts.minutes).padStart(2, "0"), "Min"],
    [String(parts.seconds).padStart(2, "0"), "Seg"],
  ] as const;

  if (compact) {
    return (
      <div className="inline-flex max-w-full flex-wrap items-start gap-x-2 gap-y-1">
        <span className="w-full text-[10px] font-semibold text-white/70">Termina em</span>
        <div className="flex max-w-full flex-nowrap gap-2">
          {values.map(([value, label]) => (
            <div key={label} className="w-10 shrink-0 rounded-lg border border-white/15 bg-white/10 px-0.5 py-1.5 text-center text-white">
              <span className="block tabular-nums text-lg font-black leading-none">{value}</span>
              <span className="mt-1 block text-[10px] leading-none text-white/60">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const deadline = formatDeadline(endsAt!);
  const [deadlineDate, deadlineTimeWithZone] = deadline.split(", ");
  const deadlineLabel = `Válida até ${deadlineDate} às ${deadlineTimeWithZone.replace(" (PE)", "")} no horário de Pernambuco`;

  return (
    <div className="inline-block max-w-full rounded-xl border border-accent/20 bg-accent/5 p-3 sm:p-3">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <p className="text-xs font-bold text-primary">Oferta termina em</p>
        {discountLabel && (
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-accent">
            {discountLabel}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {values.map(([value, label]) => (
          <div key={label} className="w-12 shrink-0 rounded-lg bg-primary px-1 py-2 text-center text-white sm:w-12">
            <span className="block tabular-nums text-lg font-black leading-none sm:text-lg">{value}</span>
            <span className="mt-1.5 block text-[10px] leading-none">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-text-muted" aria-label={deadlineLabel} title={deadlineLabel}>
        Válida até {deadlineDate}
      </p>
    </div>
  );
}
