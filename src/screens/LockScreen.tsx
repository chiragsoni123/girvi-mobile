import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import {
  getBiometricCapability,
  hasLockPin,
  promptBiometric,
  verifyLockPin,
} from '../lib/security';
import { neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'];

/**
 * Full-screen gate shown over an already signed-in session.
 * Biometric first; the PIN is the fallback when the sensor fails or the
 * shopkeeper's hands are wet — a real problem behind a jeweller's counter.
 */
export const LockScreen: React.FC = () => {
  const { unlock, signOut, activeStore } = useAuth();
  const { accent } = useAccent();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric unlock');
  const [showPinPad, setShowPinPad] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const runBiometric = useCallback(async () => {
    const ok = await promptBiometric('Unlock your Girvi ledger');
    if (ok) {
      setError(null);
      unlock();
    } else {
      setError('Biometric check cancelled. Use your PIN or try again.');
      setShowPinPad(true);
    }
  }, [unlock]);

  useEffect(() => {
    (async () => {
      const [capability, hasPin] = await Promise.all([getBiometricCapability(), hasLockPin()]);
      setBiometricLabel(capability.label);
      setPinAvailable(hasPin);

      if (capability.hasHardware && capability.isEnrolled) {
        void runBiometric();
      } else {
        setShowPinPad(true);
      }
    })();
  }, [runBiometric]);

  const submitPin = useCallback(
    async (value: string) => {
      const ok = await verifyLockPin(value);
      if (ok) {
        setPin('');
        setError(null);
        unlock();
      } else {
        setPin('');
        setAttempts((n) => n + 1);
        setError('Wrong PIN. Please try again.');
      }
    },
    [unlock]
  );

  const handleKey = (key: string) => {
    setError(null);
    if (key === 'CLR') return setPin('');
    if (key === 'DEL') return setPin((prev) => prev.slice(0, -1));
    if (pin.length >= 6) return;

    const next = pin + key;
    setPin(next);
    if (next.length === 4 || next.length === 6) void submitPin(next);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <View style={[styles.logo, { backgroundColor: accent.primary }]}>
          <Text style={[styles.logoText, { color: accent.onPrimary }]}>₹</Text>
        </View>

        <Text style={styles.shopName}>{activeStore?.shopName ?? 'Girvi Pawn Manager'}</Text>
        <Text style={styles.locked}>Ledger locked</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {showPinPad && pinAvailable && (
          <>
            <View style={styles.dots}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index < pin.length && { backgroundColor: accent.primary, borderColor: accent.primary },
                  ]}
                />
              ))}
            </View>

            <View style={styles.keypad}>
              {KEYPAD.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => handleKey(key)}
                  style={({ pressed }) => [
                    styles.key,
                    key === 'CLR' || key === 'DEL' ? styles.keyMuted : null,
                    pressed && { backgroundColor: accent.primary },
                  ]}
                >
                  <Text style={[styles.keyText, (key === 'CLR' || key === 'DEL') && styles.keyTextSmall]}>
                    {key}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {showPinPad && !pinAvailable && (
          <Text style={styles.helper}>
            No unlock PIN is set on this phone. Use {biometricLabel.toLowerCase()}, or sign out and
            sign in again.
          </Text>
        )}

        <Pressable onPress={() => void runBiometric()} style={styles.action}>
          <Text style={[styles.actionText, { color: accent.onDark }]}>Use {biometricLabel}</Text>
        </Pressable>

        {(attempts >= 3 || !pinAvailable) && (
          <Pressable onPress={() => void signOut()} style={styles.action}>
            <Text style={styles.signOut}>Sign out of this account</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neutral[950] },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 27, fontWeight: '900' },
  shopName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  locked: { color: neutral[500], fontSize: 12, marginTop: 4, marginBottom: spacing.xl },
  error: {
    color: '#fb7185',
    fontSize: 12,
    marginBottom: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  dot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: neutral[700],
    backgroundColor: neutral[800],
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 260,
    gap: 10,
    justifyContent: 'center',
  },
  key: {
    width: 78,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: neutral[800],
    borderWidth: 1,
    borderColor: neutral[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyMuted: { backgroundColor: 'transparent' },
  keyText: { color: '#ffffff', fontSize: 21, fontWeight: '700' },
  keyTextSmall: { fontSize: 12, color: neutral[400], fontWeight: '700' },
  helper: {
    color: neutral[400],
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
  action: { marginTop: spacing.xl, padding: spacing.sm },
  actionText: { fontSize: 13, fontWeight: '800' },
  signOut: { color: neutral[500], fontSize: 12, fontWeight: '600' },
});
