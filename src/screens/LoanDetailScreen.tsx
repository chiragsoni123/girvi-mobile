import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SignedImage } from '../components/PhotoStrip';
import {
  AppBar,
  Badge,
  Button,
  Card,
  ChipGroup,
  Divider,
  EmptyState,
  ErrorBanner,
  KeyValue,
  Loading,
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
import { pledgeAgreementHtml, printHtml, sharePdf } from '../services/receipts';
import { neutral, radius, semantic, spacing, STATUS_COLORS } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { formatCurrency, formatDate, formatGrams } from '../utils/format';
import { calculateLoan, getInterestTypeLabel } from '../utils/interest';

type AutoCompoundChoice = 'DEFAULT' | 'ON' | 'OFF';

export const LoanDetailScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'LoanDetail'>>();
  const { accent } = useAccent();
  const { isOwner } = useAuth();
  const { loanById, customerById, payments, policy, currency, store, refresh } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const [showLedger, setShowLedger] = useState(false);

  const loan = loanById(route.params.loanId);
  const customer = loan ? customerById(loan.customerId) : undefined;

  const breakdown = useMemo(
    () => (loan ? calculateLoan(loan, payments, policy) : null),
    [loan, payments, policy]
  );

  const loanPayments = useMemo(
    () =>
      payments
        .filter((p) => p.loanId === loan?.id)
        .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
    [loan?.id, payments]
  );

  // Every hook must run on each render, so these sit above the loading return.
  const updateCompounding = useAsyncAction(
    async (choice: AutoCompoundChoice) => {
      if (!loan) return;
      await api.updateLoan(loan.id, {
        autoCompoundOverride: choice === 'DEFAULT' ? null : choice === 'ON',
      });
      await refresh();
      toast.showSuccess('Compounding rule updated.');
    },
    { context: 'LoanDetail.updateCompounding' }
  );

  const removeLoan = useAsyncAction(
    async () => {
      if (!loan) return;
      await api.deleteLoan(loan.id);
      await refresh();
      toast.showSuccess(`${loan.loanNo} deleted.`);
      navigation.goBack();
    },
    { context: 'LoanDetail.delete' }
  );

  const printDoc = useAsyncAction(
    async (share: boolean) => {
      if (!store || !loan || !breakdown) throw new Error('Shop details are still loading.');
      const html = pledgeAgreementHtml({ store, loan, customer, breakdown });
      if (share) await sharePdf(html, `${loan.loanNo}-agreement.pdf`);
      else await printHtml(html);
    },
    { context: 'LoanDetail.print' }
  );

  if (!loan || !breakdown) {
    return (
      <>
        <AppBar title="Pledge" />
        <Screen>
          <EmptyState
            title="Pledge not found"
            message="It may have been deleted on another device. Go back and pull down to refresh."
          />
        </Screen>
      </>
    );
  }

  const isClosed = loan.status === 'CLOSED';
  const statusKey = isClosed ? 'CLOSED' : breakdown.isOverdue ? 'OVERDUE' : 'ACTIVE';
  const status = STATUS_COLORS[statusKey];
  const typeInfo = getInterestTypeLabel(breakdown.effectiveInterestType);

  const autoChoice: AutoCompoundChoice =
    loan.autoCompoundOverride === null ? 'DEFAULT' : loan.autoCompoundOverride ? 'ON' : 'OFF';

  const handleDelete = () => {
    Alert.alert(
      `Delete ${loan.loanNo}?`,
      `This permanently removes the pledge, its ${loan.items.length} ornament record(s), ${loan.topUps.length} top-up(s) and ${loanPayments.length} receipt(s). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void removeLoan.run() },
      ]
    );
  };

  const busy = updateCompounding.busy || removeLoan.busy;

  const totalGross = loan.items.reduce((sum, i) => sum + i.grossWeight, 0);
  const totalNet = loan.items.reduce((sum, i) => sum + i.netWeight, 0);
  const totalValue = loan.items.reduce((sum, i) => sum + i.estimatedValue, 0);

  return (
    <>
      <AppBar
        title={loan.loanNo}
        subtitle={`${customer?.fullName ?? 'Customer'} · ${formatDate(loan.loanDate)}`}
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
        right={
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{statusKey}</Text>
          </View>
        }
      />

      <Screen>
        <ErrorBanner message={updateCompounding.error} />
        <ErrorBanner message={removeLoan.error} onRetry={() => void removeLoan.run()} />
        <ErrorBanner message={printDoc.error} />

        {/* Financial position */}
        <Card dark>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.darkHeading}>Interest clock</Text>
            <Badge
              label={typeInfo.badge}
              bg={accent.primary}
              color={accent.onPrimary}
            />
          </Row>

          <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }} gap={spacing.sm}>
            <StatTile
              dark
              label="Principal outstanding"
              value={formatCurrency(breakdown.principalBalance, currency)}
              hint={`Financed ${formatCurrency(breakdown.totalDisbursed, currency)}`}
            />
            <StatTile
              dark
              label="Interest pending"
              value={formatCurrency(breakdown.unpaidInterest, currency)}
              tone="success"
              hint={`Paid ${formatCurrency(breakdown.totalInterestPaid, currency)}`}
            />
          </Row>
          <Row style={{ marginTop: spacing.sm }} gap={spacing.sm}>
            <StatTile dark label="Running time" value={breakdown.monthsDisplay} hint={`${breakdown.daysElapsed} days`} />
            <StatTile
              dark
              label="Settlement today"
              value={formatCurrency(breakdown.totalSettlementAmount, currency)}
              tone="accent"
            />
          </Row>

          <Divider dark />

          <KeyValue dark label="Rate" value={`${breakdown.currentMonthlyRate}% per month`} />
          <KeyValue dark label="Method" value={typeInfo.name} />
          <KeyValue dark label="Due date" value={formatDate(loan.dueDate)} />
          {breakdown.capitalizedInterest > 0 && (
            <KeyValue
              dark
              label="Interest added to principal"
              value={formatCurrency(breakdown.capitalizedInterest, currency)}
            />
          )}
          {breakdown.compoundExtraInterest > 0 && (
            <KeyValue
              dark
              label="Extra vs simple interest"
              value={`+ ${formatCurrency(breakdown.compoundExtraInterest, currency)}`}
            />
          )}

          <Pressable onPress={() => setShowLedger((prev) => !prev)} style={{ marginTop: spacing.md }}>
            <Text style={[styles.ledgerToggle, { color: accent.onDark }]}>
              {showLedger ? 'Hide' : 'Show'} day-by-day ledger ({breakdown.ledger.length} entries)
            </Text>
          </Pressable>

          {showLedger && (
            <View style={{ marginTop: spacing.sm }}>
              {breakdown.ledger.map((entry, index) => (
                <View key={`${entry.date}-${index}`} style={styles.ledgerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerLabel}>{entry.label}</Text>
                    <Text style={styles.ledgerDate}>{formatDate(entry.date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.ledgerAmount}>
                      {formatCurrency(entry.amount, currency)}
                    </Text>
                    <Text style={styles.ledgerDate}>
                      bal {formatCurrency(entry.principalAfter, currency)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Compounding control */}
        <Card>
          <SectionTitle title="Compounding rule" />
          {breakdown.autoConverted ? (
            <View style={[styles.notice, { backgroundColor: semantic.warningSoft }]}>
              <Text style={[styles.noticeText, { color: semantic.warningText }]}>
                This pledge crossed {policy.afterMonths} months on{' '}
                {formatDate(breakdown.conversionDate)}, so the entire loan has been recalculated
                as {policy.frequency.toLowerCase()} compound interest from the pledge date
                ({formatDate(loan.loanDate)}) — not just from the anniversary. That added{' '}
                {formatCurrency(breakdown.compoundExtraInterest, currency)} over plain simple
                interest.
              </Text>
            </View>
          ) : breakdown.conversionDate ? (
            <View style={[styles.notice, { backgroundColor: accent.soft }]}>
              <Text style={[styles.noticeText, { color: accent.softText }]}>
                Simple interest for now. If this pledge is still open on{' '}
                {formatDate(breakdown.conversionDate)}, the whole loan will be recalculated as
                compound interest from day one — the amount owed will step up on that date.
                Choose “Never” below to keep it simple.
              </Text>
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: neutral[100] }]}>
              <Text style={[styles.noticeText, { color: neutral[600] }]}>
                {typeInfo.isCompound
                  ? `This loan was booked as ${typeInfo.name.toLowerCase()} — it compounds from day one.`
                  : 'Automatic conversion is switched off for this pledge — interest stays simple however long it runs.'}
              </Text>
            </View>
          )}

          <ChipGroup<AutoCompoundChoice>
            label={`Recalculate as compound once past ${policy.afterMonths} months`}
            columns={3}
            value={autoChoice}
            onChange={(choice) => void updateCompounding.run(choice)}
            options={[
              {
                value: 'DEFAULT',
                label: 'Shop default',
                hint: policy.autoConvertEnabled ? 'On' : 'Off',
              },
              { value: 'ON', label: 'Always on', hint: 'Force' },
              { value: 'OFF', label: 'Never', hint: 'Keep simple' },
            ]}
          />
          {busy && <Text style={styles.savingHint}>Saving…</Text>}
        </Card>

        {/* Actions */}
        {!isClosed && (
          <Row gap={spacing.sm} style={{ marginBottom: spacing.md }}>
            <Button
              title="Collect payment"
              onPress={() => navigation.navigate('CollectPayment', { loanId: loan.id })}
              style={{ flex: 1 }}
              disabled={!isOnline}
            />
            <Button
              title="Add money"
              variant="dark"
              onPress={() => navigation.navigate('TopUp', { loanId: loan.id })}
              style={{ flex: 1 }}
              disabled={!isOnline}
            />
          </Row>
        )}
        {isClosed && (
          <Button
            title="Give more money (re-opens pledge)"
            variant="dark"
            onPress={() => navigation.navigate('TopUp', { loanId: loan.id })}
            style={{ marginBottom: spacing.md }}
          />
        )}

        <Button
          title="Edit pledge details"
          variant="secondary"
          small
          onPress={() => navigation.navigate('NewLoan', { loanId: loan.id })}
          style={{ marginBottom: spacing.md }}
          disabled={!isOnline}
        />

        <Row gap={spacing.sm} style={{ marginBottom: spacing.lg }}>
          <Button
            title="Print agreement"
            variant="secondary"
            small
            loading={printDoc.busy}
            onPress={() => void printDoc.run(false)}
            style={{ flex: 1 }}
          />
          <Button
            title="Share PDF"
            variant="ghost"
            small
            onPress={() => void printDoc.run(true)}
            style={{ flex: 1 }}
          />
        </Row>

        {/* Customer */}
        <Card>
          <SectionTitle title="Borrower" />
          <Text style={styles.customerName}>{customer?.fullName ?? 'Unknown'}</Text>
          <Text style={styles.customerMeta}>
            {customer?.relationType} {customer?.relativeName}
            {customer?.city ? ` · ${customer.city}` : ''}
          </Text>
          {!!customer?.idProofNumber && (
            <Text style={styles.customerMeta}>
              {customer.idProofType}: {customer.idProofNumber}
            </Text>
          )}
          {!!customer?.phone && (
            <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
              <Button
                title="Call"
                variant="secondary"
                small
                style={{ flex: 1 }}
                onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
              />
              <Button
                title="WhatsApp reminder"
                variant="ghost"
                small
                style={{ flex: 2 }}
                onPress={() => {
                  const text = encodeURIComponent(
                    `Namaste ${customer.fullName}, your pledge ${loan.loanNo} at ${
                      store?.shopName ?? 'our shop'
                    } has ${formatCurrency(breakdown.unpaidInterest, currency)} interest pending. ` +
                      `Full settlement today is ${formatCurrency(
                        breakdown.totalSettlementAmount,
                        currency
                      )}. Kindly visit at your convenience.`
                  );
                  const phone = customer.phone.replace(/\D/g, '');
                  void Linking.openURL(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${text}`);
                }}
              />
            </Row>
          )}
        </Card>

        {/* Ornaments */}
        <SectionTitle title={`Pledged ornaments (${loan.items.length})`} />
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={styles.weightSummary}>Gross {formatGrams(totalGross)}</Text>
            <Text style={styles.weightSummary}>Net {formatGrams(totalNet)}</Text>
            <Text style={styles.weightSummary}>Value {formatCurrency(totalValue, currency)}</Text>
          </Row>
          {loan.items.map((item, index) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>
                  {index + 1}. {item.itemName}
                  {item.addedWithTopupId ? '  (added later)' : ''}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.metalType} · {item.purity} · Qty {item.quantity}
                </Text>
                <Text style={styles.itemMeta}>
                  {formatGrams(item.grossWeight)} gross / {formatGrams(item.netWeight)} net ·{' '}
                  {formatCurrency(item.estimatedValue, currency)}
                </Text>
                {!!item.itemLockerLocation && (
                  <Text style={styles.itemMeta}>Locker: {item.itemLockerLocation}</Text>
                )}
              </View>
              {item.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Row gap={4}>
                    {item.photos.map((photo) => (
                      <SignedImage key={photo} path={photo} size={52} />
                    ))}
                  </Row>
                </ScrollView>
              )}
            </View>
          ))}
        </Card>

        {/* Top-ups */}
        {loan.topUps.length > 0 && (
          <>
            <SectionTitle title={`Additional money given (${loan.topUps.length})`} />
            <Card>
              {loan.topUps.map((topUp) => (
                <View key={topUp.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{topUp.voucherNo}</Text>
                    <Text style={styles.listMeta}>
                      {formatDate(topUp.topUpDate)} · {topUp.paymentMode.replace(/_/g, ' ')}
                      {topUp.newMonthlyRate ? ` · rate → ${topUp.newMonthlyRate}%` : ''}
                    </Text>
                    {!!topUp.notes && <Text style={styles.listMeta}>{topUp.notes}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.listAmount, { color: accent.primary }]}>
                      + {formatCurrency(topUp.amount, currency)}
                    </Text>
                    <Pressable
                      onPress={() => navigation.navigate('TopUp', { loanId: loan.id, topUpId: topUp.id })}
                      hitSlop={8}
                      disabled={!isOnline}
                    >
                      <Text style={[styles.editLink, { color: accent.primary }]}>Edit</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* Payments */}
        <SectionTitle title={`Payments received (${loanPayments.length})`} />
        {loanPayments.length === 0 ? (
          <EmptyState title="No payments yet" message="Nothing has been collected on this pledge." />
        ) : (
          <Card>
            {loanPayments.map((payment) => (
              <View key={payment.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{payment.receiptNo}</Text>
                  <Text style={styles.listMeta}>
                    {formatDate(payment.paymentDate)} · {payment.paymentType.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.listMeta}>
                    Interest {formatCurrency(payment.interestPaid, currency)} · Principal{' '}
                    {formatCurrency(payment.principalPaid, currency)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.listAmount, { color: semantic.success }]}>
                    {formatCurrency(payment.totalAmount, currency)}
                  </Text>
                  <Pressable
                    onPress={() =>
                      navigation.navigate('CollectPayment', { loanId: loan.id, paymentId: payment.id })
                    }
                    hitSlop={8}
                    disabled={!isOnline}
                  >
                    <Text style={[styles.editLink, { color: accent.primary }]}>Edit</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        )}

        {isOwner && (
          <Button
            title="Delete this pledge"
            variant="danger"
            onPress={handleDelete}
            loading={removeLoan.busy}
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
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  darkHeading: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  ledgerToggle: { fontSize: 12, fontWeight: '800' },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: neutral[800],
  },
  ledgerLabel: { color: neutral[200], fontSize: 12, fontWeight: '600' },
  ledgerDate: { color: neutral[500], fontSize: 10, marginTop: 1 },
  ledgerAmount: { color: '#ffffff', fontSize: 12.5, fontWeight: '800' },

  notice: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  noticeText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  savingHint: { fontSize: 11, color: neutral[500] },

  customerName: { fontSize: 15, fontWeight: '800', color: neutral[900] },
  customerMeta: { fontSize: 12, color: neutral[500], marginTop: 2 },

  weightSummary: { fontSize: 11, fontWeight: '700', color: neutral[600] },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: neutral[100],
  },
  itemName: { fontSize: 13, fontWeight: '800', color: neutral[900] },
  itemMeta: { fontSize: 11, color: neutral[500], marginTop: 2 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: neutral[100],
    gap: spacing.md,
  },
  listTitle: { fontSize: 12.5, fontWeight: '800', color: neutral[900] },
  listMeta: { fontSize: 11, color: neutral[500], marginTop: 2 },
  listAmount: { fontSize: 14, fontWeight: '800' },
  editLink: { fontSize: 11, fontWeight: '800' },
});
