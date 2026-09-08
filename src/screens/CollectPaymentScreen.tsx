import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

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
  StatTile,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { logError } from '../lib/errors';
import { AppNav, AppStackParamList } from '../navigation/types';
import * as api from '../services/api';
import { paymentReceiptHtml, printHtml } from '../services/receipts';
import { neutral, spacing } from '../theme';
import { PaymentMode, PaymentType } from '../types/girvi';
import { todayString } from '../utils/dates';
import { formatCurrency, parseAmount } from '../utils/format';
import { calculateLoan } from '../utils/interest';

export const CollectPaymentScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'CollectPayment'>>();
  const { loanById, customerById, payments, policy, currency, store, refresh } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const loan = loanById(route.params.loanId);
  const customer = loan ? customerById(loan.customerId) : undefined;

  const editingPaymentId = route.params.paymentId;
  const existingPayment = editingPaymentId ? payments.find((p) => p.id === editingPaymentId) : undefined;
  const isEditing = !!existingPayment;

  // The breakdown must reflect the ledger as it stood *before* this payment,
  // both to show correct outstanding figures and so the validation below
  // doesn't compare the edited amount against a balance that already
  // includes it. Editing therefore looks exactly like collecting it fresh.
  const paymentsForCalc = useMemo(
    () => (editingPaymentId ? payments.filter((p) => p.id !== editingPaymentId) : payments),
    [payments, editingPaymentId]
  );

  const [paymentDate, setPaymentDate] = useState(existingPayment?.paymentDate ?? todayString());
  const [paymentType, setPaymentType] = useState<PaymentType>(existingPayment?.paymentType ?? 'INTEREST_ONLY');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(existingPayment?.paymentMode ?? 'CASH');
  const [interestText, setInterestText] = useState(
    existingPayment ? String(existingPayment.interestPaid) : ''
  );
  const [principalText, setPrincipalText] = useState(
    existingPayment ? String(existingPayment.principalPaid) : ''
  );
  const [discountText, setDiscountText] = useState(
    existingPayment && existingPayment.discountWaived > 0 ? String(existingPayment.discountWaived) : ''
  );
  const [notes, setNotes] = useState(existingPayment?.notes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const breakdown = useMemo(
    () => (loan ? calculateLoan(loan, paymentsForCalc, policy, paymentDate) : null),
    [loan, paymentsForCalc, policy, paymentDate]
  );

  // The very first effect run would otherwise clobber the values just seeded
  // above from the existing payment with "suggested" fresh-collection ones.
  const skipNextAutoFill = useRef(isEditing);

  // Pre-fill sensible amounts whenever the category or date changes.
  useEffect(() => {
    if (skipNextAutoFill.current) {
      skipNextAutoFill.current = false;
      return;
    }
    if (!breakdown) return;
    if (paymentType === 'INTEREST_ONLY') {
      setInterestText(String(Math.round(breakdown.unpaidInterest)));
      setPrincipalText('');
      setDiscountText('');
    } else if (paymentType === 'PRINCIPAL_ONLY') {
      setInterestText('');
      setPrincipalText('');
    } else if (paymentType === 'COMBINED') {
      setInterestText(String(Math.round(breakdown.unpaidInterest)));
      setPrincipalText('');
    } else if (paymentType === 'FULL_SETTLEMENT') {
      setInterestText(String(Math.round(breakdown.unpaidInterest)));
      setPrincipalText(String(Math.round(breakdown.principalBalance)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentType, paymentDate, breakdown?.unpaidInterest, breakdown?.principalBalance]);

  if (!loan || !breakdown) {
    return (
      <>
        <AppBar title="Collect payment" />
        <Screen>
          <Loading />
        </Screen>
      </>
    );
  }

  const interestPaid = parseAmount(interestText);
  const principalPaid = parseAmount(principalText);
  const discountWaived = parseAmount(discountText);
  const total = interestPaid + principalPaid;
  const remainingPrincipal = Math.max(0, breakdown.principalBalance - principalPaid);
  const remainingInterest = Math.max(0, breakdown.unpaidInterest - interestPaid - discountWaived);
  const willClose =
    paymentType === 'FULL_SETTLEMENT' || (remainingPrincipal <= 0 && remainingInterest <= 0);

  const validate = (): string | null => {
    if (total <= 0 && discountWaived <= 0) return 'Enter an amount greater than zero.';
    if (principalPaid > breakdown.principalBalance + 0.5) {
      return `Principal payment cannot be more than the ${formatCurrency(
        breakdown.principalBalance,
        currency
      )} outstanding.`;
    }
    if (interestPaid + discountWaived > breakdown.unpaidInterest + 0.5) {
      return `Interest paid cannot exceed the ${formatCurrency(
        breakdown.unpaidInterest,
        currency
      )} pending. Put the extra in the principal box instead.`;
    }
    if (paymentDate < loan.loanDate) return 'Payment date cannot be before the pledge date.';
    if (paymentDate > todayString()) return 'Payment date cannot be in the future.';
    return null;
  };

  // useAsyncAction guards against a double tap creating two receipts.
  const save = useAsyncAction(async () => {
    const receiptNo = isEditing ? existingPayment!.receiptNo : await api.nextDocumentNo(loan.storeId, 'RECEIPT');

    const loanPatch = willClose
      ? { status: 'CLOSED' as const, closedAt: new Date().toISOString() }
      : loan.status === 'CLOSED'
      ? { status: 'ACTIVE' as const, closedAt: null }
      : undefined;

    const paymentFields = {
      storeId: loan.storeId,
      loanId: loan.id,
      customerId: loan.customerId,
      receiptNo,
      paymentDate,
      totalAmount: total,
      interestPaid,
      principalPaid,
      discountWaived,
      previousPrincipal: breakdown.principalBalance,
      remainingPrincipal,
      paymentType,
      paymentMode,
      notes,
    };

    const payment = isEditing
      ? await api.updatePayment(existingPayment!.id, paymentFields, loanPatch)
      : await api.createPayment(paymentFields, loanPatch);

    await refresh();

    Alert.alert(
      willClose ? 'Pledge settled' : isEditing ? 'Payment updated' : 'Payment recorded',
      `${formatCurrency(total, currency)} received. Receipt ${receiptNo}.` +
        (willClose ? '\n\nThe ornaments can now be released to the customer.' : ''),
      [
        {
          text: 'Print receipt',
          onPress: () => {
            try {
              if (store) {
                const updatedLoan = willClose ? { ...loan, status: 'CLOSED' as const } : loan;
                const after = calculateLoan(updatedLoan, [...paymentsForCalc, payment], policy, paymentDate);
                void printHtml(
                  paymentReceiptHtml({ store, loan: updatedLoan, customer, payment, breakdown: after })
                );
              }
            } catch (printError) {
              // The money is already recorded; a failed print must not look
              // like a failed payment.
              logError('CollectPayment.print', printError);
              toast.showInfo('Payment saved, but the receipt could not be printed.');
            }
            navigation.goBack();
          },
        },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]
    );
  }, { context: 'CollectPayment.save' });

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

  return (
    <>
      <AppBar
        title={isEditing ? 'Edit receipt' : 'Collect payment'}
        subtitle={
          isEditing
            ? `Correcting ${existingPayment!.receiptNo} · ${loan.loanNo}`
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

        <Card dark>
          <Row gap={spacing.sm}>
            <StatTile
              dark
              label="Principal outstanding"
              value={formatCurrency(breakdown.principalBalance, currency)}
            />
            <StatTile
              dark
              label="Interest pending"
              value={formatCurrency(breakdown.unpaidInterest, currency)}
              tone="success"
            />
          </Row>
          <Row gap={spacing.sm} style={{ marginTop: spacing.sm }}>
            <StatTile dark label="Running time" value={breakdown.monthsDisplay} />
            <StatTile
              dark
              label="Full settlement"
              value={formatCurrency(breakdown.totalSettlementAmount, currency)}
              tone="accent"
            />
          </Row>
        </Card>

        {breakdown.autoConverted && (
          <InfoBanner
            tone="warning"
            message={`This pledge is past ${policy.afterMonths} months, so the whole loan is priced as compound interest from its pledge date. Clearing the pending interest today stops it being added to the principal at the next cycle.`}
          />
        )}

        <SectionTitle title="What is the customer paying?" />
        <Card>
          <ChipGroup<PaymentType>
            value={paymentType}
            onChange={setPaymentType}
            columns={2}
            options={[
              { value: 'INTEREST_ONLY', label: 'Interest only', hint: 'Clear monthly dues' },
              { value: 'PRINCIPAL_ONLY', label: 'Principal only', hint: 'Reduce the loan' },
              { value: 'COMBINED', label: 'Interest + principal', hint: 'Both together' },
              { value: 'FULL_SETTLEMENT', label: 'Full settlement', hint: 'Close & release' },
            ]}
          />

          <Field
            label="Interest amount"
            prefix={currency}
            value={interestText}
            onChangeText={setInterestText}
            keyboardType="numeric"
            editable={paymentType !== 'PRINCIPAL_ONLY'}
            placeholder="0"
          />

          <Field
            label="Principal amount"
            prefix={currency}
            value={principalText}
            onChangeText={setPrincipalText}
            keyboardType="numeric"
            editable={paymentType !== 'INTEREST_ONLY'}
            placeholder="0"
          />

          {paymentType === 'FULL_SETTLEMENT' && (
            <Field
              label="Discount / interest waived (optional)"
              prefix={currency}
              value={discountText}
              onChangeText={setDiscountText}
              keyboardType="numeric"
              placeholder="0"
              hint="Goodwill rebate — reduces the interest owed without cash changing hands."
            />
          )}

          <DateField
            label="Payment date"
            value={paymentDate}
            onChange={setPaymentDate}
            minimumDate={loan.loanDate}
          />

          <ChipGroup<PaymentMode>
            label="Received by"
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

          <Field
            label="Remarks (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. GPay ref 98124"
          />
        </Card>

        <Card>
          <KeyValue label="Total received" value={formatCurrency(total, currency)} />
          <KeyValue
            label="Principal after payment"
            value={formatCurrency(remainingPrincipal, currency)}
          />
          <KeyValue
            label="Interest still pending"
            value={formatCurrency(remainingInterest, currency)}
          />
          {willClose && (
            <Text style={styles.closeNote}>
              This payment closes the pledge — remember to hand back the ornaments.
            </Text>
          )}
        </Card>

        <Button
          title={
            save.busy
              ? 'Saving…'
              : isEditing
              ? `Save changes · ${formatCurrency(total, currency)}`
              : `Save receipt · ${formatCurrency(total, currency)}`
          }
          onPress={handleSave}
          loading={save.busy}
          disabled={(total <= 0 && discountWaived <= 0) || !isOnline}
        />
        {!isOnline && (
          <Text style={styles.offlineNote}>
            Payments cannot be saved while offline — the ledger lives on the server so every phone
            in the shop stays in step.
          </Text>
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  closeNote: {
    marginTop: spacing.sm,
    fontSize: 11.5,
    color: neutral[600],
    fontWeight: '600',
    lineHeight: 16,
  },
  offlineNote: {
    marginTop: spacing.md,
    fontSize: 11,
    color: neutral[500],
    textAlign: 'center',
    lineHeight: 16,
  },
});
