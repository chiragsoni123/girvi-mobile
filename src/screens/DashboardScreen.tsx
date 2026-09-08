import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { LoanCard } from '../components/LoanCard';
import {
  AppBar,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Loading,
  Row,
  Screen,
  SectionTitle,
  StatTile,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { AppNav } from '../navigation/types';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCompactCurrency, formatCurrency, formatGrams } from '../utils/format';
import { calculateLoan } from '../utils/interest';

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
  const { lockNow, activeStore, signOut } = useAuth();
  const {
    loans,
    customers,
    payments,
    policy,
    currency,
    loading,
    refreshing,
    refresh,
    retry,
    error,
    isEmptyFailure,
    isStale,
  } = useData();

  const metrics = useMemo(() => {
    const active = loans.filter((l) => l.status !== 'CLOSED');

    let principal = 0;
    let interestDue = 0;
    let goldNet = 0;
    let silverNet = 0;
    let overdue = 0;
    let compounded = 0;

    const enriched = active.map((loan) => {
      const breakdown = calculateLoan(loan, payments, policy);
      principal += breakdown.principalBalance;
      interestDue += breakdown.unpaidInterest;
      if (breakdown.isOverdue) overdue += 1;
      if (breakdown.autoConverted) compounded += 1;

      loan.items.forEach((item) => {
        if (item.metalType === 'GOLD' || item.metalType === 'DIAMOND_GOLD') goldNet += item.netWeight;
        else if (item.metalType === 'SILVER') silverNet += item.netWeight;
      });

      return { loan, breakdown };
    });

    const thisMonth = new Date().toISOString().slice(0, 7);
    const collectedThisMonth = payments
      .filter((p) => p.paymentDate.startsWith(thisMonth))
      .reduce((sum, p) => sum + p.totalAmount, 0);

    return {
      enriched,
      activeCount: active.length,
      closedCount: loans.length - active.length,
      principal,
      interestDue,
      goldNet,
      silverNet,
      overdue,
      compounded,
      collectedThisMonth,
    };
  }, [loans, payments, policy]);

  const attention = useMemo(
    () =>
      metrics.enriched
        .filter((entry) => entry.breakdown.isOverdue || entry.breakdown.autoConverted)
        .sort((a, b) => b.breakdown.totalSettlementAmount - a.breakdown.totalSettlementAmount)
        .slice(0, 4),
    [metrics.enriched]
  );

  const recent = useMemo(
    () =>
      [...metrics.enriched]
        .sort((a, b) => b.loan.loanDate.localeCompare(a.loan.loanDate))
        .slice(0, 4),
    [metrics.enriched]
  );

  return (
    <>
      <AppBar
        title={activeStore?.shopName ?? 'Girvi Pawn Manager'}
        subtitle={`${activeStore?.city || 'Shop'} · code ${activeStore?.storeCode ?? '—'}`}
        right={
          <Row gap={spacing.xs}>
            <Pressable onPress={lockNow} style={styles.barButton}>
              <Text style={styles.barButtonText}>Lock</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Settings')} style={styles.barButton}>
              <Text style={styles.barButtonText}>Settings</Text>
            </Pressable>
          </Row>
        }
      />

      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {loading ? (
          <Loading label="Loading your ledger…" />
        ) : isEmptyFailure && error ? (
          <ErrorState error={error} onRetry={() => void retry()} onSignIn={() => void signOut()} />
        ) : (
          <>
            {/* Figures came from an earlier load — say so rather than implying
                they are current. */}
            {isStale && !!error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

            {/* Money at a glance */}
            <Card dark>
              <Text style={styles.heroLabel}>Total money on the street</Text>
              <Text style={[styles.heroValue, { color: accent.onDark }]}>
                {formatCurrency(metrics.principal, currency)}
              </Text>
              <Text style={styles.heroHint}>
                across {metrics.activeCount} active pledge{metrics.activeCount === 1 ? '' : 's'} ·{' '}
                {formatCurrency(metrics.interestDue, currency)} interest pending
              </Text>

              <Row style={{ marginTop: spacing.lg }} gap={spacing.sm}>
                <StatTile
                  dark
                  label="Gold held (net)"
                  value={formatGrams(metrics.goldNet)}
                  tone="accent"
                />
                <StatTile dark label="Silver held (net)" value={formatGrams(metrics.silverNet)} />
              </Row>
            </Card>

            <Row gap={spacing.sm} style={{ marginBottom: spacing.md }}>
              <StatTile
                label="Collected this month"
                value={formatCompactCurrency(metrics.collectedThisMonth, currency)}
                tone="success"
              />
              <StatTile
                label="Overdue pledges"
                value={String(metrics.overdue)}
                tone={metrics.overdue > 0 ? 'danger' : 'default'}
                hint={metrics.overdue > 0 ? 'Needs a reminder call' : 'All clear'}
              />
            </Row>

            <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
              <StatTile
                label="Auto-compounded loans"
                value={String(metrics.compounded)}
                tone={metrics.compounded > 0 ? 'accent' : 'default'}
                hint={`Past ${policy.afterMonths} months`}
              />
              <StatTile label="Settled / closed" value={String(metrics.closedCount)} />
            </Row>

            {/* Quick actions */}
            <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
              <QuickAction
                label="New pledge"
                hint="Take ornaments in"
                color={accent.primary}
                textColor={accent.onPrimary}
                onPress={() => navigation.navigate('NewLoan')}
              />
              <QuickAction
                label="Add customer"
                hint="KYC entry"
                color="#ffffff"
                textColor={neutral[800]}
                bordered
                onPress={() => navigation.navigate('CustomerForm')}
              />
            </Row>

            {attention.length > 0 && (
              <>
                <SectionTitle title="Needs attention" />
                {attention.map(({ loan, breakdown }) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    customer={customers.find((c) => c.id === loan.customerId)}
                    breakdown={breakdown}
                    currency={currency}
                    onPress={() => navigation.navigate('LoanDetail', { loanId: loan.id })}
                  />
                ))}
              </>
            )}

            <SectionTitle title="Recent pledges" />
            {recent.length === 0 ? (
              <EmptyState
                title="No active pledges yet"
                message="Tap “New pledge” to record the first gold or silver item taken against a loan."
              />
            ) : (
              recent.map(({ loan, breakdown }) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  customer={customers.find((c) => c.id === loan.customerId)}
                  breakdown={breakdown}
                  currency={currency}
                  onPress={() => navigation.navigate('LoanDetail', { loanId: loan.id })}
                />
              ))
            )}

            <Pressable
              onPress={() => navigation.navigate('Calculator')}
              style={[styles.calcBanner, { borderColor: accent.primary }]}
            >
              <Text style={[styles.calcTitle, { color: accent.softText }]}>
                Interest calculator
              </Text>
              <Text style={styles.calcHint}>
                Try any amount, rate and period — simple vs compound, side by side.
              </Text>
            </Pressable>
          </>
        )}
      </Screen>
    </>
  );
};

const QuickAction: React.FC<{
  label: string;
  hint: string;
  color: string;
  textColor: string;
  bordered?: boolean;
  onPress: () => void;
}> = ({ label, hint, color, textColor, bordered, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.quickAction,
      {
        backgroundColor: color,
        borderWidth: bordered ? 1 : 0,
        borderColor: neutral[200],
        opacity: pressed ? 0.9 : 1,
      },
    ]}
  >
    <Text style={[styles.quickLabel, { color: textColor }]}>{label}</Text>
    <Text style={[styles.quickHint, { color: textColor, opacity: 0.7 }]}>{hint}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  barButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: neutral[800],
  },
  barButtonText: { color: neutral[200], fontSize: 11.5, fontWeight: '700' },

  heroLabel: { color: neutral[400], fontSize: 11.5, fontWeight: '700' },
  heroValue: { fontSize: 30, fontWeight: '900', marginTop: 2, letterSpacing: -0.8 },
  heroHint: { color: neutral[400], fontSize: 11.5, marginTop: 4, lineHeight: 16 },

  quickAction: { flex: 1, borderRadius: radius.lg, padding: spacing.lg },
  quickLabel: { fontSize: 14, fontWeight: '800' },
  quickHint: { fontSize: 11, marginTop: 2 },

  calcBanner: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: '#ffffff',
  },
  calcTitle: { fontSize: 13.5, fontWeight: '800' },
  calcHint: { fontSize: 11.5, color: neutral[500], marginTop: 3, lineHeight: 16 },
});
