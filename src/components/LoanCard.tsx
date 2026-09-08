import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { neutral, radius, semantic, shadow, spacing, STATUS_COLORS } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { Customer, GirviLoan } from '../types/girvi';
import { formatCurrency, formatDate, formatGrams } from '../utils/format';
import { LoanBreakdown, getInterestTypeLabel } from '../utils/interest';

export const LoanCard: React.FC<{
  loan: GirviLoan;
  customer?: Customer;
  breakdown: LoanBreakdown;
  currency: string;
  onPress: () => void;
}> = ({ loan, customer, breakdown, currency, onPress }) => {
  const { accent } = useAccent();
  const isClosed = loan.status === 'CLOSED';
  const statusKey = isClosed ? 'CLOSED' : breakdown.isOverdue ? 'OVERDUE' : loan.status;
  const status = STATUS_COLORS[statusKey] ?? STATUS_COLORS.ACTIVE;

  const netWeight = loan.items.reduce((sum, item) => sum + item.netWeight, 0);
  const typeInfo = getInterestTypeLabel(breakdown.effectiveInterestType);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.loanNo, { color: accent.primary }]}>{loan.loanNo}</Text>
          <Text style={styles.customer} numberOfLines={1}>
            {customer?.fullName ?? 'Unknown customer'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatDate(loan.loanDate)} · {formatGrams(netWeight)} net · {loan.vaultPouchNo || 'No pouch'}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.status, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>
              {isClosed ? 'CLOSED' : breakdown.isOverdue ? 'OVERDUE' : 'ACTIVE'}
            </Text>
          </View>
          {breakdown.autoConverted && (
            <View style={[styles.status, { backgroundColor: semantic.warningSoft }]}>
              <Text style={[styles.statusText, { color: semantic.warningText }]}>COMPOUNDED</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.figures}>
        <Figure label="Principal" value={formatCurrency(breakdown.principalBalance, currency)} />
        <Figure
          label="Interest due"
          value={formatCurrency(breakdown.unpaidInterest, currency)}
          color={semantic.success}
        />
        <Figure
          label="Settlement"
          value={formatCurrency(breakdown.totalSettlementAmount, currency)}
          color={accent.primary}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {loan.monthlyInterestRate}% / month · {typeInfo.badge}
        </Text>
        <Text style={styles.footerText}>{breakdown.monthsDisplay}</Text>
      </View>

      {breakdown.topUpTotal > 0 && (
        <Text style={[styles.topUpNote, { color: accent.softText, backgroundColor: accent.soft }]}>
          Includes {formatCurrency(breakdown.topUpTotal, currency)} added later
        </Text>
      )}
    </Pressable>
  );
};

const Figure: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.figureLabel}>{label}</Text>
    <Text style={[styles.figureValue, color ? { color } : null]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: neutral[200],
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', gap: spacing.md },
  loanNo: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  customer: { fontSize: 15, fontWeight: '800', color: neutral[900], marginTop: 1 },
  meta: { fontSize: 11, color: neutral[500], marginTop: 2 },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.5 },
  figures: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: neutral[100],
  },
  figureLabel: { fontSize: 10, color: neutral[500], fontWeight: '600' },
  figureValue: { fontSize: 14, fontWeight: '800', color: neutral[900], marginTop: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  footerText: { fontSize: 10.5, color: neutral[400], fontWeight: '600' },
  topUpNote: {
    marginTop: spacing.sm,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
});
