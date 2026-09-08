/**
 * Every database call the app makes. Screens talk to this module only.
 * RLS on the server is what actually enforces store isolation — the
 * `store_id` filters here are for correctness and speed, not security.
 */

import { supabase } from '../lib/supabase';
import {
  Customer,
  GirviLoan,
  LoanTopUp,
  PawnItem,
  PaymentMode,
  PaymentRecord,
  Store,
  StoreMember,
} from '../types/girvi';
import {
  customerToRow,
  itemToRow,
  loanToRow,
  mapCustomer,
  mapLoan,
  mapMember,
  mapPayment,
  mapStore,
  mapTopUp,
  paymentToRow,
  storeToRow,
} from './mappers';

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Stores & membership
// ---------------------------------------------------------------------------

export interface MembershipWithStore {
  member: StoreMember;
  store: Store;
}

export async function fetchMemberships(): Promise<MembershipWithStore[]> {
  const result = await supabase
    .from('store_members')
    .select('*, stores(*)')
    .eq('status', 'ACTIVE');
  const rows = unwrap(result) ?? [];
  return rows
    .filter((row: any) => row.stores)
    .map((row: any) => ({ member: mapMember(row), store: mapStore(row.stores) }));
}

export async function createStore(params: {
  shopName: string;
  proprietorName?: string;
  phone?: string;
  city?: string;
}): Promise<Store> {
  const result = await supabase.rpc('create_store', {
    p_shop_name: params.shopName,
    p_proprietor_name: params.proprietorName ?? '',
    p_phone: params.phone ?? '',
    p_city: params.city ?? '',
  });
  return mapStore(unwrap(result));
}

export async function joinStore(storeCode: string, fullName = ''): Promise<Store> {
  const result = await supabase.rpc('join_store', {
    p_store_code: storeCode.trim().toUpperCase(),
    p_full_name: fullName,
  });
  return mapStore(unwrap(result));
}

export async function updateStore(storeId: string, patch: Partial<Store>): Promise<Store> {
  const result = await supabase
    .from('stores')
    .update(storeToRow(patch))
    .eq('id', storeId)
    .select('*')
    .single();
  return mapStore(unwrap(result));
}

export async function fetchStoreMembers(storeId: string): Promise<StoreMember[]> {
  const result = await supabase.from('store_members').select('*').eq('store_id', storeId);
  return (unwrap(result) ?? []).map(mapMember);
}

// ---------------------------------------------------------------------------
// Document numbering (server-side so two phones cannot collide)
// ---------------------------------------------------------------------------

export async function nextDocumentNo(
  storeId: string,
  kind: 'LOAN' | 'RECEIPT' | 'TOPUP'
): Promise<string> {
  const result = await supabase.rpc('next_document_no', { p_store_id: storeId, p_kind: kind });
  return unwrap(result) as unknown as string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function fetchCustomers(storeId: string): Promise<Customer[]> {
  const result = await supabase
    .from('customers')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });
  return (unwrap(result) ?? []).map(mapCustomer);
}

export async function createCustomer(customer: Partial<Customer>): Promise<Customer> {
  const result = await supabase
    .from('customers')
    .insert(customerToRow(customer))
    .select('*')
    .single();
  return mapCustomer(unwrap(result));
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer> {
  const result = await supabase
    .from('customers')
    .update(customerToRow(patch))
    .eq('id', id)
    .select('*')
    .single();
  return mapCustomer(unwrap(result));
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

export async function nextCustomerCode(storeId: string, prefix: string): Promise<string> {
  const result = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);
  if (result.error) throw result.error;
  const count = result.count ?? 0;
  return `${prefix}${String(count + 101).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

const LOAN_SELECT = '*, loan_items(*), loan_topups(*)';

export async function fetchLoans(storeId: string): Promise<GirviLoan[]> {
  const result = await supabase
    .from('loans')
    .select(LOAN_SELECT)
    .eq('store_id', storeId)
    .order('loan_date', { ascending: false });
  return (unwrap(result) ?? []).map(mapLoan);
}

export async function fetchLoan(loanId: string): Promise<GirviLoan> {
  const result = await supabase.from('loans').select(LOAN_SELECT).eq('id', loanId).single();
  return mapLoan(unwrap(result));
}

export async function createLoan(
  loan: Partial<GirviLoan>,
  items: Partial<PawnItem>[]
): Promise<GirviLoan> {
  const inserted = await supabase.from('loans').insert(loanToRow(loan)).select('id').single();
  if (inserted.error) throw inserted.error;
  const loanId = (inserted.data as any).id as string;

  if (items.length > 0) {
    const { error } = await supabase
      .from('loan_items')
      .insert(items.map((item) => itemToRow(item, loan.storeId as string, loanId)));
    if (error) {
      // Don't leave a loan with no ornaments attached.
      await supabase.from('loans').delete().eq('id', loanId);
      throw error;
    }
  }

  return fetchLoan(loanId);
}

export async function updateLoan(loanId: string, patch: Partial<GirviLoan>): Promise<GirviLoan> {
  const result = await supabase.from('loans').update(loanToRow(patch)).eq('id', loanId).select('id').single();
  if (result.error) throw result.error;
  return fetchLoan(loanId);
}

export async function deleteLoan(loanId: string): Promise<void> {
  const { error } = await supabase.from('loans').delete().eq('id', loanId);
  if (error) throw error;
}

export async function addLoanItems(
  storeId: string,
  loanId: string,
  items: Partial<PawnItem>[],
  topUpId?: string
): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase
    .from('loan_items')
    .insert(
      items.map((item) => itemToRow({ ...item, addedWithTopupId: topUpId ?? null }, storeId, loanId))
    );
  if (error) throw error;
}

/** Full-row replace, not a sparse patch — callers must pass the complete item. */
export async function updateLoanItem(
  itemId: string,
  storeId: string,
  loanId: string,
  item: Partial<PawnItem>
): Promise<void> {
  const { error } = await supabase.from('loan_items').update(itemToRow(item, storeId, loanId)).eq('id', itemId);
  if (error) throw error;
}

export async function deleteLoanItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('loan_items').delete().eq('id', itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Top-ups — additional money borrowed against an existing loan
// ---------------------------------------------------------------------------

export async function createTopUp(params: {
  storeId: string;
  loanId: string;
  amount: number;
  topUpDate: string;
  paymentMode: PaymentMode;
  newMonthlyRate?: number | null;
  notes?: string;
  extraItems?: Partial<PawnItem>[];
}): Promise<LoanTopUp> {
  const voucherNo = await nextDocumentNo(params.storeId, 'TOPUP');

  const result = await supabase
    .from('loan_topups')
    .insert({
      store_id: params.storeId,
      loan_id: params.loanId,
      voucher_no: voucherNo,
      topup_date: params.topUpDate,
      amount: params.amount,
      payment_mode: params.paymentMode,
      new_monthly_rate: params.newMonthlyRate ?? null,
      notes: params.notes ?? '',
    })
    .select('*')
    .single();

  const topUp = mapTopUp(unwrap(result));

  if (params.extraItems && params.extraItems.length > 0) {
    await addLoanItems(params.storeId, params.loanId, params.extraItems, topUp.id);
  }

  // A re-priced top-up also updates the loan's headline rate, and a top-up on
  // a settled loan re-opens it.
  const loanPatch: Record<string, unknown> = { status: 'ACTIVE', closed_at: null };
  if (params.newMonthlyRate && params.newMonthlyRate > 0) {
    loanPatch.monthly_interest_rate = params.newMonthlyRate;
  }
  const { error } = await supabase.from('loans').update(loanPatch).eq('id', params.loanId);
  if (error) throw error;

  return topUp;
}

export async function updateTopUp(
  topUpId: string,
  params: {
    amount: number;
    topUpDate: string;
    paymentMode: PaymentMode;
    newMonthlyRate?: number | null;
    notes?: string;
  },
  loanId: string
): Promise<LoanTopUp> {
  const result = await supabase
    .from('loan_topups')
    .update({
      topup_date: params.topUpDate,
      amount: params.amount,
      payment_mode: params.paymentMode,
      new_monthly_rate: params.newMonthlyRate ?? null,
      notes: params.notes ?? '',
    })
    .eq('id', topUpId)
    .select('*')
    .single();
  const topUp = mapTopUp(unwrap(result));

  // Correcting a re-priced top-up should correct the loan's headline rate too.
  if (params.newMonthlyRate && params.newMonthlyRate > 0) {
    const { error } = await supabase
      .from('loans')
      .update({ monthly_interest_rate: params.newMonthlyRate })
      .eq('id', loanId);
    if (error) throw error;
  }

  return topUp;
}

export async function deleteTopUp(topUpId: string): Promise<void> {
  const { error } = await supabase.from('loan_topups').delete().eq('id', topUpId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function fetchPayments(storeId: string): Promise<PaymentRecord[]> {
  const result = await supabase
    .from('payments')
    .select('*')
    .eq('store_id', storeId)
    .order('payment_date', { ascending: false });
  return (unwrap(result) ?? []).map(mapPayment);
}

export async function createPayment(
  payment: Partial<PaymentRecord>,
  loanPatch?: Partial<GirviLoan>
): Promise<PaymentRecord> {
  const result = await supabase.from('payments').insert(paymentToRow(payment)).select('*').single();
  const saved = mapPayment(unwrap(result));

  if (loanPatch && payment.loanId) {
    const { error } = await supabase
      .from('loans')
      .update(loanToRow(loanPatch))
      .eq('id', payment.loanId);
    if (error) throw error;
  }
  return saved;
}

/** Full-row replace, not a sparse patch — callers must pass the complete payment. */
export async function updatePayment(
  paymentId: string,
  payment: Partial<PaymentRecord>,
  loanPatch?: Partial<GirviLoan>
): Promise<PaymentRecord> {
  const result = await supabase
    .from('payments')
    .update(paymentToRow(payment))
    .eq('id', paymentId)
    .select('*')
    .single();
  const saved = mapPayment(unwrap(result));

  if (loanPatch && payment.loanId) {
    const { error } = await supabase
      .from('loans')
      .update(loanToRow(loanPatch))
      .eq('id', payment.loanId);
    if (error) throw error;
  }
  return saved;
}

export async function deletePayment(paymentId: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Photo storage
// ---------------------------------------------------------------------------

const BUCKET = 'girvi-photos';

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) / 4);
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = chars.indexOf(clean[i]);
    const c1 = chars.indexOf(clean[i + 1]);
    const c2 = chars.indexOf(clean[i + 2]);
    const c3 = chars.indexOf(clean[i + 3]);
    bytes[byteIndex++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) bytes[byteIndex++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) bytes[byteIndex++] = ((c2 & 3) << 6) | c3;
  }
  return bytes.subarray(0, byteIndex);
}

/**
 * Uploads an image and returns the object path. Paths start with the store id
 * so the storage policy can check membership.
 *
 * Callers pass base64 that has already been through `compressForUpload`, so
 * what lands here is a resized JPEG rather than a multi-megabyte camera file.
 */
export async function uploadPhoto(
  storeId: string,
  base64: string,
  folder: 'items' | 'kyc'
): Promise<string> {
  const bytes = base64ToBytes(base64);

  // The bucket rejects anything over 10 MB; catching it here gives a far
  // clearer message than the storage API's own error.
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error('Payload too large: that photo is bigger than 10 MB even after compression.');
  }

  const path = `${storeId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a stored photo, cached until shortly before it expires. */
export async function getPhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('file:') || path.startsWith('data:')) return path;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 3000 * 1000 });
  return data.signedUrl;
}

export async function deletePhoto(path: string): Promise<void> {
  if (!path || path.startsWith('http')) return;
  await supabase.storage.from(BUCKET).remove([path]);
  signedUrlCache.delete(path);
}
