import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, ErrorBanner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { neutral, radius, spacing } from '../../theme';
import { useAccent } from '../../theme/AccentContext';
import { AuthLayout, authStyles } from './AuthLayout';

/**
 * Shown when someone is signed in but not yet attached to any shop — either a
 * brand-new account, or one whose sign-up intent failed and needs a retry.
 */
export const StoreGateScreen: React.FC = () => {
  const { createNewStore, joinExistingStore, signOut, user } = useAuth();
  const { accent } = useAccent();
  const { isOnline } = useNetwork();

  const [mode, setMode] = useState<'CREATE' | 'JOIN'>('CREATE');
  const [shopName, setShopName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const fullName = (user?.user_metadata?.full_name as string) ?? '';

  const submit = useAsyncAction(async () => {
    if (mode === 'CREATE') {
      await createNewStore({
        shopName: shopName.trim(),
        proprietorName: fullName,
        phone,
        city,
      });
    } else {
      await joinExistingStore(storeCode, fullName);
    }
  }, { context: 'StoreGate.submit' });

  const handleSubmit = () => {
    setValidationError(null);
    if (mode === 'CREATE' && !shopName.trim()) {
      return setValidationError('Please enter your shop name.');
    }
    if (mode === 'JOIN' && !/^[A-Z0-9]{6}$/.test(storeCode.trim().toUpperCase())) {
      return setValidationError('The store code is exactly 6 letters and numbers.');
    }
    void submit.run();
  };

  return (
    <AuthLayout
      title="Set up your shop"
      subtitle={`Signed in as ${user?.email ?? ''}`}
      footer={
        <Pressable onPress={() => void signOut()}>
          <Text style={authStyles.helper}>
            Wrong account? <Text style={[authStyles.link, { color: accent.onDark }]}>Sign out</Text>
          </Text>
        </Pressable>
      }
    >
      <ErrorBanner message={validationError} />
      <ErrorBanner message={submit.error} onRetry={() => void submit.run()} />

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        {(['CREATE', 'JOIN'] as const).map((option) => {
          const active = mode === option;
          return (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              style={{
                flex: 1,
                borderRadius: radius.md,
                borderWidth: 1,
                paddingVertical: spacing.md,
                alignItems: 'center',
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
                {option === 'CREATE' ? 'Create new shop' : 'Join with code'}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
        </>
      ) : (
        <>
          <Text style={authStyles.label}>Store code</Text>
          <TextInput
            value={storeCode}
            onChangeText={(text) => setStoreCode(text.toUpperCase())}
            placeholder="K7QM4T"
            placeholderTextColor={neutral[600]}
            autoCapitalize="characters"
            maxLength={6}
            style={[
              authStyles.input,
              { letterSpacing: 6, fontSize: 18, textAlign: 'center', fontWeight: '800' },
            ]}
          />
        </>
      )}

      <Button
        title={
          submit.busy ? 'Setting up…' : mode === 'CREATE' ? 'Create shop' : 'Join shop'
        }
        onPress={handleSubmit}
        loading={submit.busy}
        disabled={!isOnline}
      />
    </AuthLayout>
  );
};
