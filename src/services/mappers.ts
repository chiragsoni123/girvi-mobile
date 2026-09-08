/**
 * snake_case (Postgres) <-> camelCase (app) translation.
 * Keeping this in one place means the screens never touch raw rows.
 */

import {
  AccentColor,
  CompoundFrequency,
  Customer,
  GirviLoan,
  InterestType,
  LoanStatus,
  LoanTopUp,
  MemberRole,
  MetalType,
  PawnItem,
  PaymentMode,
  PaymentRecord,
  PaymentType,
  Store,
  StoreMember,
} from '../types/girvi';

type Row = Record<string, any>;

const num = (value: any, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const day = (value: any): string => (value ? String(value).slice(0, 10) : '');

export function mapStore(row: Row): Store {
  return {
    id: row.id,
    storeCode: row.store_code,
    shopName: row.shop_name ?? '',
    tagline: row.tagline ?? '',
    proprietorName: row.proprietor_name ?? '',
    phone: row.phone ?? '',
    alternatePhone: row.alternate_phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    pincode: row.pincode ?? '',
    gstNumber: row.gst_number ?? '',
    licenseNumber: row.license_number ?? '',
    currencySymbol: row.currency_symbol ?? '₹',
    defaultMonthlyRate: num(row.default_monthly_rate, 2),
    defaultGracePeriodDays: num(row.default_grace_period_days, 7),
    defaultInterestType: (row.default_interest_type ?? 'DAILY_PRO_RATA') as InterestType,
    autoCompoundEnabled: row.auto_compound_enabled ?? true,
    autoCompoundAfterMonths: num(row.auto_compound_after_months, 24),
    autoCompoundFrequency: (row.auto_compound_frequency ?? 'ANNUAL') as CompoundFrequency,
    loanPrefix: row.loan_prefix ?? 'G-',
    receiptPrefix: row.receipt_prefix ?? 'REC-',
    customerPrefix: row.customer_prefix ?? 'CUST-',
    termsAndConditions: row.terms_and_conditions ?? '',
    accentColor: (row.accent_color ?? 'gold') as AccentColor,
    autoLockMinutes: num(row.auto_lock_minutes, 5),
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

export function storeToRow(store: Partial<Store>): Row {
  const row: Row = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  set('shop_name', store.shopName);
  set('tagline', store.tagline);
  set('proprietor_name', store.proprietorName);
  set('phone', store.phone);
  set('alternate_phone', store.alternatePhone);
  set('email', store.email);
  set('address', store.address);
  set('city', store.city);
  set('state', store.state);
  set('pincode', store.pincode);
  set('gst_number', store.gstNumber);
  set('license_number', store.licenseNumber);
  set('currency_symbol', store.currencySymbol);
  set('default_monthly_rate', store.defaultMonthlyRate);
  set('default_grace_period_days', store.defaultGracePeriodDays);
  set('default_interest_type', store.defaultInterestType);
  set('auto_compound_enabled', store.autoCompoundEnabled);
  set('auto_compound_after_months', store.autoCompoundAfterMonths);
  set('auto_compound_frequency', store.autoCompoundFrequency);
  set('loan_prefix', store.loanPrefix);
  set('receipt_prefix', store.receiptPrefix);
  set('customer_prefix', store.customerPrefix);
  set('terms_and_conditions', store.termsAndConditions);
  set('accent_color', store.accentColor);
  set('auto_lock_minutes', store.autoLockMinutes);
  return row;
}

export function mapMember(row: Row): StoreMember {
  return {
    storeId: row.store_id,
    userId: row.user_id,
    fullName: row.full_name ?? '',
    email: row.email ?? '',
    role: (row.role ?? 'STAFF') as MemberRole,
    status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
    createdAt: row.created_at ?? '',
  };
}

export function mapCustomer(row: Row): Customer {
  return {
    id: row.id,
    storeId: row.store_id,
    customerCode: row.customer_code ?? '',
    fullName: row.full_name ?? '',
    relativeName: row.relative_name ?? '',
    relationType: (row.relation_type ?? 'S/O') as Customer['relationType'],
    phone: row.phone ?? '',
    alternatePhone: row.alternate_phone ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    pincode: row.pincode ?? '',
    idProofType: (row.id_proof_type ?? 'Aadhar Card') as Customer['idProofType'],
    idProofNumber: row.id_proof_number ?? '',
    photoUrl: row.photo_url ?? null,
    idProofPhotoUrl: row.id_proof_photo_url ?? null,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

export function customerToRow(customer: Partial<Customer>): Row {
  const row: Row = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  set('store_id', customer.storeId);
  set('customer_code', customer.customerCode);
  set('full_name', customer.fullName);
  set('relative_name', customer.relativeName);
  set('relation_type', customer.relationType);
  set('phone', customer.phone);
  set('alternate_phone', customer.alternatePhone);
  set('address', customer.address);
  set('city', customer.city);
  set('pincode', customer.pincode);
  set('id_proof_type', customer.idProofType);
  set('id_proof_number', customer.idProofNumber);
  set('photo_url', customer.photoUrl);
  set('id_proof_photo_url', customer.idProofPhotoUrl);
  set('notes', customer.notes);
  return row;
}

export function mapItem(row: Row): PawnItem {
  return {
    id: row.id,
    loanId: row.loan_id,
    itemName: row.item_name ?? '',
    metalType: (row.metal_type ?? 'GOLD') as MetalType,
    purity: row.purity ?? '',
    quantity: num(row.quantity, 1),
    grossWeight: num(row.gross_weight),
    netWeight: num(row.net_weight),
    valuationRatePerGram: num(row.valuation_rate_per_gram),
    estimatedValue: num(row.estimated_value),
    photos: Array.isArray(row.photos) ? row.photos : [],
    itemLockerLocation: row.item_locker_location ?? '',
    itemDescription: row.item_description ?? '',
    addedWithTopupId: row.added_with_topup_id ?? null,
  };
}

export function itemToRow(item: Partial<PawnItem>, storeId: string, loanId: string): Row {
  return {
    store_id: storeId,
    loan_id: loanId,
    item_name: item.itemName ?? '',
    metal_type: item.metalType ?? 'GOLD',
    purity: item.purity ?? '',
    quantity: item.quantity ?? 1,
    gross_weight: item.grossWeight ?? 0,
    net_weight: item.netWeight ?? 0,
    valuation_rate_per_gram: item.valuationRatePerGram ?? 0,
    estimated_value: item.estimatedValue ?? 0,
    photos: item.photos ?? [],
    item_locker_location: item.itemLockerLocation ?? '',
    item_description: item.itemDescription ?? '',
    added_with_topup_id: item.addedWithTopupId ?? null,
  };
}

export function mapTopUp(row: Row): LoanTopUp {
  return {
    id: row.id,
    storeId: row.store_id,
    loanId: row.loan_id,
    voucherNo: row.voucher_no ?? '',
    topUpDate: day(row.topup_date),
    amount: num(row.amount),
    paymentMode: (row.payment_mode ?? 'CASH') as PaymentMode,
    newMonthlyRate: row.new_monthly_rate === null ? null : num(row.new_monthly_rate),
    notes: row.notes ?? '',
    createdAt: row.created_at ?? '',
  };
}

export function mapLoan(row: Row): GirviLoan {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id,
    loanNo: row.loan_no ?? '',
    loanDate: day(row.loan_date),
    dueDate: row.due_date ? day(row.due_date) : null,
    principalAmount: num(row.principal_amount),
    monthlyInterestRate: num(row.monthly_interest_rate, 2),
    interestType: (row.interest_type ?? 'DAILY_PRO_RATA') as InterestType,
    autoCompoundOverride:
      row.auto_compound_override === null || row.auto_compound_override === undefined
        ? null
        : Boolean(row.auto_compound_override),
    gracePeriodDays: num(row.grace_period_days),
    vaultPouchNo: row.vault_pouch_no ?? '',
    status: (row.status ?? 'ACTIVE') as LoanStatus,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    closedAt: row.closed_at ?? null,
    items: Array.isArray(row.loan_items) ? row.loan_items.map(mapItem) : [],
    topUps: Array.isArray(row.loan_topups)
      ? row.loan_topups.map(mapTopUp).sort((a, b) => a.topUpDate.localeCompare(b.topUpDate))
      : [],
  };
}

export function loanToRow(loan: Partial<GirviLoan>): Row {
  const row: Row = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  set('store_id', loan.storeId);
  set('customer_id', loan.customerId);
  set('loan_no', loan.loanNo);
  set('loan_date', loan.loanDate);
  set('due_date', loan.dueDate ?? null);
  set('principal_amount', loan.principalAmount);
  set('monthly_interest_rate', loan.monthlyInterestRate);
  set('interest_type', loan.interestType);
  set('auto_compound_override', loan.autoCompoundOverride);
  set('grace_period_days', loan.gracePeriodDays);
  set('vault_pouch_no', loan.vaultPouchNo);
  set('status', loan.status);
  set('notes', loan.notes);
  set('closed_at', loan.closedAt ?? null);
  return row;
}

export function mapPayment(row: Row): PaymentRecord {
  return {
    id: row.id,
    storeId: row.store_id,
    loanId: row.loan_id,
    customerId: row.customer_id,
    receiptNo: row.receipt_no ?? '',
    paymentDate: day(row.payment_date),
    totalAmount: num(row.total_amount),
    interestPaid: num(row.interest_paid),
    principalPaid: num(row.principal_paid),
    discountWaived: num(row.discount_waived),
    previousPrincipal: num(row.previous_principal),
    remainingPrincipal: num(row.remaining_principal),
    paymentType: (row.payment_type ?? 'INTEREST_ONLY') as PaymentType,
    paymentMode: (row.payment_mode ?? 'CASH') as PaymentMode,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? '',
  };
}

export function paymentToRow(payment: Partial<PaymentRecord>): Row {
  return {
    store_id: payment.storeId,
    loan_id: payment.loanId,
    customer_id: payment.customerId,
    receipt_no: payment.receiptNo,
    payment_date: payment.paymentDate,
    total_amount: payment.totalAmount ?? 0,
    interest_paid: payment.interestPaid ?? 0,
    principal_paid: payment.principalPaid ?? 0,
    discount_waived: payment.discountWaived ?? 0,
    previous_principal: payment.previousPrincipal ?? 0,
    remaining_principal: payment.remainingPrincipal ?? 0,
    payment_type: payment.paymentType ?? 'INTEREST_ONLY',
    payment_mode: payment.paymentMode ?? 'CASH',
    notes: payment.notes ?? '',
  };
}
