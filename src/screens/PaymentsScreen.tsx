import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppBar,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Loading,
  Row,
  Screen,
  StatTile,
} from '../components/ui';
import { useData } from '../context/DataContext';
import { AppNav } from '../navigation/types';
import { neutral, radius, semantic, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCurrency, formatDate } from '../utils/format';

type Period = 'MONTH' | 'QUARTER' | 'YEAR' | 'ALL';

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: 'MONTH', label: 'This month', days: 30 },
  { id: 'QUARTER', label: '3 months', days: 90 },
  { id: 'YEAR', label: '1 year', days: 365 },
  { id: 'ALL', label: 'All time', days: 100000 },
];

export const PaymentsScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
  const {
    payments,
    loans,
    customers,
    currency,
    loading,
    refreshing,
    refresh,
    retry,
    error,
    isEmptyFailure,
    isStale,
  } = useData();

  const [period, setPeriod] = useState<Period>('MONTH');

  const { rows, totals } = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)?.days ?? 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const filtered = payments
      .filter((p) => period === 'ALL' || p.paymentDate >= cutoff)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    return {
      rows: filtered,
      totals: filtered.reduce(
        (acc, p) => ({
          total: acc.total + p.totalAmount,
          interest: acc.interest + p.interestPaid,
          principal: acc.principal + p.principalPaid,
        }),
        { total: 0, interest: 0, principal: 0 }
      ),
    };
  }, [payments, period]);

  return (
    <>
      <AppBar title="Receipts" subtitle={`${rows.length} payments in view`} />

      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {PERIODS.map((item) => {
            const active = period === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setPeriod(item.id)}
                style={[
                  styles.filterChip,
                  active
                    ? { backgroundColor: accent.primary, borderColor: accent.primary }
                    : { backgroundColor: '#ffffff', borderColor: neutral[200] },
                ]}
              >
                <Text style={[styles.filterText, { color: active ? accent.onPrimary : neutral[600] }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Row gap={spacing.sm} style={{ marginBottom: spacing.sm }}>
          <StatTile label="Total collected" value={formatCurrency(totals.total, currency)} tone="success" />
          <StatTile label="Interest earned" value={formatCurrency(totals.interest, currency)} tone="accent" />
        </Row>
        <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
          <StatTile label="Principal back" value={formatCurrency(totals.principal, currency)} />
        </Row>

        {isStale && !!error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

        {loading ? (
          <Loading />
        ) : isEmptyFailure && error ? (
          <ErrorState error={error} onRetry={() => void retry()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No receipts in this period"
            message="Payments you collect will appear here with their receipt numbers."
          />
        ) : (
          rows.map((payment) => {
            const loan = loans.find((l) => l.id === payment.loanId);
            const customer = customers.find((c) => c.id === payment.customerId);
            return (
              <Card
                key={payment.id}
                onPress={() =>
                  loan ? navigation.navigate('LoanDetail', { loanId: loan.id }) : undefined
                }
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.receiptNo, { color: accent.primary }]}>
                      {payment.receiptNo}
                    </Text>
                    <Text style={styles.customer}>{customer?.fullName ?? 'Customer'}</Text>
                    <Text style={styles.meta}>
                      {loan?.loanNo ?? ''} · {formatDate(payment.paymentDate)} ·{' '}
                      {payment.paymentMode.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.meta}>
                      Interest {formatCurrency(payment.interestPaid, currency)} · Principal{' '}
                      {formatCurrency(payment.principalPaid, currency)}
                      {payment.discountWaived > 0
                        ? ` · Waived ${formatCurrency(payment.discountWaived, currency)}`
                        : ''}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amount, { color: semantic.success }]}>
                      {formatCurrency(payment.totalAmount, currency)}
                    </Text>
                    <View style={[styles.typeChip, { backgroundColor: accent.soft }]}>
                      <Text style={[styles.typeText, { color: accent.softText }]}>
                        {payment.paymentType.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>
                </Row>
              </Card>
            );
          })
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  filterRow: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '700' },
  receiptNo: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  customer: { fontSize: 14, fontWeight: '800', color: neutral[900], marginTop: 1 },
  meta: { fontSize: 11, color: neutral[500], marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
  typeChip: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  typeText: { fontSize: 9, fontWeight: '800' },
});
