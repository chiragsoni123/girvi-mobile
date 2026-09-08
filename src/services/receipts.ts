/**
 * Printable documents — pledge agreement, payment receipt and top-up voucher.
 * Rendered as HTML and handed to expo-print, which produces a PDF the shop can
 * print over Wi-Fi or share on WhatsApp.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Customer, GirviLoan, LoanTopUp, PaymentRecord, Store } from '../types/girvi';
import { formatCurrency, formatDate, formatGrams } from '../utils/format';
import { LoanBreakdown, getInterestTypeLabel } from '../utils/interest';

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function shell(store: Store, title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, 'Helvetica Neue', sans-serif; color: #1c1917;
         padding: 26px; font-size: 12px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #1c1917; padding-bottom: 12px; margin-bottom: 16px; }
  .shop { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; }
  .muted { color: #78716c; font-size: 10.5px; }
  .doc { text-align: right; }
  .doc .kind { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #57534e;
       margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e7e5e4; font-size: 11px; }
  th { background: #fafaf9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px;
       color: #57534e; }
  td.num, th.num { text-align: right; }
  .grid { display: flex; gap: 10px; flex-wrap: wrap; }
  .box { flex: 1; min-width: 150px; border: 1px solid #e7e5e4; border-radius: 8px; padding: 9px 11px; }
  .box .label { font-size: 9.5px; text-transform: uppercase; color: #78716c; letter-spacing: 0.4px; }
  .box .value { font-size: 15px; font-weight: 800; margin-top: 2px; }
  .total { background: #1c1917; color: #fff; border-radius: 8px; padding: 12px 14px;
           display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
  .total .value { font-size: 20px; font-weight: 800; }
  .terms { margin-top: 18px; font-size: 9.5px; color: #57534e; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-between; margin-top: 46px; }
  .sign div { width: 42%; border-top: 1px solid #1c1917; padding-top: 5px; font-size: 10px;
              text-align: center; color: #57534e; }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="shop">${escapeHtml(store.shopName)}</div>
      <div class="muted">${escapeHtml(store.tagline)}</div>
      <div class="muted">${escapeHtml(store.address)}${store.city ? `, ${escapeHtml(store.city)}` : ''} ${escapeHtml(store.pincode)}</div>
      <div class="muted">${escapeHtml(store.phone)}${store.email ? ` · ${escapeHtml(store.email)}` : ''}</div>
      ${store.licenseNumber ? `<div class="muted">Licence: ${escapeHtml(store.licenseNumber)}</div>` : ''}
    </div>
    <div class="doc">
      <div class="kind">${escapeHtml(title)}</div>
      <div class="muted">Printed ${formatDate(new Date().toISOString())}</div>
    </div>
  </div>
  ${body}
</body></html>`;
}

function customerBlock(customer?: Customer): string {
  if (!customer) return '';
  return `<h2>Borrower</h2>
  <div class="grid">
    <div class="box">
      <div class="label">Name</div>
      <div class="value" style="font-size:13px">${escapeHtml(customer.fullName)}</div>
      <div class="muted">${escapeHtml(customer.relationType)} ${escapeHtml(customer.relativeName)}</div>
    </div>
    <div class="box">
      <div class="label">Contact</div>
      <div class="value" style="font-size:13px">${escapeHtml(customer.phone)}</div>
      <div class="muted">${escapeHtml(customer.address)}${customer.city ? `, ${escapeHtml(customer.city)}` : ''}</div>
    </div>
    <div class="box">
      <div class="label">KYC</div>
      <div class="value" style="font-size:13px">${escapeHtml(customer.idProofType)}</div>
      <div class="muted">${escapeHtml(customer.idProofNumber || '—')} · ${escapeHtml(customer.customerCode)}</div>
    </div>
  </div>`;
}

export function pledgeAgreementHtml(params: {
  store: Store;
  loan: GirviLoan;
  customer?: Customer;
  breakdown: LoanBreakdown;
}): string {
  const { store, loan, customer, breakdown } = params;
  const currency = store.currencySymbol;
  const typeInfo = getInterestTypeLabel(breakdown.effectiveInterestType);

  const items = loan.items
    .map(
      (item, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.itemName)}<div class="muted">${escapeHtml(item.itemDescription || '')}</div></td>
        <td>${escapeHtml(item.metalType)} · ${escapeHtml(item.purity)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatGrams(item.grossWeight)}</td>
        <td class="num">${formatGrams(item.netWeight)}</td>
        <td class="num">${formatCurrency(item.estimatedValue, currency)}</td>
      </tr>`
    )
    .join('');

  const topUps = loan.topUps.length
    ? `<h2>Additional money given on this pledge</h2>
       <table><thead><tr><th>Voucher</th><th>Date</th><th>Mode</th><th class="num">Amount</th></tr></thead>
       <tbody>${loan.topUps
         .map(
           (t) => `<tr><td>${escapeHtml(t.voucherNo)}</td><td>${formatDate(t.topUpDate)}</td>
             <td>${escapeHtml(t.paymentMode)}</td>
             <td class="num">${formatCurrency(t.amount, currency)}</td></tr>`
         )
         .join('')}</tbody></table>`
    : '';

  const body = `
    <div class="grid">
      <div class="box"><div class="label">Pledge / Loan No</div><div class="value">${escapeHtml(loan.loanNo)}</div></div>
      <div class="box"><div class="label">Pledge date</div><div class="value" style="font-size:13px">${formatDate(loan.loanDate)}</div></div>
      <div class="box"><div class="label">Vault pouch</div><div class="value" style="font-size:13px">${escapeHtml(loan.vaultPouchNo || '—')}</div></div>
    </div>
    ${customerBlock(customer)}

    <h2>Pledged ornaments</h2>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Metal / purity</th><th class="num">Qty</th>
      <th class="num">Gross</th><th class="num">Net</th><th class="num">Valuation</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    ${topUps}

    <h2>Loan terms</h2>
    <div class="grid">
      <div class="box"><div class="label">Amount financed</div><div class="value">${formatCurrency(breakdown.totalDisbursed, currency)}</div></div>
      <div class="box"><div class="label">Interest rate</div><div class="value">${loan.monthlyInterestRate}% p.m.</div>
        <div class="muted">${escapeHtml(typeInfo.name)} — ${escapeHtml(typeInfo.frequencyDesc)}</div></div>
      <div class="box"><div class="label">Due date</div><div class="value" style="font-size:13px">${formatDate(loan.dueDate)}</div>
        <div class="muted">Grace ${loan.gracePeriodDays} days</div></div>
    </div>

    ${
      breakdown.conversionDate
        ? `<div class="terms"><strong>Note:</strong> if this pledge remains unredeemed beyond ${formatDate(
            breakdown.conversionDate
          )}, interest on the entire loan will be recomputed on a compound basis from the pledge date shown above.</div>`
        : ''
    }

    <div class="total">
      <div>Amount payable today (principal + interest)</div>
      <div class="value">${formatCurrency(breakdown.totalSettlementAmount, currency)}</div>
    </div>

    ${store.termsAndConditions ? `<div class="terms">${escapeHtml(store.termsAndConditions)}</div>` : ''}

    <div class="sign"><div>Borrower's signature</div><div>For ${escapeHtml(store.shopName)}</div></div>`;

  return shell(store, 'Pledge Agreement', body);
}

export function paymentReceiptHtml(params: {
  store: Store;
  loan: GirviLoan;
  customer?: Customer;
  payment: PaymentRecord;
  breakdown: LoanBreakdown;
}): string {
  const { store, loan, customer, payment, breakdown } = params;
  const currency = store.currencySymbol;

  const body = `
    <div class="grid">
      <div class="box"><div class="label">Receipt No</div><div class="value">${escapeHtml(payment.receiptNo)}</div></div>
      <div class="box"><div class="label">Against pledge</div><div class="value" style="font-size:13px">${escapeHtml(loan.loanNo)}</div></div>
      <div class="box"><div class="label">Date</div><div class="value" style="font-size:13px">${formatDate(payment.paymentDate)}</div>
        <div class="muted">${escapeHtml(payment.paymentMode.replace(/_/g, ' '))}</div></div>
    </div>
    ${customerBlock(customer)}

    <h2>Payment breakup</h2>
    <table>
      <tbody>
        <tr><td>Interest paid</td><td class="num">${formatCurrency(payment.interestPaid, currency)}</td></tr>
        <tr><td>Principal repaid</td><td class="num">${formatCurrency(payment.principalPaid, currency)}</td></tr>
        ${
          payment.discountWaived > 0
            ? `<tr><td>Discount / waiver</td><td class="num">- ${formatCurrency(payment.discountWaived, currency)}</td></tr>`
            : ''
        }
        <tr><td><strong>Total received</strong></td><td class="num"><strong>${formatCurrency(payment.totalAmount, currency)}</strong></td></tr>
      </tbody>
    </table>

    <h2>Position after this payment</h2>
    <div class="grid">
      <div class="box"><div class="label">Principal outstanding</div><div class="value">${formatCurrency(breakdown.principalBalance, currency)}</div></div>
      <div class="box"><div class="label">Interest pending</div><div class="value">${formatCurrency(breakdown.unpaidInterest, currency)}</div></div>
      <div class="box"><div class="label">Full settlement today</div><div class="value">${formatCurrency(breakdown.totalSettlementAmount, currency)}</div></div>
    </div>

    ${payment.notes ? `<div class="terms">Remarks: ${escapeHtml(payment.notes)}</div>` : ''}
    ${
      loan.status === 'CLOSED'
        ? `<div class="total"><div>Pledge fully settled — ornaments released</div><div class="value">CLOSED</div></div>`
        : ''
    }

    <div class="sign"><div>Borrower's signature</div><div>For ${escapeHtml(store.shopName)}</div></div>`;

  return shell(store, 'Payment Receipt', body);
}

export function topUpVoucherHtml(params: {
  store: Store;
  loan: GirviLoan;
  customer?: Customer;
  topUp: LoanTopUp;
  breakdown: LoanBreakdown;
}): string {
  const { store, loan, customer, topUp, breakdown } = params;
  const currency = store.currencySymbol;

  const body = `
    <div class="grid">
      <div class="box"><div class="label">Voucher No</div><div class="value">${escapeHtml(topUp.voucherNo)}</div></div>
      <div class="box"><div class="label">Against pledge</div><div class="value" style="font-size:13px">${escapeHtml(loan.loanNo)}</div></div>
      <div class="box"><div class="label">Date</div><div class="value" style="font-size:13px">${formatDate(topUp.topUpDate)}</div>
        <div class="muted">${escapeHtml(topUp.paymentMode.replace(/_/g, ' '))}</div></div>
    </div>
    ${customerBlock(customer)}

    <div class="total">
      <div>Additional amount given today</div>
      <div class="value">${formatCurrency(topUp.amount, currency)}</div>
    </div>

    <h2>Revised position</h2>
    <div class="grid">
      <div class="box"><div class="label">Total financed</div><div class="value">${formatCurrency(breakdown.totalDisbursed, currency)}</div></div>
      <div class="box"><div class="label">Principal outstanding</div><div class="value">${formatCurrency(breakdown.principalBalance, currency)}</div></div>
      <div class="box"><div class="label">Interest rate</div><div class="value">${breakdown.currentMonthlyRate}% p.m.</div></div>
    </div>

    ${topUp.notes ? `<div class="terms">Remarks: ${escapeHtml(topUp.notes)}</div>` : ''}
    <div class="terms">The ornaments already held against pledge ${escapeHtml(
      loan.loanNo
    )} continue to secure this additional amount on the same terms.</div>

    <div class="sign"><div>Borrower's signature</div><div>For ${escapeHtml(store.shopName)}</div></div>`;

  return shell(store, 'Additional Loan Voucher', body);
}

/** Opens the Android print dialog. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/** Saves a PDF and opens the share sheet (WhatsApp, Drive, mail…). */
export async function sharePdf(html: string, filename: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
  }
}
