import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import {
  AppBar,
  Button,
  Card,
  ChipGroup,
  ErrorBanner,
  Field,
  InfoBanner,
  Screen,
  SectionTitle,
  ToggleRow,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { logError } from '../lib/errors';
import {
  BiometricCapability,
  clearLockPin,
  getAutoLockMinutes,
  getBiometricCapability,
  hasLockPin,
  isBiometricLockEnabled,
  promptBiometric,
  setAutoLockMinutes,
  setBiometricLockEnabled,
  setLockPin,
} from '../lib/security';
import { AppNav } from '../navigation/types';
import { neutral, spacing } from '../theme';

export const SecurityLockScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { lockNow } = useAuth();
  const toast = useToast();

  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cap, on, hasPin, mins] = await Promise.all([
          getBiometricCapability(),
          isBiometricLockEnabled(),
          hasLockPin(),
          getAutoLockMinutes(),
        ]);
        setCapability(cap);
        setEnabled(on);
        setPinSet(hasPin);
        setMinutes(mins);
      } catch (err) {
        logError('SecurityLock.load', err);
        setError('Could not read the lock settings from this phone.');
      }
    })();
  }, []);

  const toggleLock = async (next: boolean) => {
    setError(null);
    setNotice(null);

    if (next) {
      if (!capability?.hasHardware) {
        setError('This phone has no fingerprint or face sensor. Set a PIN instead.');
        return;
      }
      if (!capability.isEnrolled) {
        setError(
          'No fingerprint or face is registered on this phone. Add one in Android Settings → Security, then come back.'
        );
        return;
      }
      const ok = await promptBiometric('Confirm to turn on the app lock');
      if (!ok) {
        setError('Biometric check failed — the lock was not switched on.');
        return;
      }
      if (!(await hasLockPin())) {
        setNotice('Lock is on. Set a backup PIN below in case the sensor ever fails.');
      }
    }

    try {
      await setBiometricLockEnabled(next);
      setEnabled(next);
    } catch (err) {
      logError('SecurityLock.toggle', err);
      setError('Could not save that setting on this phone. Please try again.');
    }
  };

  const savePin = async () => {
    setError(null);
    setNotice(null);
    if (!/^\d{4}$|^\d{6}$/.test(pin)) return setError('PIN must be 4 or 6 digits.');
    if (/^(\d)\1+$/.test(pin)) return setError('Avoid a PIN with all the same digit.');
    if (pin === '1234' || pin === '123456') return setError('That PIN is too easy to guess.');
    if (pin !== confirmPin) return setError('The two PINs do not match.');

    try {
      await setLockPin(pin);
      setPinSet(true);
      setPin('');
      setConfirmPin('');
      setNotice('Backup PIN saved on this phone.');
      toast.showSuccess('Backup PIN saved.');
    } catch (err) {
      logError('SecurityLock.savePin', err);
      setError('Could not save the PIN to this phone’s secure storage.');
    }
  };

  const removePin = () => {
    Alert.alert('Remove backup PIN?', 'You will only be able to unlock with biometrics.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearLockPin();
            setPinSet(false);
            setNotice('Backup PIN removed.');
          } catch (err) {
            logError('SecurityLock.removePin', err);
            setError('Could not remove the PIN. Please try again.');
          }
        },
      },
    ]);
  };

  const changeMinutes = async (value: number) => {
    setMinutes(value);
    try {
      await setAutoLockMinutes(value);
    } catch (err) {
      logError('SecurityLock.setMinutes', err);
      setError('Could not save that setting on this phone.');
    }
  };

  return (
    <>
      <AppBar
        title="App lock"
        subtitle="Protect the ledger on this phone"
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <ErrorBanner message={error} />
        {!!notice && <InfoBanner tone="success" message={notice} />}

        <Card>
          <ToggleRow
            label={capability?.label ?? 'Biometric unlock'}
            description="Ask for fingerprint or face before opening the ledger, and again whenever the app has been in the background."
            value={enabled}
            onChange={(next) => void toggleLock(next)}
          />
          {capability && !capability.isEnrolled && (
            <Text style={styles.hint}>
              No biometrics are registered on this phone yet.
            </Text>
          )}
        </Card>

        <SectionTitle title="Lock after" />
        <Card>
          <ChipGroup<string>
            columns={4}
            value={String(minutes)}
            onChange={(value) => void changeMinutes(parseInt(value, 10))}
            options={[
              { value: '0', label: 'Instantly' },
              { value: '1', label: '1 min' },
              { value: '5', label: '5 min' },
              { value: '15', label: '15 min' },
            ]}
          />
          <Text style={styles.hint}>
            How long the app may sit in the background before it asks to unlock again.
          </Text>
        </Card>

        <SectionTitle title={pinSet ? 'Backup PIN (set)' : 'Backup PIN'} />
        <Card>
          <Text style={styles.hint}>
            A 4 or 6 digit PIN used when the fingerprint sensor does not read — wet hands are a real
            problem behind a counter. The PIN is hashed and stored only on this phone.
          </Text>

          <Field
            label="New PIN"
            value={pin}
            onChangeText={(text) => setPin(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="••••"
          />
          <Field
            label="Confirm PIN"
            value={confirmPin}
            onChangeText={(text) => setConfirmPin(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="••••"
          />
          <Button title={pinSet ? 'Change PIN' : 'Set PIN'} onPress={() => void savePin()} />
          {pinSet && (
            <Button
              title="Remove PIN"
              variant="ghost"
              style={{ marginTop: spacing.sm }}
              onPress={removePin}
            />
          )}
        </Card>

        <Button
          title="Lock the app now"
          variant="dark"
          onPress={() => {
            lockNow();
            navigation.goBack();
          }}
        />
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  hint: { fontSize: 11.5, color: neutral[500], lineHeight: 17, marginBottom: spacing.md },
});
