import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { Button, ErrorBanner, InfoBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { neutral } from '../../theme';
import { AuthLayout, authStyles } from './AuthLayout';

/**
 * Reached through the `girvi://reset-password` deep link. Supabase has already
 * created a short-lived recovery session by the time this renders, so all that
 * is left is to set the new password.
 */
export const ResetPasswordScreen: React.FC = () => {
  const { updatePassword, signOut } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const save = useAsyncAction(
    async () => {
      await updatePassword(password);
      setDone(true);
    },
    { context: 'ResetPassword.save' }
  );

  const handleSave = () => {
    setValidationError(null);
    if (password.length < 8) {
      return setValidationError('Password must be at least 8 characters long.');
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return setValidationError('Use at least one letter and one number.');
    }
    if (password !== confirm) return setValidationError('The two passwords do not match.');
    void save.run();
  };

  return (
    <AuthLayout title="Set a new password" subtitle="Choose something only you know">
      <ErrorBanner message={validationError} />
      <ErrorBanner message={save.error} onRetry={handleSave} />

      {done ? (
        <>
          <InfoBanner tone="success" message="Password updated. Please sign in again." />
          <Button title="Go to sign in" onPress={() => void signOut()} />
        </>
      ) : (
        <>
          <Text style={authStyles.label}>New password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={neutral[600]}
            secureTextEntry
            autoCapitalize="none"
            style={authStyles.input}
          />

          <Text style={authStyles.label}>Confirm new password</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor={neutral[600]}
            secureTextEntry
            autoCapitalize="none"
            style={authStyles.input}
          />

          <Button
            title={save.busy ? 'Saving…' : 'Save new password'}
            onPress={handleSave}
            loading={save.busy}
          />
        </>
      )}
    </AuthLayout>
  );
};
