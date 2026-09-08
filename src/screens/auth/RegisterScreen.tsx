import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, ErrorBanner, InfoBanner } from '../../components/ui';
import { PendingStoreIntent, useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { AuthNav } from '../../navigation/types';
import { neutral, radius, spacing } from '../../theme';
import { useAccent } from '../../theme/AccentContext';
import { AuthLayout, authStyles } from './AuthLayout';

type Mode = 'CREATE' | 'JOIN';

export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<AuthNav>();
  const { signUp } = useAuth();
  const { accent } = useAccent();
  const { isOnline } = useNetwork();

  const [mode, setMode] = useState<Mode>('CREATE');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [storeCode, setStoreCode] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Please enter your name.';
    if (!email.trim()) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'That email address does not look valid.';
    }
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return 'Use at least one letter and one number in your password.';
    }
    if (password !== confirmPassword) return 'The two passwords do not match.';
    if (mode === 'CREATE' && !shopName.trim()) return 'Please enter your shop name.';
    if (mode === 'JOIN' && !/^[A-Z0-9]{6}$/.test(storeCode.trim().toUpperCase())) {
      return 'The store code is exactly 6 letters and numbers.';
    }
    return null;
  };

  const register = useAsyncAction(async () => {
    const intent: PendingStoreIntent =
      mode === 'CREATE'
        ? { mode: 'CREATE', shopName: shopName.trim(), fullName: fullName.trim(), phone, city }
        : { mode: 'JOIN', storeCode: storeCode.trim().toUpperCase(), fullName: fullName.trim() };

    const { needsEmailConfirmation } = await signUp({
      email,
      password,
      fullName: fullName.trim(),
      intent,
    });

    if (needsEmailConfirmation) {
      setNotice(
        `We sent a confirmation link to ${email.trim()}. Tap it, then sign in — your shop will be set up automatically.`
      );
    }
    // Without confirmation the auth listener swaps the navigator for us.
  }, { context: 'Register.signUp' });

  const handleRegister = () => {
    setNotice(null);
    const problem = validate();
    setValidationError(problem);
    if (problem) return;
    void register.run();
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start a new shop ledger, or join one that already exists"
      footer={
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={authStyles.helper}>
            Already registered?{' '}
            <Text style={[authStyles.link, { color: accent.onDark }]}>Sign in</Text>
          </Text>
        </Pressable>
      }
    >
      <ErrorBanner message={validationError} />
      <ErrorBanner message={register.error} onRetry={() => void register.run()} />
      {!!notice && <InfoBanner message={notice} tone="success" />}

      {/* Mode switch */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        {(
          [
            { id: 'CREATE' as Mode, title: 'Create new shop', hint: 'I am the owner' },
            { id: 'JOIN' as Mode, title: 'Join a shop', hint: 'I have a store code' },
          ]
        ).map((option) => {
          const active = mode === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => {
                setMode(option.id);
                setValidationError(null);
              }}
              style={{
                flex: 1,
                borderRadius: radius.md,
                borderWidth: 1,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                backgroundColor: active ? accent.primary : neutral[950],
                borderColor: active ? accent.primary : neutral[700],
              }}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '800',
                  color: active ? accent.onPrimary : neutral[200],
                }}
              >
                {option.title}
              </Text>
              <Text
                style={{
                  fontSize: 10.5,
                  marginTop: 2,
                  color: active ? accent.onPrimary : neutral[500],
                }}
              >
                {option.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={authStyles.label}>Your name</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        placeholder="e.g. Rahul Soni"
        placeholderTextColor={neutral[600]}
        style={authStyles.input}
      />

      <Text style={authStyles.label}>Email address</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={neutral[600]}
        autoCapitalize="none"
        keyboardType="email-address"
        style={authStyles.input}
      />

      <Text style={authStyles.label}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        placeholderTextColor={neutral[600]}
        secureTextEntry
        autoCapitalize="none"
        style={authStyles.input}
      />

      <Text style={authStyles.label}>Confirm password</Text>
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Re-enter password"
        placeholderTextColor={neutral[600]}
        secureTextEntry
        autoCapitalize="none"
        style={authStyles.input}
      />

      {mode === 'CREATE' ? (
        <>
          <Text style={authStyles.label}>Shop name</Text>
          <TextInput
            value={shopName}
            onChangeText={setShopName}
            placeholder="e.g. Shree Radhe Jewellers"
            placeholderTextColor={neutral[600]}
            style={authStyles.input}
          />

          <Text style={authStyles.label}>City</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Jaipur"
            placeholderTextColor={neutral[600]}
            style={authStyles.input}
          />

          <Text style={authStyles.label}>Shop phone (optional)</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            placeholderTextColor={neutral[600]}
            keyboardType="phone-pad"
            style={authStyles.input}
          />

          <Text style={[authStyles.helper, { textAlign: 'left', marginBottom: spacing.lg }]}>
            You'll get a 6-character store code after signing up. Share it with your staff so they
            can join this same ledger.
          </Text>
        </>
      ) : (
        <>
          <Text style={authStyles.label}>Store code</Text>
          <TextInput
            value={storeCode}
            onChangeText={(text) => setStoreCode(text.toUpperCase())}
            placeholder="e.g. K7QM4T"
            placeholderTextColor={neutral[600]}
            autoCapitalize="characters"
            maxLength={6}
            style={[
              authStyles.input,
              { letterSpacing: 6, fontSize: 18, textAlign: 'center', fontWeight: '800' },
            ]}
          />
          <Text style={[authStyles.helper, { textAlign: 'left', marginBottom: spacing.lg }]}>
            Ask the shop owner for this code — it's on their Settings screen.
          </Text>
        </>
      )}

      <Button
        title={
          register.busy
            ? 'Creating your account…'
            : mode === 'CREATE'
            ? 'Create account & shop'
            : 'Create account & join shop'
        }
        onPress={handleRegister}
        loading={register.busy}
        disabled={!isOnline}
      />
    </AuthLayout>
  );
};
