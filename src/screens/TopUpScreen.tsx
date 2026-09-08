import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '../components/DateField';
import {
  AppBar,
  Button,
  Card,
  ChipGroup,
  ErrorBanner,
  Field,
  InfoBanner,
  KeyValue,
  Loading,
  Row,
  Screen,
  SectionTitle,
  ToggleRow,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { logError } from '../lib/errors';
import { AppNav, AppStackParamList } from '../navigation/types';
import * as api from '../services/api';
import { printHtml, topUpVoucherHtml } from '../services/receipts';
import { neutral, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { todayString } from '../utils/dates';
import { formatCurrency, formatDate, parseAmount } from '../utils/format';
import { PaymentMode } from '../types/girvi';
import { calculateLoan } from '../utils/interest';

/**
 * "Add money" — the customer borrows more against ornaments already pledged.
 * The extra amount joins the same loan from its own date, so interest before
 * that date is untouched and interest after it runs on the larger principal.
 */
export const TopUpScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'TopUp'>>();
  const { accent } = useAccent();
  const { loanById, customerById, payments, policy, currency, store, refresh } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const loan = loanById(route.params.loanId);
  const customer = loan ? customerById(loan.customerId) : undefined;

  const editingTopUpId = route.params.topUpId;
  const existingTopUp = editingTopUpId ? loan?.topUps.find((t) => t.id === editingTopUpId) : undefined;
  const isEditing = !!existingTopUp;

  const [amountText, setAmountText] = useState(existingTopUp ? String(existingTopUp.amount) : '');
  const [topUpDate, setTopUpDate] = useState(existingTopUp?.topUpDate ?? todayString());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(existingTopUp?.paymentMode ?? 'CASH');
  const [changeRate, setChangeRate] = useState(!!existingTopUp?.newMonthlyRate);
  const [rateText, setRateText] = useState(
    String(existingTopUp?.newMonthlyRate ?? loan?.monthlyInterestRate ?? '')
  );
  const [notes, setNotes] = useState(existingTopUp?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const newRate = parseAmount(rateText);

  // Excludes the top-up being edited so "current position" and the projected
  // preview both read as "before this entry", the same as when adding fresh.
  const loanForCalc = useMemo(() => {
    if (!loan) return loan;
    if (!editingTopUpId) return loan;
    return { ...loan, topUps: loan.topUps.filter((t) => t.id !== editingTopUpId) };
  }, [loan, editingTopUpId]);

  const current = useMemo(
    () => (loanForCalc ? calculateLoan(loanForCalc, payments, policy, topUpDate) : null),
    [loanForCalc, payments, policy, topUpDate]
  );

  /** What the loan looks like the moment after the extra money is handed over. */
  const projected = useMemo(() => {
    if (!loanForCalc || amount <= 0) return null;
    const simulated = {
      ...loanForCalc,
      status: 'ACTIVE' as const,
      topUps: [
        ...loanForCalc.topUps,
        {
          id: 'preview',
          storeId: loanForCalc.storeId,
          loanId: loanForCalc.id,
          voucherNo: 'PREVIEW',
          topUpDate,
          amount,
          paymentMode,
          newMonthlyRate: changeRate && newRate > 0 ? newRate : null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    return calculateLoan(simulated, payments, policy, topUpDate);
  }, [amount, changeRate, loanForCalc, newRate, paymentMode, payments, policy, topUpDate]);

  if (!loan || !current) {
    return (
      <>
        <AppBar title="Add money" />
        <Screen>
          <Loading />
        </Screen>
      </>
    );
  }

  const validate = (): string | null => {
    if (amount <= 0) return 'Enter the amount you are giving the customer.';
    if (amount > 10000000) return 'That amount looks too large — please check it.';
    if (changeRate && (newRate <= 0 || newRate > 20)) {
      return 'Enter a monthly interest rate between 0 and 20%.';
    }
    if (topUpDate < loan.loanDate) {
      return 'The date cannot be earlier than the original pledge date.';
    }
    if (topUpDate > todayString()) return 'The date cannot be in the future.';
    return null;
  };

  const save = useAsyncAction(async () => {
    const topUp = isEditing
      ? await api.updateTopUp(
          existingTopUp!.id,
          {
            amount,
            topUpDate,
            paymentMode,
            newMonthlyRate: changeRate && newRate > 0 ? newRate : null,
            notes,
          },
          loan.id
        )
      : await api.createTopUp({
          storeId: loan.storeId,
          loanId: loan.id,
          amount,
          topUpDate,
          paymentMode,
          newMonthlyRate: changeRate && newRate > 0 ? newRate : null,
          notes,
        });
    await refresh();

    Alert.alert(
      isEditing ? 'Top-up updated' : 'Additional loan recorded',
      `${formatCurrency(amount, currency)} added to ${loan.loanNo}. Voucher ${topUp.voucherNo}.`,
      [
        {
          text: 'Print voucher',
          onPress: () => {
            try {
              if (store) {
                void printHtml(
                  topUpVoucherHtml({
                    store,
                    loan,
                    customer,
                    topUp,
                    breakdown: projected ?? current,
                  })
                );
              }
            } catch (printError) {
              logError('TopUp.print', printError);
              toast.showInfo('Top-up saved, but the voucher could not be printed.');
            }
            navigation.goBack();
          },
        },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]
    );
  }, { context: 'TopUp.save' });

  const handleSave = () => {
    const problem = validate();
    setValidationError(problem);
    if (problem) return;
    if (!isOnline) {
      toast.showError({ message: 'Network request failed' });
      return;
    }
    void save.run();
  };

  const quickAmounts = [5000, 10000, 25000, 50000];

  return (
    <>
      <AppBar
        title={isEditing ? 'Edit top-up' : 'Add money to pledge'}
        subtitle={
          isEditing
            ? `Correcting ${existingTopUp!.voucherNo} · ${loan.loanNo}`
            : `${loan.loanNo} · ${customer?.fullName ?? ''}`
        }
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <ErrorBanner message={validationError} />
        <ErrorBanner message={save.error} onRetry={() => void save.run()} />

        {loan.status === 'CLOSED' && (
          <InfoBanner
            tone="warning"
            message="This pledge is settled. Giving more money will re-open it as an active loan against the same ornaments."
          />
        )}

        <Card dark>
          <Text style={styles.darkLabel}>Position right now</Text>
          <KeyValue dark label="Principal outstanding" value={formatCurrency(current.principalBalance, currency)} />
          <KeyValue dark label="Interest pending" value={formatCurrency(current.unpaidInterest, currency)} />
          <KeyValue dark label="Rate" value={`${current.currentMonthlyRate}% per month`} />
          <KeyValue dark label="Ornaments held" value={`${loan.items.length} item(s)`} />
        </Card>

        <SectionTitle title="Additional amount" />
        <Card>
          <Field
            label="Amount given to customer"
            prefix={currency}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="numeric"
            placeholder="0"
          />

          <Row gap={spacing.sm} style={{ marginBottom: spacing.md, flexWrap: 'wrap' }}>
            {quickAmounts.map((value) => (
              <Pressable
                key={value}
                onPress={() => setAmountText(String(value))}
                style={[styles.quickChip, { borderColor: accent.primary }]}
              >
                <Text style={[styles.quickChipText, { color: accent.softText }]}>
                  +{formatCurrency(value, currency)}
                </Text>
              </Pressable>
            ))}
          </Row>

          <DateField
            label="Date the money was given"
            value={topUpDate}
            onChange={setTopUpDate}
            minimumDate={loan.loanDate}
            hint="Interest on the extra amount starts from this date only."
          />

          <ChipGroup<PaymentMode>
            label="Paid out by"
            value={paymentMode}
            onChange={setPaymentMode}
            columns={4}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'BANK_TRANSFER', label: 'Bank' },
              { value: 'CHEQUE', label: 'Cheque' },
            ]}
          />

          <ToggleRow
            label="Change the interest rate too"
            description="Use this when the extra money is agreed at a different rate. The new rate applies from this date onwards."
            value={changeRate}
            onChange={setChangeRate}
          />

          {changeRate && (
            <Field
              label="New monthly interest rate (%)"
              value={rateText}
              onChangeText={setRateText}
              keyboardType="numeric"
              placeholder="e.g. 2.0"
            />
          )}

          <Field
            label="Remarks (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. urgent hospital expense"
            multiline
          />
        </Card>

        {projected && (
          <Card>
            <SectionTitle title="After adding" />
            <KeyValue
              label="New principal outstanding"
              value={formatCurrency(projected.principalBalance, currency)}
            />
            <KeyValue
              label="Total financed on this pledge"
              value={formatCurrency(projected.totalDisbursed, currency)}
            />
            <KeyValue
              label="Interest rate from now"
              value={`${projected.currentMonthlyRate}% per month`}
            />
            <KeyValue
              label="Ornament valuation held"
              value={formatCurrency(
                loan.items.reduce((sum, item) => sum + item.estimatedValue, 0),
                currency
              )}
            />
            <View style={{ marginTop: spacing.sm }}>
              <Text style={styles.ltvNote}>
                Loan-to-value after this top-up:{' '}
                {Math.round(
                  (projected.principalBalance /
                    Math.max(
                      1,
                      loan.items.reduce((sum, item) => sum + item.estimatedValue, 0)
                    )) *
                    100
                )}
                % of the ornament value.
              </Text>
            </View>
          </Card>
        )}

        <Button
          title={
            save.busy
              ? 'Saving…'
              : isEditing
              ? `Save changes · ${formatCurrency(amount, currency)}`
              : `Give ${formatCurrency(amount, currency)} & save`
          }
          onPress={handleSave}
          loading={save.busy}
          disabled={amount <= 0 || !isOnline}
        />
        <Text style={styles.footNote}>
          A voucher numbered by the shop is generated automatically, and the entry appears on the
          pledge's ledger dated {formatDate(topUpDate)}.
        </Text>
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  darkLabel: { color: neutral[400], fontSize: 11.5, fontWeight: '700', marginBottom: spacing.sm },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  quickChipText: { fontSize: 11.5, fontWeight: '800' },
  ltvNote: { fontSize: 11, color: neutral[500], lineHeight: 16 },
  footNote: {
    fontSize: 11,
    color: neutral[500],
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 16,
  },
});
