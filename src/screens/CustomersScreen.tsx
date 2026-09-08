import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { SignedImage } from '../components/PhotoStrip';
import {
  AppBar,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Fab,
  Loading,
  Row,
  Screen,
} from '../components/ui';
import { useData } from '../context/DataContext';
import { AppNav } from '../navigation/types';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCurrency, initialsOf } from '../utils/format';
import { calculateLoan } from '../utils/interest';

export const CustomersScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
  const {
    customers,
    loans,
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

  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return customers
      .map((customer) => {
        const theirLoans = loans.filter((l) => l.customerId === customer.id);
        const active = theirLoans.filter((l) => l.status !== 'CLOSED');
        const outstanding = active.reduce((sum, loan) => {
          const breakdown = calculateLoan(loan, payments, policy);
          return sum + breakdown.totalSettlementAmount;
        }, 0);
        return { customer, activeCount: active.length, totalCount: theirLoans.length, outstanding };
      })
      .filter(({ customer }) => {
        if (!term) return true;
        return (
          customer.fullName.toLowerCase().includes(term) ||
          customer.phone.includes(term) ||
          customer.customerCode.toLowerCase().includes(term) ||
          (customer.idProofNumber ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [customers, loans, payments, policy, search]);

  return (
    <>
      <AppBar title="Customers" subtitle={`${customers.length} KYC records`} />

      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone, code or ID number"
          placeholderTextColor={neutral[400]}
          style={styles.search}
        />

        {isStale && !!error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

        {loading ? (
          <Loading />
        ) : isEmptyFailure && error ? (
          <ErrorState error={error} onRetry={() => void retry()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No customers yet"
            message="Add a customer with their KYC details before creating a pledge."
          />
        ) : (
          rows.map(({ customer, activeCount, totalCount, outstanding }) => (
            <Card
              key={customer.id}
              onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}
            >
              <Row gap={spacing.md} style={{ alignItems: 'center' }}>
                {customer.photoUrl ? (
                  <SignedImage path={customer.photoUrl} size={46} radius={23} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: accent.soft }]}>
                    <Text style={[styles.avatarText, { color: accent.softText }]}>
                      {initialsOf(customer.fullName)}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{customer.fullName}</Text>
                  <Text style={styles.meta}>
                    {customer.relationType} {customer.relativeName || '—'}
                  </Text>
                  <Text style={styles.meta}>
                    {customer.customerCode} · {activeCount} active / {totalCount} total pledges
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.outstandingLabel}>Outstanding</Text>
                  <Text style={[styles.outstanding, { color: accent.primary }]}>
                    {formatCurrency(outstanding, currency)}
                  </Text>
                  {!!customer.phone && (
                    <Pressable
                      onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                      hitSlop={8}
                      style={[styles.callChip, { borderColor: neutral[200] }]}
                    >
                      <Text style={styles.callText}>Call</Text>
                    </Pressable>
                  )}
                </View>
              </Row>
            </Card>
          ))
        )}
      </Screen>

      <Fab label="+ New customer" onPress={() => navigation.navigate('CustomerForm')} />
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
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  name: { fontSize: 14.5, fontWeight: '800', color: neutral[900] },
  meta: { fontSize: 11, color: neutral[500], marginTop: 2 },
  outstandingLabel: { fontSize: 9.5, color: neutral[400], fontWeight: '700' },
  outstanding: { fontSize: 14, fontWeight: '800' },
  callChip: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  callText: { fontSize: 10.5, fontWeight: '700', color: neutral[600] },
});
