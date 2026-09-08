import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateField } from '../components/DateField';
import { PhotoStrip } from '../components/PhotoStrip';
import {
  AppBar,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorBanner,
  Field,
  InfoBanner,
  KeyValue,
  Row,
  Screen,
  SectionTitle,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { AppNav, AppStackParamList } from '../navigation/types';
import * as api from '../services/api';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { InterestType, MetalType, PawnItem } from '../types/girvi';
import { addMonths, todayString } from '../utils/dates';
import { formatCurrency, formatGrams, parseAmount } from '../utils/format';
import { INTEREST_TYPE_OPTIONS, getInterestTypeLabel } from '../utils/interest';

const GOLD_PURITIES = ['22K (91.6% - 916)', '24K (99.9%)', '20K (83.3%)', '18K (75.0% - 750)', '14K (58.5%)'];
const SILVER_PURITIES = ['925 Sterling Silver', '999 Fine Silver', '800 Silver (80%)', '700 Silver (70%)'];

type DraftItem = Omit<PawnItem, 'id' | 'loanId'> & {
  key: string;
  /** Set only for an item that already exists in the database (edit mode) — tells save() to update it instead of inserting a new row. */
  id?: string;
  // Decimal input needs its own text source of truth — feeding a TextInput's
  // `value` from `String(parseAmount(text))` on every keystroke collapses
  // "45." back to "45" the instant it's typed, so the next digit lands right
  // after it ("452" instead of "45.2"). These stay in sync with the numeric
  // fields via patchItem but are what the inputs actually display.
  grossWeightText: string;
  netWeightText: string;
  valuationRateText: string;
};

const blankItem = (): DraftItem => ({
  key: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  itemName: '',
  metalType: 'GOLD',
  purity: GOLD_PURITIES[0],
  quantity: 1,
  grossWeight: 0,
  netWeight: 0,
  valuationRatePerGram: 0,
  estimatedValue: 0,
  photos: [],
  itemLockerLocation: '',
  itemDescription: '',
  addedWithTopupId: null,
  grossWeightText: '',
  netWeightText: '',
  valuationRateText: '',
});

const draftItemFromExisting = (item: PawnItem): DraftItem => ({
  ...item,
  key: item.id,
  grossWeightText: item.grossWeight ? String(item.grossWeight) : '',
  netWeightText: item.netWeight ? String(item.netWeight) : '',
  valuationRateText: item.valuationRatePerGram ? String(item.valuationRatePerGram) : '',
});

export const NewLoanScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<AppStackParamList, 'NewLoan'>>();
  const { accent } = useAccent();
  const { customers, loans, store, currency, refresh, loanById } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const editingLoanId = route.params?.loanId;
  const existingLoan = editingLoanId ? loanById(editingLoanId) : undefined;
  const isEditing = !!existingLoan;
  // Ids present on the loan when this screen opened — anything missing from
  // `items` at save time was removed in this session and needs deleting.
  const [originalItemIds] = useState<string[]>(() => existingLoan?.items.map((i) => i.id) ?? []);

  const [customerId, setCustomerId] = useState(existingLoan?.customerId ?? route.params?.customerId ?? '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [loanDate, setLoanDate] = useState(existingLoan?.loanDate ?? todayString());
  const [dueDate, setDueDate] = useState(
    existingLoan?.dueDate ?? addMonths(todayString(), 12)
  );
  const [principalText, setPrincipalText] = useState(
    existingLoan ? String(existingLoan.principalAmount) : ''
  );
  const [rateText, setRateText] = useState(
    String(existingLoan?.monthlyInterestRate ?? store?.defaultMonthlyRate ?? 2)
  );
  const [interestType, setInterestType] = useState<InterestType>(
    existingLoan?.interestType ?? store?.defaultInterestType ?? 'DAILY_PRO_RATA'
  );
  const [autoCompound, setAutoCompound] = useState<'DEFAULT' | 'ON' | 'OFF'>(
    existingLoan?.autoCompoundOverride === true
      ? 'ON'
      : existingLoan?.autoCompoundOverride === false
      ? 'OFF'
      : 'DEFAULT'
  );
  const [graceText, setGraceText] = useState(
    String(existingLoan?.gracePeriodDays ?? store?.defaultGracePeriodDays ?? 7)
  );
  const [pouch, setPouch] = useState(
    existingLoan?.vaultPouchNo ?? `POUCH-${String(loans.length + 1).padStart(3, '0')}`
  );
  const [notes, setNotes] = useState(existingLoan?.notes ?? '');
  const [items, setItems] = useState<DraftItem[]>(() =>
    existingLoan && existingLoan.items.length > 0
      ? existingLoan.items.map(draftItemFromExisting)
      : [blankItem()]
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const principal = parseAmount(principalText);
  const rate = parseAmount(rateText);

  const totals = useMemo(
    () => ({
      gross: items.reduce((sum, item) => sum + item.grossWeight, 0),
      net: items.reduce((sum, item) => sum + item.netWeight, 0),
      value: items.reduce((sum, item) => sum + item.estimatedValue, 0),
    }),
    [items]
  );

  const ltv = totals.value > 0 ? Math.round((principal / totals.value) * 100) : 0;

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.phone.includes(term) ||
          c.customerCode.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [customerSearch, customers]);

  const patchItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        next.estimatedValue = Math.round(next.netWeight * next.valuationRatePerGram);
        return next;
      })
    );
  };

  const validItems = items.filter((item) => item.itemName.trim() && item.netWeight > 0);

  const validate = (): string | null => {
    if (!store) return 'Shop details are still loading. Please wait a moment.';
    if (!customerId) return 'Choose the customer pledging these ornaments.';
    if (principal <= 0) return 'Enter the loan amount given to the customer.';
    if (principal > 100000000) return 'That loan amount looks too large — please check it.';
    if (rate <= 0 || rate > 20) return 'Enter a monthly interest rate between 0 and 20%.';
    if (validItems.length === 0) {
      return 'Add at least one ornament with a name and a net weight.';
    }
    const overweight = items.find(
      (item) => item.netWeight > 0 && item.grossWeight > 0 && item.netWeight > item.grossWeight
    );
    if (overweight) {
      return `"${overweight.itemName || 'An item'}" has a net weight higher than its gross weight.`;
    }
    if (dueDate < loanDate) return 'The due date cannot be before the pledge date.';
    return null;
  };

  const save = useAsyncAction(async () => {
    const activeStore = store!;
    const loanFields = {
      storeId: activeStore.id,
      customerId,
      loanDate,
      dueDate,
      principalAmount: principal,
      monthlyInterestRate: rate,
      interestType,
      autoCompoundOverride: autoCompound === 'DEFAULT' ? null : autoCompound === 'ON',
      gracePeriodDays: Math.round(parseAmount(graceText)),
      vaultPouchNo: pouch,
      notes,
    };

    if (isEditing && existingLoan) {
      await api.updateLoan(existingLoan.id, loanFields);

      const keptIds = new Set<string>();
      const newItems: Partial<PawnItem>[] = [];
      for (const { key, id, grossWeightText, netWeightText, valuationRateText, ...item } of validItems) {
        if (id) {
          keptIds.add(id);
          await api.updateLoanItem(id, activeStore.id, existingLoan.id, item);
        } else {
          newItems.push(item);
        }
      }
      const removedIds = originalItemIds.filter((id) => !keptIds.has(id));
      await Promise.all(removedIds.map((id) => api.deleteLoanItem(id)));
      if (newItems.length > 0) {
        await api.addLoanItems(activeStore.id, existingLoan.id, newItems);
      }

      await refresh();
      toast.showSuccess(`Pledge ${existingLoan.loanNo} updated.`);
      navigation.replace('LoanDetail', { loanId: existingLoan.id });
      return;
    }

    const loanNo = await api.nextDocumentNo(activeStore.id, 'LOAN');
    const loan = await api.createLoan(
      { ...loanFields, loanNo, status: 'ACTIVE' },
      validItems.map(({ key, id, grossWeightText, netWeightText, valuationRateText, ...item }) => item)
    );

    await refresh();
    toast.showSuccess(`Pledge ${loan.loanNo} created.`);
    navigation.replace('LoanDetail', { loanId: loan.id });
  }, { context: 'NewLoan.save' });

  const handleSave = async () => {
    const problem = validate();
    setValidationError(problem);
    if (problem) return;

    if (!isOnline) {
      toast.showError({ message: 'Network request failed' });
      return;
    }

    // Lending above the ornament valuation is legal but risky — confirm rather
    // than block, since the shopkeeper may have a reason.
    if (totals.value > 0 && principal > totals.value) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Loan is above valuation',
          `You are lending ${formatCurrency(principal, currency)} against ornaments valued at ${formatCurrency(
            totals.value,
            currency
          )}. Continue anyway?`,
          [
            { text: 'Go back', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;
    }

    void save.run();
  };

  const typeInfo = getInterestTypeLabel(interestType);

  if (editingLoanId && !existingLoan) {
    return (
      <>
        <AppBar title="Edit pledge" />
        <Screen>
          <EmptyState
            title="Pledge not found"
            message="It may have been deleted on another device. Go back and pull down to refresh."
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppBar
        title={isEditing ? 'Edit pledge' : 'New pledge'}
        subtitle={
          isEditing
            ? `Correcting ${existingLoan!.loanNo}`
            : 'Record ornaments taken in against a loan'
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

        {/* Customer */}
        <SectionTitle title="Customer" />
        <Card>
          <TextInput
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="Search by name, phone or code"
            placeholderTextColor={neutral[400]}
            style={styles.search}
          />

          {customers.length === 0 ? (
            <InfoBanner message="No customers yet — add one first, then come back to create the pledge." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {filteredCustomers.map((customer) => {
                const active = customer.id === customerId;
                return (
                  <Pressable
                    key={customer.id}
                    onPress={() => setCustomerId(customer.id)}
                    style={[
                      styles.customerChip,
                      active
                        ? { backgroundColor: accent.primary, borderColor: accent.primary }
                        : { backgroundColor: '#ffffff', borderColor: neutral[200] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.customerChipName,
                        { color: active ? accent.onPrimary : neutral[900] },
                      ]}
                    >
                      {customer.fullName}
                    </Text>
                    <Text
                      style={[
                        styles.customerChipMeta,
                        { color: active ? accent.onPrimary : neutral[500] },
                      ]}
                    >
                      {customer.phone || customer.customerCode}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Button
            title="+ Add a new customer"
            variant="ghost"
            small
            style={{ marginTop: spacing.md }}
            onPress={() => navigation.navigate('CustomerForm')}
          />
        </Card>

        {/* Ornaments */}
        <SectionTitle
          title={`Ornaments (${items.length})`}
          action={
            <Pressable onPress={() => setItems((prev) => [...prev, blankItem()])}>
              <Text style={[styles.addLink, { color: accent.primary }]}>+ Add item</Text>
            </Pressable>
          }
        />

        {items.map((item, index) => {
          const purities = item.metalType === 'SILVER' ? SILVER_PURITIES : GOLD_PURITIES;
          return (
            <Card key={item.key}>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={styles.itemHeading}>Item {index + 1}</Text>
                {items.length > 1 && (
                  <Pressable onPress={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}>
                    <Text style={styles.removeLink}>Remove</Text>
                  </Pressable>
                )}
              </Row>

              <Field
                label="Item name"
                value={item.itemName}
                onChangeText={(text) => patchItem(item.key, { itemName: text })}
                placeholder="e.g. Gold necklace (haar)"
              />

              <ChipGroup<MetalType>
                label="Metal"
                columns={4}
                value={item.metalType}
                onChange={(metal) =>
                  patchItem(item.key, {
                    metalType: metal,
                    purity: metal === 'SILVER' ? SILVER_PURITIES[0] : GOLD_PURITIES[0],
                  })
                }
                options={[
                  { value: 'GOLD', label: 'Gold' },
                  { value: 'SILVER', label: 'Silver' },
                  { value: 'DIAMOND_GOLD', label: 'Diamond' },
                  { value: 'OTHER', label: 'Other' },
                ]}
              />

              <ChipGroup<string>
                label="Purity"
                columns={2}
                value={item.purity}
                onChange={(purity) => patchItem(item.key, { purity })}
                options={purities.map((p) => ({ value: p, label: p }))}
              />

              <Row gap={spacing.sm}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Gross weight (g)"
                    value={item.grossWeightText}
                    onChangeText={(text) =>
                      patchItem(item.key, { grossWeightText: text, grossWeight: parseAmount(text) })
                    }
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Net weight (g)"
                    value={item.netWeightText}
                    onChangeText={(text) =>
                      patchItem(item.key, { netWeightText: text, netWeight: parseAmount(text) })
                    }
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    hint="After stone / thread"
                  />
                </View>
              </Row>

              <Row gap={spacing.sm}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Rate per gram"
                    prefix={currency}
                    value={item.valuationRateText}
                    onChangeText={(text) =>
                      patchItem(item.key, {
                        valuationRateText: text,
                        valuationRatePerGram: parseAmount(text),
                      })
                    }
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Quantity"
                    value={String(item.quantity)}
                    onChangeText={(text) =>
                      patchItem(item.key, { quantity: Math.max(1, Math.round(parseAmount(text))) })
                    }
                    keyboardType="numeric"
                  />
                </View>
              </Row>

              <KeyValue
                label="Estimated value"
                value={formatCurrency(item.estimatedValue, currency)}
              />

              <Field
                label="Locker / pouch location"
                value={item.itemLockerLocation}
                onChangeText={(text) => patchItem(item.key, { itemLockerLocation: text })}
                placeholder="e.g. Vault locker A-04"
              />

              {store && (
                <PhotoStrip
                  storeId={store.id}
                  folder="items"
                  paths={item.photos}
                  onChange={(photos) => patchItem(item.key, { photos })}
                  label="Ornament photos"
                />
              )}
            </Card>
          );
        })}

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.totalsText}>Gross {formatGrams(totals.gross)}</Text>
            <Text style={styles.totalsText}>Net {formatGrams(totals.net)}</Text>
            <Text style={[styles.totalsText, { color: accent.primary }]}>
              {formatCurrency(totals.value, currency)}
            </Text>
          </Row>
        </Card>

        {/* Loan terms */}
        <SectionTitle title="Loan terms" />
        <Card>
          <Field
            label="Loan amount given"
            prefix={currency}
            value={principalText}
            onChangeText={setPrincipalText}
            keyboardType="numeric"
            placeholder="0"
            hint={
              totals.value > 0
                ? `${ltv}% of the ornament valuation${ltv > 75 ? ' — that is on the high side' : ''}`
                : undefined
            }
          />

          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Field
                label="Monthly interest rate (%)"
                value={rateText}
                onChangeText={setRateText}
                keyboardType="numeric"
                placeholder="2.0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Grace period (days)"
                value={graceText}
                onChangeText={setGraceText}
                keyboardType="numeric"
              />
            </View>
          </Row>

          <DateField label="Pledge date" value={loanDate} onChange={setLoanDate} />
          <DateField
            label="Due date"
            value={dueDate}
            onChange={setDueDate}
            minimumDate={loanDate}
          />

          <ChipGroup<InterestType>
            label="Interest method"
            columns={1}
            value={interestType}
            onChange={setInterestType}
            options={INTEREST_TYPE_OPTIONS.map((type) => {
              const info = getInterestTypeLabel(type);
              return { value: type, label: `${info.name} — ${info.hindi}`, hint: info.frequencyDesc };
            })}
          />

          {!typeInfo.isCompound && (
            <ChipGroup<'DEFAULT' | 'ON' | 'OFF'>
              label={`Recalculate as compound if it runs past ${store?.autoCompoundAfterMonths ?? 24} months`}
              columns={3}
              value={autoCompound}
              onChange={setAutoCompound}
              options={[
                {
                  value: 'DEFAULT',
                  label: 'Shop default',
                  hint: store?.autoCompoundEnabled ? 'On' : 'Off',
                },
                { value: 'ON', label: 'Always on' },
                { value: 'OFF', label: 'Never' },
              ]}
            />
          )}

          <Field
            label="Vault pouch number"
            value={pouch}
            onChangeText={setPouch}
            placeholder="POUCH-001"
          />

          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. pouch sealed in customer's presence"
            multiline
          />
        </Card>

        <Button
          title={
            save.busy ? 'Saving…' : isEditing ? 'Save changes' : 'Save pledge & open ledger'
          }
          onPress={() => void handleSave()}
          loading={save.busy}
          disabled={!isOnline}
        />
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  search: {
    backgroundColor: neutral[50],
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
  customerChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 130,
  },
  customerChipName: { fontSize: 12.5, fontWeight: '800' },
  customerChipMeta: { fontSize: 10.5, marginTop: 2 },
  itemHeading: { fontSize: 13, fontWeight: '800', color: neutral[900] },
  removeLink: { fontSize: 11.5, fontWeight: '700', color: '#e11d48' },
  addLink: { fontSize: 12, fontWeight: '800' },
  totalsText: { fontSize: 12.5, fontWeight: '800', color: neutral[700] },
});
