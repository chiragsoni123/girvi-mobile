import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateField } from '../components/DateField';
import {
  AppBar,
  Card,
  ChipGroup,
  Field,
  KeyValue,
  Row,
  Screen,
  SectionTitle,
  StatTile,
  ToggleRow,
} from '../components/ui';
import { useData } from '../context/DataContext';
import { AppNav } from '../navigation/types';
import { neutral, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { InterestType } from '../types/girvi';
import { addMonths, todayString } from '../utils/dates';
import { formatCurrency, formatDate, parseAmount } from '../utils/format';
import { INTEREST_TYPE_OPTIONS, getInterestTypeLabel, simulateInterest } from '../utils/interest';

/**
 * Standalone what-if calculator — the same engine the loans use, so a quote
 * given across the counter always matches the ledger.
 */
export const CalculatorScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent } = useAccent();
  const { currency, policy } = useData();

  const [principalText, setPrincipalText] = useState('100000');
  const [rateText, setRateText] = useState('2');
  const [fromDate, setFromDate] = useState(addMonths(todayString(), -12));
  const [toDate, setToDate] = useState(todayString());
  const [interestType, setInterestType] = useState<InterestType>('DAILY_PRO_RATA');
  const [autoConvert, setAutoConvert] = useState(policy.autoConvertEnabled);

  const principal = parseAmount(principalText);
  const rate = parseAmount(rateText);

  const result = useMemo(
    () =>
      simulateInterest({
        principal,
        monthlyRatePct: rate,
        fromDate,
        toDate,
        interestType,
        policy,
        autoConvert,
      }),
    [autoConvert, fromDate, interestType, policy, principal, rate, toDate]
  );

  const quickPeriods = [
    { label: '6 months', months: 6 },
    { label: '1 year', months: 12 },
    { label: '2 years', months: 24 },
    { label: '3 years', months: 36 },
  ];

  return (
    <>
      <AppBar
        title="Interest calculator"
        subtitle="Simple vs compound, before you quote"
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <Card>
          <Row gap={spacing.sm}>
            <View style={{ flex: 2 }}>
              <Field
                label="Loan amount"
                prefix={currency}
                value={principalText}
                onChangeText={setPrincipalText}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Rate % / month"
                value={rateText}
                onChangeText={setRateText}
                keyboardType="numeric"
              />
            </View>
          </Row>

          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} minimumDate={fromDate} />

          <Row gap={spacing.sm} style={{ flexWrap: 'wrap', marginBottom: spacing.md }}>
            {quickPeriods.map((period) => (
              <Pressable
                key={period.label}
                onPress={() => setToDate(addMonths(fromDate, period.months))}
                style={[styles.quickChip, { borderColor: accent.primary }]}
              >
                <Text style={[styles.quickChipText, { color: accent.softText }]}>{period.label}</Text>
              </Pressable>
            ))}
          </Row>

          <ChipGroup<InterestType>
            label="Method"
            columns={1}
            value={interestType}
            onChange={setInterestType}
            options={INTEREST_TYPE_OPTIONS.map((type) => {
              const info = getInterestTypeLabel(type);
              return { value: type, label: info.name, hint: info.frequencyDesc };
            })}
          />

          {!getInterestTypeLabel(interestType).isCompound && (
            <ToggleRow
              label={`Auto convert after ${policy.afterMonths} months`}
              description={`Simple until then, ${policy.frequency.toLowerCase()} compounding after.`}
              value={autoConvert}
              onChange={setAutoConvert}
            />
          )}
        </Card>

        <SectionTitle title="Result" />
        <Card dark>
          <Row gap={spacing.sm}>
            <StatTile dark label="Interest" value={formatCurrency(result.totalAccruedInterest, currency)} tone="success" />
            <StatTile
              dark
              label="Total payable"
              value={formatCurrency(result.totalSettlementAmount, currency)}
              tone="accent"
            />
          </Row>

          <View style={{ marginTop: spacing.md }}>
            <KeyValue dark label="Period" value={`${result.daysElapsed} days (${result.monthsDisplay})`} />
            <KeyValue dark label="Principal at end" value={formatCurrency(result.principalBalance, currency)} />
            <KeyValue
              dark
              label="If kept fully simple"
              value={formatCurrency(result.simpleInterestComparison, currency)}
            />
            {result.compoundExtraInterest > 0 && (
              <KeyValue
                dark
                label="Extra from compounding"
                value={`+ ${formatCurrency(result.compoundExtraInterest, currency)}`}
              />
            )}
            {result.capitalizedInterest > 0 && (
              <KeyValue
                dark
                label="Interest added to principal"
                value={formatCurrency(result.capitalizedInterest, currency)}
              />
            )}
            {result.conversionDate && (
              <KeyValue dark label="Converts on" value={formatDate(result.conversionDate)} />
            )}
          </View>
        </Card>

        <Card>
          <Text style={styles.explain}>
            {result.autoConverted
              ? `This loan passed ${policy.afterMonths} months on ${formatDate(
                  result.conversionDate
                )}, so it is priced as ${policy.frequency.toLowerCase()} compound interest for its whole life — every cycle back to the start date. Had it stayed simple the interest would be ${formatCurrency(
                  result.simpleInterestComparison,
                  currency
                )}.`
              : getInterestTypeLabel(result.effectiveInterestType).isCompound
              ? `Interest is added to the principal ${getInterestTypeLabel(
                  result.effectiveInterestType
                ).frequencyDesc.toLowerCase()}, so each cycle earns on a larger base.`
              : 'Straight-line interest on the outstanding principal — nothing is added to the principal.'}
          </Text>
        </Card>
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  quickChipText: { fontSize: 11.5, fontWeight: '800' },
  explain: { fontSize: 12, color: neutral[600], lineHeight: 18 },
});
