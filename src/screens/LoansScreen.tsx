import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LoanCard } from '../components/LoanCard';
import { AppBar, EmptyState, ErrorBanner, ErrorState, Fab, Loading, Screen } from '../components/ui';
import { useData } from '../context/DataContext';
import { AppNav } from '../navigation/types';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCurrency } from '../utils/format';
import { calculateLoan } from '../utils/interest';

type Filter = 'ACTIVE' | 'OVERDUE' | 'COMPOUNDED' | 'CLOSED' | 'ALL';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'COMPOUNDED', label: 'Compounded' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'ALL', label: 'All' },
];

export const LoansScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
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

  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return loans
      .map((loan) => ({
        loan,
        breakdown: calculateLoan(loan, payments, policy),
        customer: customers.find((c) => c.id === loan.customerId),
      }))
      .filter(({ loan, breakdown }) => {
        if (filter === 'ACTIVE') return loan.status !== 'CLOSED';
        if (filter === 'CLOSED') return loan.status === 'CLOSED';
        if (filter === 'OVERDUE') return loan.status !== 'CLOSED' && breakdown.isOverdue;
        if (filter === 'COMPOUNDED') return breakdown.isCompounded && loan.status !== 'CLOSED';
        return true;
      })
      .filter(({ loan, customer }) => {
        if (!term) return true;
        return (
          loan.loanNo.toLowerCase().includes(term) ||
          (customer?.fullName ?? '').toLowerCase().includes(term) ||
          (customer?.phone ?? '').includes(term) ||
          loan.vaultPouchNo.toLowerCase().includes(term)
        );
      });
  }, [customers, filter, loans, payments, policy, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, { breakdown }) => ({
          principal: acc.principal + breakdown.principalBalance,
          interest: acc.interest + breakdown.unpaidInterest,
        }),
        { principal: 0, interest: 0 }
      ),
    [rows]
  );

  return (
    <>
      <AppBar
        title="Pledges & Loans"
        subtitle={`${rows.length} shown · ${formatCurrency(totals.principal, currency)} principal`}
      />

      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search loan no, customer, phone or pouch"
          placeholderTextColor={neutral[400]}
          style={styles.search}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[
                  styles.filterChip,
                  active
                    ? { backgroundColor: accent.primary, borderColor: accent.primary }
                    : { backgroundColor: '#ffffff', borderColor: neutral[200] },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? accent.onPrimary : neutral[600] },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {totals.interest > 0 && (
          <View style={styles.summaryStrip}>
            <Text style={styles.summaryText}>
              Interest pending in this list:{' '}
              <Text style={{ fontWeight: '800', color: neutral[900] }}>
                {formatCurrency(totals.interest, currency)}
              </Text>
            </Text>
          </View>
        )}

        {isStale && !!error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

        {loading ? (
          <Loading />
        ) : isEmptyFailure && error ? (
          <ErrorState error={error} onRetry={() => void retry()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing here"
            message={
              search
                ? 'No pledge matches that search.'
                : 'No loans in this category yet. Tap “New pledge” to add one.'
            }
          />
        ) : (
          rows.map(({ loan, breakdown, customer }) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              customer={customer}
              breakdown={breakdown}
              currency={currency}
              onPress={() => navigation.navigate('LoanDetail', { loanId: loan.id })}
            />
          ))
        )}
      </Screen>

      <Fab label="+ New pledge" onPress={() => navigation.navigate('NewLoan')} />
    </>
  );
};

const styles = StyleSheet.create({
  search: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 15,
    lineHeight: 19,
    color: neutral[900],
    marginBottom: spacing.md,
    textAlignVertical: 'center',
  },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  summaryStrip: { paddingBottom: spacing.md },
  summaryText: { fontSize: 11.5, color: neutral[500] },
});
