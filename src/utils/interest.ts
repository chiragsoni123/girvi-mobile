/**
 * Girvi interest engine.
 * ---------------------------------------------------------------------------
 * A loan is replayed as a timeline of events instead of a single formula, so
 * one code path handles every case the shop actually runs into:
 *
 *   • simple interest (exact daily, or full-month blocks)
 *   • compound interest (monthly / quarterly / annual capitalisation)
 *   • part payments that reduce the principal mid-term
 *   • TOP-UPS — extra money borrowed later on the same loan
 *   • the automatic simple -> compound switch once a loan crosses N months
 *
 * How compounding is modelled
 *   "Compounding" here means capitalisation: on each cycle boundary the unpaid
 *   interest accrued so far is folded into the principal, and interest then
 *   runs on the larger base. With no payments this is exactly P(1+r)^n, but it
 *   also stays correct when payments and top-ups land part-way through.
 *
 * The automatic switch (what the shop asked for)
 *   A simple-interest loan still open after `afterMonths` (default 24) is
 *   RECALCULATED AS COMPOUND FROM DAY ONE. The moment the loan crosses the
 *   threshold the whole history is replayed with capitalisation cycles running
 *   from the loan date at `frequency` (default annual) — not merely from the
 *   anniversary onwards. Before the threshold the loan shows plain simple
 *   interest; the day it crosses, the figure steps up.
 *
 *   Turn it off per loan with `autoCompoundOverride = false`, force it on with
 *   `true`, or leave `null` to follow the shop setting.
 */

import {
  CompoundFrequency,
  GirviLoan,
  InterestType,
  LoanTopUp,
  PaymentRecord,
} from '../types/girvi';
import { addDays, addMonths, daysBetween, isAfter, isBefore, todayString } from './dates';

export interface CompoundPolicy {
  /** Shop-wide default for the automatic simple -> compound switch. */
  autoConvertEnabled: boolean;
  /** How long a simple loan may run before it converts. */
  afterMonths: number;
  /** How often it compounds once converted. */
  frequency: CompoundFrequency;
}

export const DEFAULT_COMPOUND_POLICY: CompoundPolicy = {
  autoConvertEnabled: true,
  afterMonths: 24,
  frequency: 'ANNUAL',
};

export type LedgerEventKind = 'DISBURSED' | 'TOPUP' | 'PAYMENT' | 'CAPITALIZE' | 'ACCRUAL';

export interface LedgerEvent {
  date: string;
  kind: LedgerEventKind;
  label: string;
  amount: number;
  principalAfter: number;
  interestDueAfter: number;
}

export interface LoanBreakdown {
  asOfDate: string;
  daysElapsed: number;
  monthsElapsed: number;
  remainingDays: number;
  monthsDisplay: string;

  /** Original principal + every top-up. */
  totalDisbursed: number;
  topUpTotal: number;
  /** Capital outstanding, including any interest that has been capitalised. */
  principalBalance: number;
  capitalizedInterest: number;

  totalAccruedInterest: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  totalDiscountWaived: number;
  unpaidInterest: number;
  totalSettlementAmount: number;

  isOverdue: boolean;
  daysToDue: number | null;

  effectiveInterestType: InterestType;
  isCompounded: boolean;
  /** True when a simple loan has crossed the threshold and switched. */
  autoConverted: boolean;
  /** The date the switch happened (or will happen) — null if not applicable. */
  conversionDate: string | null;
  compoundingLabel: string;
  compoundedPeriods: number;

  simpleInterestComparison: number;
  compoundExtraInterest: number;

  currentMonthlyRate: number;
  ledger: LedgerEvent[];
}

// ---------------------------------------------------------------------------
// Interest type metadata
// ---------------------------------------------------------------------------

export const COMPOUND_MONTHS: Partial<Record<InterestType, number>> = {
  MONTHLY_COMPOUND: 1,
  QUARTERLY_COMPOUND: 3,
  ANNUAL_COMPOUND: 12,
};

export const FREQUENCY_MONTHS: Record<CompoundFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

export function isCompoundType(type: InterestType): boolean {
  return COMPOUND_MONTHS[type] !== undefined;
}

export interface InterestTypeInfo {
  name: string;
  hindi: string;
  badge: string;
  isCompound: boolean;
  frequencyDesc: string;
}

export function getInterestTypeLabel(type: InterestType = 'DAILY_PRO_RATA'): InterestTypeInfo {
  switch (type) {
    case 'MONTHLY_COMPOUND':
      return {
        name: 'Monthly Compound',
        hindi: 'मासिक चक्रवृद्धि ब्याज',
        badge: 'Compound (1M)',
        isCompound: true,
        frequencyDesc: 'Interest added to principal every month',
      };
    case 'QUARTERLY_COMPOUND':
      return {
        name: 'Quarterly Compound',
        hindi: 'त्रैमासिक चक्रवृद्धि ब्याज',
        badge: 'Compound (3M)',
        isCompound: true,
        frequencyDesc: 'Interest added to principal every 3 months',
      };
    case 'ANNUAL_COMPOUND':
      return {
        name: 'Annual Compound',
        hindi: 'वार्षिक चक्रवृद्धि ब्याज',
        badge: 'Compound (12M)',
        isCompound: true,
        frequencyDesc: 'Interest added to principal every 12 months',
      };
    case 'MONTHLY_SIMPLE':
      return {
        name: 'Monthly Simple',
        hindi: 'मासिक साधारण ब्याज',
        badge: 'Simple (Monthly)',
        isCompound: false,
        frequencyDesc: 'Part months are charged as a full month',
      };
    case 'DAILY_PRO_RATA':
    default:
      return {
        name: 'Daily Pro-Rata Simple',
        hindi: 'दैनिक साधारण ब्याज',
        badge: 'Simple (Daily)',
        isCompound: false,
        frequencyDesc: 'Exact day-by-day linear interest',
      };
  }
}

export const INTEREST_TYPE_OPTIONS: InterestType[] = [
  'DAILY_PRO_RATA',
  'MONTHLY_SIMPLE',
  'MONTHLY_COMPOUND',
  'QUARTERLY_COMPOUND',
  'ANNUAL_COMPOUND',
];

// ---------------------------------------------------------------------------
// Core maths
// ---------------------------------------------------------------------------

/**
 * How a stretch of time is converted into "months of interest".
 *
 *   DAILY         — exact days ÷ 30. What "daily pro-rata" means on the board
 *                   outside the shop: 365 days at 2% = 24.33%.
 *   CALENDAR      — whole calendar months + leftover days ÷ 30. A month is a
 *                   month whether it has 28 or 31 days, so twelve monthly
 *                   compounding cycles come to exactly P(1+r)^12.
 *   CALENDAR_CEIL — same, but a part month is billed as a full month. This is
 *                   the MONTHLY_SIMPLE convention: walk in on day 35 and you
 *                   pay for two months.
 */
export type AccrualMode = 'DAILY' | 'CALENDAR' | 'CALENDAR_CEIL';

/** Whole calendar months between two dates, plus the leftover days. */
function splitMonths(from: string, to: string): { months: number; days: number } {
  let months = 0;
  while (months < 1200 && !isAfter(addMonths(from, months + 1), to)) {
    months += 1;
  }
  return { months, days: daysBetween(addMonths(from, months), to) };
}

/** Months of interest chargeable between two dates. */
export function monthWeight(from: string, to: string, mode: AccrualMode): number {
  const totalDays = daysBetween(from, to);
  if (totalDays <= 0) return 0;
  if (mode === 'DAILY') return totalDays / 30;

  const { months, days } = splitMonths(from, to);
  if (mode === 'CALENDAR') return months + days / 30;
  return days > 0 ? months + 1 : Math.max(months, 1);
}

/** Interest on a fixed principal between two dates. */
export function accrueBetween(
  principal: number,
  monthlyRatePct: number,
  from: string,
  to: string,
  mode: AccrualMode
): number {
  if (principal <= 0 || monthlyRatePct <= 0) return 0;
  return principal * (monthlyRatePct / 100) * monthWeight(from, to, mode);
}

/**
 * Day-based helper kept for quick estimates that have no calendar context.
 * `roundUpToMonth` bills a part month as a whole month.
 */
export function accrueSegment(
  principal: number,
  monthlyRatePct: number,
  days: number,
  roundUpToMonth = false
): number {
  if (principal <= 0 || days <= 0 || monthlyRatePct <= 0) return 0;
  const chargeableDays = roundUpToMonth ? Math.ceil(days / 30) * 30 : days;
  return (principal * (monthlyRatePct / 100) * chargeableDays) / 30;
}

/** The accrual convention a loan's interest type implies. */
export function accrualModeFor(type: InterestType): AccrualMode {
  return type === 'DAILY_PRO_RATA' ? 'DAILY' : 'CALENDAR';
}

/** Whether this loan should auto-convert, honouring the per-loan override. */
export function isAutoConvertOn(loan: GirviLoan, policy: CompoundPolicy): boolean {
  if (loan.autoCompoundOverride === true) return true;
  if (loan.autoCompoundOverride === false) return false;
  return policy.autoConvertEnabled;
}

/**
 * The date a simple loan converts to compound — regardless of whether that
 * date has arrived yet. Null when the loan is already compound or the switch
 * is disabled.
 */
export function getConversionDate(loan: GirviLoan, policy: CompoundPolicy): string | null {
  if (isCompoundType(loan.interestType)) return null;
  if (!isAutoConvertOn(loan, policy)) return null;
  return addMonths(loan.loanDate, policy.afterMonths);
}

/** True once a simple loan has crossed the threshold and been converted. */
export function hasConverted(
  loan: GirviLoan,
  policy: CompoundPolicy,
  asOf: string
): boolean {
  const conversion = getConversionDate(loan, policy);
  return !!conversion && !isAfter(conversion, asOf);
}

/** Dates on which unpaid interest gets folded into the principal. */
function capitalizationDates(
  loan: GirviLoan,
  policy: CompoundPolicy,
  asOf: string
): string[] {
  const dates: string[] = [];
  const nativeMonths = COMPOUND_MONTHS[loan.interestType];

  if (nativeMonths) {
    for (let i = 1; ; i += 1) {
      const d = addMonths(loan.loanDate, nativeMonths * i);
      if (isAfter(d, asOf)) break;
      dates.push(d);
      if (i > 600) break; // hard stop, 50 years of monthly cycles
    }
    return dates;
  }

  // Simple loan: nothing compounds until it crosses the threshold.
  if (!hasConverted(loan, policy, asOf)) return dates;

  // Crossed. The loan is now treated as if it had been compound all along, so
  // the cycles run from the loan date — not from the conversion anniversary.
  const stepMonths = FREQUENCY_MONTHS[policy.frequency];
  for (let i = 1; ; i += 1) {
    const d = addMonths(loan.loanDate, stepMonths * i);
    if (isAfter(d, asOf)) break;
    dates.push(d);
    if (i > 600) break;
  }
  return dates;
}

interface TimelineEvent {
  date: string;
  rank: number; // payment -> top-up -> capitalise, on the same day
  kind: 'PAYMENT' | 'TOPUP' | 'CAPITALIZE';
  payment?: PaymentRecord;
  topUp?: LoanTopUp;
}

interface RunResult {
  principal: number;
  interestDue: number;
  totalAccrued: number;
  capitalized: number;
  capitalizations: number;
  ledger: LedgerEvent[];
  currentRate: number;
}

/** Replays the loan day by day through its events. */
function runTimeline(
  loan: GirviLoan,
  payments: PaymentRecord[],
  policy: CompoundPolicy,
  asOf: string,
  options: { allowCapitalisation: boolean; buildLedger: boolean }
): RunResult {
  // A converted loan is priced as a compound loan for its whole life, so it
  // also adopts the calendar-month convention that makes each cycle exact.
  const converted = options.allowCapitalisation && hasConverted(loan, policy, asOf);
  const mode: AccrualMode = converted ? 'CALENDAR' : accrualModeFor(loan.interestType);
  const finalMode: AccrualMode =
    !converted && loan.interestType === 'MONTHLY_SIMPLE' ? 'CALENDAR_CEIL' : mode;

  let principal = loan.principalAmount;
  let interestDue = 0;
  let totalAccrued = 0;
  let capitalized = 0;
  let capitalizations = 0;
  let rate = loan.monthlyInterestRate;
  // The clock starts one day before the pledge date, so the disbursal day
  // itself is already billable — a loan checked (or even settled) on the day
  // it is taken out owes interest for that day, not zero. Every later segment
  // still measures from the real event date the cursor was last moved to, so
  // this extra day is only ever counted once, at the very start of the loan.
  let cursor = addDays(loan.loanDate, -1);

  const ledger: LedgerEvent[] = [];
  const push = (e: LedgerEvent) => {
    if (options.buildLedger) ledger.push(e);
  };

  push({
    date: loan.loanDate,
    kind: 'DISBURSED',
    label: 'Loan disbursed',
    amount: loan.principalAmount,
    principalAfter: principal,
    interestDueAfter: 0,
  });

  const events: TimelineEvent[] = [];

  for (const p of payments) {
    if (p.loanId !== loan.id) continue;
    if (isAfter(p.paymentDate, asOf)) continue;
    if (isBefore(p.paymentDate, loan.loanDate)) continue;
    events.push({ date: p.paymentDate, rank: 0, kind: 'PAYMENT', payment: p });
  }

  for (const t of loan.topUps || []) {
    if (isAfter(t.topUpDate, asOf)) continue;
    if (isBefore(t.topUpDate, loan.loanDate)) continue;
    events.push({ date: t.topUpDate, rank: 1, kind: 'TOPUP', topUp: t });
  }

  if (options.allowCapitalisation) {
    for (const d of capitalizationDates(loan, policy, asOf)) {
      events.push({ date: d, rank: 2, kind: 'CAPITALIZE' });
    }
  }

  events.sort((a, b) => {
    const diff = daysBetween(b.date, a.date);
    if (diff !== 0) return diff > 0 ? 1 : -1;
    return a.rank - b.rank;
  });

  const accrueUntil = (target: string, isFinalSegment: boolean) => {
    if (daysBetween(cursor, target) <= 0) return;
    const interest = accrueBetween(
      principal,
      rate,
      cursor,
      target,
      isFinalSegment ? finalMode : mode
    );
    interestDue += interest;
    totalAccrued += interest;
    cursor = target;
  };

  for (const event of events) {
    accrueUntil(event.date, false);

    if (event.kind === 'PAYMENT' && event.payment) {
      const p = event.payment;
      interestDue = Math.max(0, interestDue - (p.interestPaid || 0) - (p.discountWaived || 0));
      principal = Math.max(0, principal - (p.principalPaid || 0));
      push({
        date: p.paymentDate,
        kind: 'PAYMENT',
        label: `${p.receiptNo} · ${p.paymentType.replace(/_/g, ' ')}`,
        amount: p.totalAmount,
        principalAfter: principal,
        interestDueAfter: interestDue,
      });
    } else if (event.kind === 'TOPUP' && event.topUp) {
      const t = event.topUp;
      principal += t.amount;
      if (t.newMonthlyRate && t.newMonthlyRate > 0) rate = t.newMonthlyRate;
      push({
        date: t.topUpDate,
        kind: 'TOPUP',
        label: `${t.voucherNo} · Additional money given`,
        amount: t.amount,
        principalAfter: principal,
        interestDueAfter: interestDue,
      });
    } else if (event.kind === 'CAPITALIZE') {
      if (interestDue > 0) {
        principal += interestDue;
        capitalized += interestDue;
        push({
          date: event.date,
          kind: 'CAPITALIZE',
          label: 'Interest added to principal (compounded)',
          amount: interestDue,
          principalAfter: principal,
          interestDueAfter: 0,
        });
        interestDue = 0;
      }
      capitalizations += 1;
    }
  }

  accrueUntil(asOf, true);

  push({
    date: asOf,
    kind: 'ACCRUAL',
    label: 'Interest accrued to date',
    amount: interestDue,
    principalAfter: principal,
    interestDueAfter: interestDue,
  });

  return {
    principal,
    interestDue,
    totalAccrued,
    capitalized,
    capitalizations,
    ledger,
    currentRate: rate,
  };
}

/**
 * Full financial position of a loan on a given date.
 * `payments` may be the whole store's payment list — it is filtered here.
 */
export function calculateLoan(
  loan: GirviLoan,
  payments: PaymentRecord[] = [],
  policy: CompoundPolicy = DEFAULT_COMPOUND_POLICY,
  asOfDate?: string
): LoanBreakdown {
  const asOfRaw = asOfDate || todayString();
  const asOf = isBefore(asOfRaw, loan.loanDate) ? loan.loanDate : asOfRaw;

  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const topUpTotal = (loan.topUps || []).reduce(
    (sum, t) => (isAfter(t.topUpDate, asOf) ? sum : sum + t.amount),
    0
  );

  const totalInterestPaid = loanPayments
    .filter((p) => !isAfter(p.paymentDate, asOf))
    .reduce((sum, p) => sum + (p.interestPaid || 0), 0);
  const totalPrincipalPaid = loanPayments
    .filter((p) => !isAfter(p.paymentDate, asOf))
    .reduce((sum, p) => sum + (p.principalPaid || 0), 0);
  const totalDiscountWaived = loanPayments
    .filter((p) => !isAfter(p.paymentDate, asOf))
    .reduce((sum, p) => sum + (p.discountWaived || 0), 0);

  // Matches runTimeline's billing clock: the pledge day itself counts as day one.
  const daysElapsed = Math.max(1, daysBetween(loan.loanDate, asOf) + 1);
  const monthsElapsed = Math.floor(daysElapsed / 30);
  const remainingDays = daysElapsed % 30;
  const monthsDisplay =
    monthsElapsed > 0
      ? `${monthsElapsed} mo${remainingDays > 0 ? ` ${remainingDays} d` : ''}`
      : `${daysElapsed} days`;

  const conversionDate = getConversionDate(loan, policy);
  const autoConverted = !!conversionDate && !isAfter(conversionDate, asOf);
  const effectiveInterestType: InterestType = autoConverted
    ? policy.frequency === 'MONTHLY'
      ? 'MONTHLY_COMPOUND'
      : policy.frequency === 'QUARTERLY'
      ? 'QUARTERLY_COMPOUND'
      : 'ANNUAL_COMPOUND'
    : loan.interestType;

  if (loan.status === 'CLOSED') {
    return {
      asOfDate: asOf,
      daysElapsed,
      monthsElapsed,
      remainingDays,
      monthsDisplay: 'Settled / Closed',
      totalDisbursed: loan.principalAmount + topUpTotal,
      topUpTotal,
      principalBalance: 0,
      capitalizedInterest: 0,
      totalAccruedInterest: totalInterestPaid,
      totalInterestPaid,
      totalPrincipalPaid,
      totalDiscountWaived,
      unpaidInterest: 0,
      totalSettlementAmount: 0,
      isOverdue: false,
      daysToDue: null,
      effectiveInterestType,
      isCompounded: isCompoundType(effectiveInterestType),
      autoConverted,
      conversionDate,
      compoundingLabel: getInterestTypeLabel(effectiveInterestType).frequencyDesc,
      compoundedPeriods: 0,
      simpleInterestComparison: totalInterestPaid,
      compoundExtraInterest: 0,
      currentMonthlyRate: loan.monthlyInterestRate,
      ledger: [],
    };
  }

  const actual = runTimeline(loan, loanPayments, policy, asOf, {
    allowCapitalisation: true,
    buildLedger: true,
  });

  const simple = runTimeline(loan, loanPayments, policy, asOf, {
    allowCapitalisation: false,
    buildLedger: false,
  });

  const principalBalance = round2(actual.principal);
  const unpaidInterest = round2(Math.max(0, actual.interestDue));
  const totalAccruedInterest = round2(actual.totalAccrued);
  const simpleComparison = round2(simple.totalAccrued);

  let isOverdue = false;
  let daysToDue: number | null = null;
  if (loan.dueDate) {
    const graceEnd = loan.gracePeriodDays
      ? addDays(loan.dueDate, loan.gracePeriodDays)
      : loan.dueDate;
    daysToDue = daysBetween(asOf, loan.dueDate);
    isOverdue = isAfter(asOf, graceEnd);
  } else {
    isOverdue = daysElapsed > 365;
  }

  return {
    asOfDate: asOf,
    daysElapsed,
    monthsElapsed,
    remainingDays,
    monthsDisplay,

    totalDisbursed: round2(loan.principalAmount + topUpTotal),
    topUpTotal: round2(topUpTotal),
    principalBalance,
    capitalizedInterest: round2(actual.capitalized),

    totalAccruedInterest,
    totalInterestPaid: round2(totalInterestPaid),
    totalPrincipalPaid: round2(totalPrincipalPaid),
    totalDiscountWaived: round2(totalDiscountWaived),
    unpaidInterest,
    totalSettlementAmount: round2(principalBalance + unpaidInterest),

    isOverdue,
    daysToDue,

    effectiveInterestType,
    isCompounded: isCompoundType(effectiveInterestType),
    autoConverted,
    conversionDate,
    compoundingLabel: getInterestTypeLabel(effectiveInterestType).frequencyDesc,
    compoundedPeriods: actual.capitalizations,

    simpleInterestComparison: simpleComparison,
    compoundExtraInterest: round2(Math.max(0, totalAccruedInterest - simpleComparison)),

    currentMonthlyRate: actual.currentRate,
    ledger: actual.ledger,
  };
}

/** Same loan, a different date — used by the settlement projector. */
export function projectSettlement(
  loan: GirviLoan,
  payments: PaymentRecord[],
  policy: CompoundPolicy,
  onDate: string
): LoanBreakdown {
  return calculateLoan(loan, payments, policy, onDate);
}

/**
 * Standalone what-if used by the interest calculator screen (no loan record).
 */
export function simulateInterest(params: {
  principal: number;
  monthlyRatePct: number;
  fromDate: string;
  toDate: string;
  interestType: InterestType;
  policy?: CompoundPolicy;
  autoConvert?: boolean;
}): LoanBreakdown {
  const {
    principal,
    monthlyRatePct,
    fromDate,
    toDate,
    interestType,
    policy = DEFAULT_COMPOUND_POLICY,
    autoConvert,
  } = params;

  const pseudoLoan: GirviLoan = {
    id: 'simulation',
    storeId: 'simulation',
    customerId: 'simulation',
    loanNo: 'SIM',
    loanDate: fromDate,
    dueDate: null,
    principalAmount: principal,
    monthlyInterestRate: monthlyRatePct,
    interestType,
    autoCompoundOverride: autoConvert === undefined ? null : autoConvert,
    gracePeriodDays: 0,
    vaultPouchNo: '',
    status: 'ACTIVE',
    createdAt: fromDate,
    updatedAt: fromDate,
    items: [],
    topUps: [],
  };

  return calculateLoan(pseudoLoan, [], policy, toDate);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
