import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, ErrorBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { AuthNav } from '../../navigation/types';
import { neutral, spacing } from '../../theme';
import { useAccent } from '../../theme/AccentContext';
import { AuthLayout, authStyles } from './AuthLayout';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<AuthNav>();
  const { signIn } = useAuth();
  const { accent } = useAccent();
  const { isOnline } = useNetwork();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const login = useAsyncAction(
    async () => {
      await signIn(email, password);
      // On success the auth listener swaps the navigator out from under us.
    },
    { context: 'Login.signIn' }
  );

  const handleSignIn = () => {
    setValidationError(null);
    if (!email.trim()) return setValidationError('Please enter your email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setValidationError('That email address does not look valid.');
    }
    if (!password) return setValidationError('Please enter your password.');
    void login.run();
  };

  return (
    <AuthLayout
      title="Girvi Pawn Manager"
      subtitle="Sign in to your shop's gold & silver pledge ledger"
      footer={
        <Pressable onPress={() => navigation.navigate('Register')}>
          <Text style={authStyles.helper}>
            New here?{' '}
            <Text style={[authStyles.link, { color: accent.onDark }]}>
              Create an account or join a shop
            </Text>
          </Text>
        </Pressable>
      }
    >
      <ErrorBanner message={validationError} />
      <ErrorBanner message={login.error} onRetry={handleSignIn} />

      <Text style={authStyles.label}>Email address</Text>
      <TextInput
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setValidationError(null);
        }}
        placeholder="you@example.com"
        placeholderTextColor={neutral[600]}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={authStyles.input}
      />

      <Text style={authStyles.label}>Password</Text>
      <View>
        <TextInput
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setValidationError(null);
          }}
          placeholder="Your password"
          placeholderTextColor={neutral[600]}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="password"
          style={authStyles.input}
          onSubmitEditing={handleSignIn}
          returnKeyType="go"
        />
        <Pressable
          onPress={() => setShowPassword((prev) => !prev)}
          style={{ position: 'absolute', right: 12, top: 11 }}
          hitSlop={10}
        >
          <Text style={{ color: neutral[400], fontSize: 11.5, fontWeight: '700' }}>
            {showPassword ? 'HIDE' : 'SHOW'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigation.navigate('ForgotPassword', { email })}
        style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}
        hitSlop={8}
      >
        <Text style={[authStyles.link, { color: accent.onDark }]}>Forgot password?</Text>
      </Pressable>

      <Button
        title={login.busy ? 'Signing in…' : 'Sign In'}
        onPress={handleSignIn}
        loading={login.busy}
        disabled={!isOnline}
      />
    </AuthLayout>
  );
};
