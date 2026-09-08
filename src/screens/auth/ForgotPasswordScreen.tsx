import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { Button, ErrorBanner, InfoBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { AuthNav, AuthStackParamList } from '../../navigation/types';
import { neutral } from '../../theme';
import { useAccent } from '../../theme/AccentContext';
import { AuthLayout, authStyles } from './AuthLayout';

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<AuthNav>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ForgotPassword'>>();
  const { sendPasswordReset } = useAuth();
  const { accent } = useAccent();
  const { isOnline } = useNetwork();

  const [email, setEmail] = useState(route.params?.email ?? '');
  const [sent, setSent] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const send = useAsyncAction(
    async () => {
      await sendPasswordReset(email);
      setSent(true);
    },
    { context: 'ForgotPassword.send' }
  );

  const handleSend = () => {
    setValidationError(null);
    if (!email.trim()) {
      return setValidationError('Please enter the email address you registered with.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setValidationError('That email address does not look valid.');
    }
    void send.run();
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new password"
      footer={
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={authStyles.helper}>
            Remembered it?{' '}
            <Text style={[authStyles.link, { color: accent.onDark }]}>Back to sign in</Text>
          </Text>
        </Pressable>
      }
    >
      <ErrorBanner message={validationError} />
      <ErrorBanner message={send.error} onRetry={handleSend} />

      {sent ? (
        <>
          <InfoBanner
            tone="success"
            message={`Reset link sent to ${email.trim()}. Open it on this phone — the app will take you straight to the new-password screen.`}
          />
          <Button title="Back to sign in" onPress={() => navigation.navigate('Login')} />
        </>
      ) : (
        <>
          <Text style={authStyles.label}>Registered email address</Text>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setValidationError(null);
            }}
            placeholder="you@example.com"
            placeholderTextColor={neutral[600]}
            autoCapitalize="none"
            keyboardType="email-address"
            style={authStyles.input}
            onSubmitEditing={handleSend}
          />
          <Button
            title={send.busy ? 'Sending…' : 'Send reset link'}
            onPress={handleSend}
            loading={send.busy}
            disabled={!isOnline}
          />
        </>
      )}
    </AuthLayout>
  );
};
