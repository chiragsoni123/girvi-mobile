import React, { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  AppBar,
  Button,
  Card,
  ErrorBanner,
  ErrorState,
  KeyValue,
  Loading,
  Row,
  Screen,
  SectionTitle,
  StatTile,
} from '../components/ui';
import { useData } from '../context/DataContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { printHtml, sharePdf } from '../services/receipts';
import { neutral, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCurrency, formatDate, formatGrams } from '../utils/format';
import { calculateLoan } from '../utils/interest';

export const ReportsScreen: React.FC = () => {
  const { accent } = useAccent();
  const {
    loans,
    customers,
    payments,
    policy,
    currency,
    store,
    loading,
    refreshing,
    refresh,
    retry,
    error,
    isEmptyFailure,
    isStale,
  } = useData();

  const report = useMemo(() => {
    const rows = loans.map((loan) => ({
      loan,
      breakdown: calculateLoan(loan, payments, policy),
      customer: customers.find((c) => c.id === loan.customerId),
    }));

    const active = rows.filter(({ loan }) => loan.status !== 'CLOSED');
    const closed = rows.filter(({ loan }) => loan.status === 'CLOSED');

    const goldNet = active.reduce(
      (sum, { loan }) =>
        sum +
        loan.items
          .filter((i) => i.metalType === 'GOLD' || i.metalType === 'DIAMOND_GOLD')
          .reduce((s, i) => s + i.netWeight, 0),
      0
    );
    const silverNet = active.reduce(
      (sum, { loan }) =>
        sum + loan.items.filter((i) => i.metalType === 'SILVER').reduce((s, i) => s + i.netWeight, 0),
      0
    );

    const principalOut = active.reduce((sum, r) => sum + r.breakdown.principalBalance, 0);
    const interestPending = active.reduce((sum, r) => sum + r.breakdown.unpaidInterest, 0);
    const collateralValue = active.reduce(
      (sum, { loan }) => sum + loan.items.reduce((s, i) => s + i.estimatedValue, 0),
      0
    );

    const interestEarned = payments.reduce((sum, p) => sum + p.interestPaid, 0);
    const principalBack = payments.reduce((sum, p) => sum + p.principalPaid, 0);
    const waived = payments.reduce((sum, p) => sum + p.discountWaived, 0);
    const topUpTotal = loans.reduce(
      (sum, loan) => sum + loan.topUps.reduce((s, t) => s + t.amount, 0),
      0
    );

    const overdue = active.filter((r) => r.breakdown.isOverdue);
    const compounded = active.filter((r) => r.breakdown.autoConverted);

    const byMonth = new Map<string, number>();
    payments.forEach((p) => {
      const key = p.paymentDate.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + p.totalAmount);
    });
    const recentMonths = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

    return {
      rows,
      active,
      closed,
      goldNet,
      silverNet,
      principalOut,
      interestPending,
      collateralValue,
      interestEarned,
      principalBack,
      waived,
      topUpTotal,
      overdue,
      compounded,
      recentMonths,
    };
  }, [customers, loans, payments, policy]);

  const buildHtml = (): string => {
    const shopName = store?.shopName ?? 'Girvi Pawn Manager';
    const rows = report.active
      .sort((a, b) => b.breakdown.totalSettlementAmount - a.breakdown.totalSettlementAmount)
      .map(
        ({ loan, breakdown, customer }) => `<tr>
          <td>${loan.loanNo}</td>
          <td>${customer?.fullName ?? ''}<div style="color:#78716c;font-size:10px">${customer?.phone ?? ''}</div></td>
          <td>${formatDate(loan.loanDate)}</td>
          <td style="text-align:right">${formatCurrency(breakdown.totalDisbursed, currency)}</td>
          <td style="text-align:right">${formatCurrency(breakdown.principalBalance, currency)}</td>
          <td style="text-align:right">${formatCurrency(breakdown.unpaidInterest, currency)}</td>
          <td style="text-align:right"><strong>${formatCurrency(breakdown.totalSettlementAmount, currency)}</strong></td>
          <td>${breakdown.isOverdue ? 'OVERDUE' : 'ACTIVE'}${breakdown.autoConverted ? ' · COMP' : ''}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      body { font-family: -apple-system, Roboto, sans-serif; padding: 24px; font-size: 11px; color:#1c1917; }
      h1 { font-size: 18px; margin: 0; }
      .muted { color:#78716c; font-size: 10.5px; }
      table { width:100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-bottom: 1px solid #e7e5e4; padding: 6px 7px; text-align: left; }
      th { background:#fafaf9; font-size: 9.5px; text-transform: uppercase; letter-spacing:.4px; }
      .grid { display:flex; gap:8px; flex-wrap: wrap; margin-top: 12px; }
      .box { border:1px solid #e7e5e4; border-radius:8px; padding:8px 10px; min-width:140px; }
      .box .label { font-size:9px; text-transform:uppercase; color:#78716c; }
      .box .value { font-size:14px; font-weight:800; }
    </style></head><body>
      <h1>${shopName} — Girvi position report</h1>
      <div class="muted">Generated ${formatDate(new Date().toISOString())}</div>
      <div class="grid">
        <div class="box"><div class="label">Principal on the street</div><div class="value">${formatCurrency(report.principalOut, currency)}</div></div>
        <div class="box"><div class="label">Interest pending</div><div class="value">${formatCurrency(report.interestPending, currency)}</div></div>
        <div class="box"><div class="label">Collateral value</div><div class="value">${formatCurrency(report.collateralValue, currency)}</div></div>
        <div class="box"><div class="label">Gold held (net)</div><div class="value">${formatGrams(report.goldNet)}</div></div>
        <div class="box"><div class="label">Silver held (net)</div><div class="value">${formatGrams(report.silverNet)}</div></div>
        <div class="box"><div class="label">Interest earned to date</div><div class="value">${formatCurrency(report.interestEarned, currency)}</div></div>
      </div>
      <table>
        <thead><tr><th>Loan</th><th>Customer</th><th>Date</th><th style="text-align:right">Financed</th>
        <th style="text-align:right">Principal</th><th style="text-align:right">Interest</th>
        <th style="text-align:right">Settlement</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;
  };

  const exportReport = useAsyncAction(
    async (share: boolean) => {
      if (report.active.length === 0 && report.closed.length === 0) {
        throw new Error('There is nothing to report yet — record a pledge first.');
      }
      const html = buildHtml();
      if (share) await sharePdf(html, 'girvi-report.pdf');
      else await printHtml(html);
    },
    { context: 'Reports.export' }
  );

  return (
    <>
      <AppBar title="Reports" subtitle="Shop position & performance" />

      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {loading ? (
          <Loading />
        ) : isEmptyFailure && error ? (
          <ErrorState error={error} onRetry={() => void retry()} />
        ) : (
          <>
            {isStale && !!error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

            <SectionTitle title="Money position" />
            <Row gap={spacing.sm} style={{ marginBottom: spacing.sm }}>
              <StatTile
                label="Principal on the street"
                value={formatCurrency(report.principalOut, currency)}
                tone="accent"
              />
              <StatTile
                label="Interest pending"
                value={formatCurrency(report.interestPending, currency)}
                tone="success"
              />
            </Row>
            <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
              <StatTile
                label="Collateral value held"
                value={formatCurrency(report.collateralValue, currency)}
                hint={`Cover ${
                  report.principalOut > 0
                    ? Math.round((report.collateralValue / report.principalOut) * 100)
                    : 0
                }%`}
              />
              <StatTile
                label="Extra money given (top-ups)"
                value={formatCurrency(report.topUpTotal, currency)}
              />
            </Row>

            <SectionTitle title="Metal in the vault" />
            <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
              <StatTile label="Gold (net)" value={formatGrams(report.goldNet)} tone="accent" />
              <StatTile label="Silver (net)" value={formatGrams(report.silverNet)} />
            </Row>

            <SectionTitle title="Earnings to date" />
            <Card>
              <KeyValue label="Interest collected" value={formatCurrency(report.interestEarned, currency)} />
              <KeyValue label="Principal recovered" value={formatCurrency(report.principalBack, currency)} />
              <KeyValue label="Discounts / waivers given" value={formatCurrency(report.waived, currency)} />
              <KeyValue label="Pledges settled" value={String(report.closed.length)} />
              <KeyValue label="Pledges running" value={String(report.active.length)} />
              <KeyValue label="Overdue pledges" value={String(report.overdue.length)} />
              <KeyValue
                label={`Auto-compounded (past ${policy.afterMonths} months)`}
                value={String(report.compounded.length)}
              />
            </Card>

            <SectionTitle title="Collections by month" />
            <Card>
              {report.recentMonths.length === 0 ? (
                <Text style={styles.empty}>No collections recorded yet.</Text>
              ) : (
                report.recentMonths.map(([month, amount]) => {
                  const max = Math.max(...report.recentMonths.map(([, value]) => value), 1);
                  return (
                    <View key={month} style={{ marginBottom: spacing.md }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={styles.monthLabel}>{month}</Text>
                        <Text style={styles.monthValue}>{formatCurrency(amount, currency)}</Text>
                      </Row>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.max(4, (amount / max) * 100)}%`, backgroundColor: accent.primary },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </Card>

            <ErrorBanner message={exportReport.error} />

            <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
              <Button
                title="Print report"
                variant="secondary"
                style={{ flex: 1 }}
                loading={exportReport.busy}
                onPress={() => void exportReport.run(false)}
              />
              <Button
                title="Share as PDF"
                variant="dark"
                style={{ flex: 1 }}
                onPress={() => void exportReport.run(true)}
              />
            </Row>
          </>
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  empty: { fontSize: 12, color: neutral[500] },
  monthLabel: { fontSize: 12, fontWeight: '700', color: neutral[700] },
  monthValue: { fontSize: 12, fontWeight: '800', color: neutral[900] },
  barTrack: {
    height: 7,
    backgroundColor: neutral[200],
    borderRadius: 4,
    marginTop: 5,
    overflow: 'hidden',
  },
  barFill: { height: 7, borderRadius: 4 },
  error: { color: '#e11d48', fontSize: 12, marginTop: spacing.sm },
});
