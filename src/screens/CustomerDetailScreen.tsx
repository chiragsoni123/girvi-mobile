import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { LoanCard } from '../components/LoanCard';
import { SignedImage } from '../components/PhotoStrip';
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KeyValue,
  Row,
  Screen,
  SectionTitle,
  StatTile,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { AppNav, AppStackParamList } from '../navigation/types';
import * as api from '../services/api';
import { spacing } from '../theme';
import { formatCurrency, formatDate } from '../utils/format';
import { calculateLoan } from '../utils/interest';

export const CustomerDetailScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'CustomerDetail'>>();
  const { isOwner } = useAuth();
  const { customerById, loansForCustomer, payments, policy, currency, refresh } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const customer = customerById(route.params.customerId);
  const loans = customer ? loansForCustomer(customer.id) : [];

  const summary = useMemo(() => {
    const rows = loans.map((loan) => ({
      loan,
      breakdown: calculateLoan(loan, payments, policy),
    }));
    const active = rows.filter(({ loan }) => loan.status !== 'CLOSED');
    return {
      rows,
      activeCount: active.length,
      outstanding: active.reduce((sum, r) => sum + r.breakdown.totalSettlementAmount, 0),
      lifetimeBorrowed: rows.reduce((sum, r) => sum + r.breakdown.totalDisbursed, 0),
      interestPaid: payments
        .filter((p) => p.customerId === customer?.id)
        .reduce((sum, p) => sum + p.interestPaid, 0),
    };
  }, [customer?.id, loans, payments, policy]);

  const removeCustomer = useAsyncAction(
    async () => {
      if (!customer) return;
      await api.deleteCustomer(customer.id);
      await refresh();
      toast.showSuccess(`${customer.fullName} deleted.`);
      navigation.goBack();
    },
    { context: 'CustomerDetail.delete' }
  );

  if (!customer) {
    return (
      <>
        <AppBar title="Customer" />
        <Screen>
          <EmptyState
            title="Customer not found"
            message="They may have been deleted on another device. Go back and pull down to refresh."
          />
        </Screen>
      </>
    );
  }

  const handleDelete = () => {
    if (summary.activeCount > 0) {
      Alert.alert(
        'Cannot delete',
        `${customer.fullName} still has ${summary.activeCount} active pledge(s). Settle or delete those first — the ornaments are still in your vault.`
      );
      return;
    }
    Alert.alert(
      'Delete customer?',
      `${customer.fullName} and their KYC details will be removed permanently. Their ${loans.length} settled pledge record(s) go too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void removeCustomer.run() },
      ]
    );
  };

  return (
    <>
      <AppBar
        title={customer.fullName}
        subtitle={`${customer.customerCode} · ${customer.city || ''}`}
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <ErrorBanner message={removeCustomer.error} />

        <Card dark>
          <Row gap={spacing.sm}>
            <StatTile
              dark
              label="Outstanding today"
              value={formatCurrency(summary.outstanding, currency)}
              tone="accent"
            />
            <StatTile dark label="Active pledges" value={String(summary.activeCount)} />
          </Row>
          <Row gap={spacing.sm} style={{ marginTop: spacing.sm }}>
            <StatTile
              dark
              label="Lifetime borrowed"
              value={formatCurrency(summary.lifetimeBorrowed, currency)}
            />
            <StatTile
              dark
              label="Interest paid"
              value={formatCurrency(summary.interestPaid, currency)}
              tone="success"
            />
          </Row>
        </Card>

        <Card>
          <SectionTitle title="KYC" />
          <KeyValue label="Relation" value={`${customer.relationType} ${customer.relativeName}`} />
          <KeyValue label="Phone" value={customer.phone || '—'} />
          {!!customer.alternatePhone && (
            <KeyValue label="Alternate phone" value={customer.alternatePhone} />
          )}
          <KeyValue
            label="Address"
            value={`${customer.address}${customer.city ? `, ${customer.city}` : ''} ${customer.pincode ?? ''}`}
          />
          <KeyValue label={customer.idProofType} value={customer.idProofNumber || '—'} />
          <KeyValue label="Added on" value={formatDate(customer.createdAt)} />
          {!!customer.notes && <KeyValue label="Notes" value={customer.notes} />}

          {(customer.photoUrl || customer.idProofPhotoUrl) && (
            <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
              <SignedImage path={customer.photoUrl} size={72} />
              <SignedImage path={customer.idProofPhotoUrl} size={72} />
            </Row>
          )}

          <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
            <Button
              title="Call"
              variant="secondary"
              small
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
            />
            <Button
              title="Edit details"
              variant="ghost"
              small
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('CustomerForm', { customerId: customer.id })}
            />
          </Row>
        </Card>

        <Button
          title="New pledge for this customer"
          onPress={() => navigation.navigate('NewLoan', { customerId: customer.id })}
          style={{ marginBottom: spacing.lg }}
          disabled={!isOnline}
        />

        <SectionTitle title={`Pledges (${loans.length})`} />
        {summary.rows.length === 0 ? (
          <EmptyState title="No pledges yet" message="This customer has not pledged anything so far." />
        ) : (
          summary.rows.map(({ loan, breakdown }) => (
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

        {isOwner && (
          <Button
            title="Delete customer"
            variant="danger"
            onPress={handleDelete}
            loading={removeCustomer.busy}
            disabled={!isOnline}
            style={{ marginTop: spacing.lg }}
          />
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
});
