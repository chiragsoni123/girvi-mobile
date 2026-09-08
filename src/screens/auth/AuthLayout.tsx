import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { neutral, radius, spacing } from '../../theme';
import { useAccent } from '../../theme/AccentContext';

/**
 * The dark "vault portal" shell shared by every signed-out screen —
 * the RN version of the web prototype's gold-glow auth card.
 */
export const AuthLayout: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, subtitle, children, footer }) => {
  const { accent } = useAccent();

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* decorative glow */}
          <View
            pointerEvents="none"
            style={[styles.glow, styles.glowTop, { backgroundColor: accent.primary }]}
          />
          <View
            pointerEvents="none"
            style={[styles.glow, styles.glowBottom, { backgroundColor: accent.secondary }]}
          />

          <View style={[styles.logo, { backgroundColor: accent.primary }]}>
            <Text style={[styles.logoText, { color: accent.onPrimary }]}>₹</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          <View style={styles.card}>{children}</View>

          {!!footer && <View style={styles.footer}>{footer}</View>}

          <Text style={styles.legal}>
            Girvi Pawn Manager · encrypted cloud ledger for gold & silver pledges
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neutral[950] },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.13,
  },
  glowTop: { top: -70, left: -80 },
  glowBottom: { bottom: -60, right: -70 },
  logo: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: { fontSize: 28, fontWeight: '900' },
  title: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: neutral[400],
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.xl,
    lineHeight: 18,
  },
  card: {
    backgroundColor: neutral[900],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: neutral[800],
    padding: spacing.xl,
  },
  footer: { marginTop: spacing.lg, alignItems: 'center', gap: spacing.sm },
  legal: {
    color: neutral[600],
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

export const authStyles = StyleSheet.create({
  link: { fontSize: 12.5, fontWeight: '700' },
  helper: { color: neutral[400], fontSize: 12, textAlign: 'center', lineHeight: 18 },
  label: { color: neutral[300], fontSize: 11.5, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: neutral[950],
    borderWidth: 1,
    borderColor: neutral[700],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    minHeight: 50,
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlignVertical: 'center',
  },
  inputError: { borderColor: '#e11d48' },
});
