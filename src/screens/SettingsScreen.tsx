import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import {
  AppBar,
  Button,
  Card,
  ChipGroup,
  ErrorBanner,
  Field,
  InfoBanner,
  Row,
  Screen,
  SectionTitle,
  ToggleRow,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNetwork } from '../context/NetworkContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { AppNav } from '../navigation/types';
import { ACCENT_LIST, neutral, radius, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { AccentColor, CompoundFrequency, InterestType } from '../types/girvi';
import { parseAmount } from '../utils/format';
import { INTEREST_TYPE_OPTIONS, getInterestTypeLabel } from '../utils/interest';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { accent, setAccentId } = useAccent();
  const { activeStore, isOwner, signOut, user, memberships, switchStore } = useAuth();
  const { store, saveStore } = useData();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const [shopName, setShopName] = useState(store?.shopName ?? '');
  const [tagline, setTagline] = useState(store?.tagline ?? '');
  const [proprietor, setProprietor] = useState(store?.proprietorName ?? '');
  const [phone, setPhone] = useState(store?.phone ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [city, setCity] = useState(store?.city ?? '');
  const [pincode, setPincode] = useState(store?.pincode ?? '');
  const [licence, setLicence] = useState(store?.licenseNumber ?? '');
  const [terms, setTerms] = useState(store?.termsAndConditions ?? '');

  const [rateText, setRateText] = useState(String(store?.defaultMonthlyRate ?? 2));
  const [graceText, setGraceText] = useState(String(store?.defaultGracePeriodDays ?? 7));
  const [interestType, setInterestType] = useState<InterestType>(
    store?.defaultInterestType ?? 'DAILY_PRO_RATA'
  );

  const [autoCompound, setAutoCompound] = useState(store?.autoCompoundEnabled ?? true);
  const [afterMonthsText, setAfterMonthsText] = useState(
    String(store?.autoCompoundAfterMonths ?? 24)
  );
  const [frequency, setFrequency] = useState<CompoundFrequency>(
    store?.autoCompoundFrequency ?? 'ANNUAL'
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useAsyncAction(async () => {
    await saveStore({
      shopName: shopName.trim(),
      tagline,
      proprietorName: proprietor,
      phone,
      address,
      city,
      pincode,
      licenseNumber: licence,
      termsAndConditions: terms,
      defaultMonthlyRate: parseAmount(rateText),
      defaultGracePeriodDays: Math.round(parseAmount(graceText)),
      defaultInterestType: interestType,
      autoCompoundEnabled: autoCompound,
      autoCompoundAfterMonths: Math.round(parseAmount(afterMonthsText)),
      autoCompoundFrequency: frequency,
    });
    setSaved(true);
    toast.showSuccess('Settings saved.');
  }, { context: 'Settings.save' });

  const validate = (): string | null => {
    if (!shopName.trim()) return 'The shop name cannot be empty — it prints on every receipt.';
    const months = Math.round(parseAmount(afterMonthsText));
    if (months < 1 || months > 120) {
      return 'The compound threshold must be between 1 and 120 months.';
    }
    const rate = parseAmount(rateText);
    if (rate <= 0 || rate > 20) return 'The default rate must be between 0 and 20% a month.';
    const grace = parseAmount(graceText);
    if (grace < 0 || grace > 365) return 'The grace period must be between 0 and 365 days.';
    return null;
  };

  const handleSave = () => {
    setSaved(false);
    const problem = validate();
    setValidationError(problem);
    if (problem) return;
    if (!isOnline) {
      toast.showError({ message: 'Network request failed' });
      return;
    }
    void save.run();
  };

  const handleAccent = async (id: AccentColor) => {
    const previous = accent.id;
    setAccentId(id); // optimistic — the change should feel instant
    try {
      await saveStore({ accentColor: id });
    } catch (err) {
      setAccentId(previous as AccentColor);
      toast.showError(err);
    }
  };

  const shareCode = () => {
    if (!store) return;
    void Share.share({
      message:
        `Join ${store.shopName} on Girvi Pawn Manager.\n\n` +
        `Store code: ${store.storeCode}\n\n` +
        `Install the app, tap "Create an account", choose "Join a shop" and enter this code.`,
    });
  };

  return (
    <>
      <AppBar
        title="Settings"
        subtitle={store?.shopName}
        left={
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        }
      />

      <Screen>
        <ErrorBanner message={validationError} />
        <ErrorBanner message={save.error} onRetry={() => void save.run()} />
        {saved && !save.error && <InfoBanner tone="success" message="Settings saved." />}

        {/* Store code */}
        <Card dark>
          <Text style={styles.darkLabel}>Store code</Text>
          <Text style={[styles.code, { color: accent.onDark }]}>{store?.storeCode ?? '—'}</Text>
          <Text style={styles.darkHint}>
            Staff use this code to join this same ledger when they register. Anyone with the code can
            request access, so share it only with people you trust.
          </Text>
          <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
            <Button title="Share code" variant="primary" small style={{ flex: 1 }} onPress={shareCode} />
            <Button
              title="Team"
              variant="ghost"
              small
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('ShopTeam')}
            />
          </Row>
        </Card>

        {/* Security */}
        <SectionTitle title="Security" />
        <Card>
          <Text style={styles.rowLabel}>Signed in as</Text>
          <Text style={styles.rowValue}>{user?.email}</Text>
          <Button
            title="App lock & biometrics"
            variant="secondary"
            style={{ marginTop: spacing.md }}
            onPress={() => navigation.navigate('SecurityLock')}
          />
          <Button
            title="Sign out"
            variant="ghost"
            style={{ marginTop: spacing.sm }}
            onPress={() =>
              Alert.alert('Sign out?', 'You will need your email and password to sign in again.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
              ])
            }
          />
        </Card>

        {memberships.length > 1 && (
          <>
            <SectionTitle title="Switch shop" />
            <Card>
              {memberships.map(({ store: s, member }) => (
                <Pressable
                  key={s.id}
                  onPress={() => void switchStore(s.id)}
                  style={[
                    styles.storeRow,
                    s.id === activeStore?.id && { borderColor: accent.primary },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowValue}>{s.shopName}</Text>
                    <Text style={styles.rowLabel}>
                      {s.city} · {member.role.toLowerCase()}
                    </Text>
                  </View>
                  {s.id === activeStore?.id && (
                    <Text style={[styles.current, { color: accent.primary }]}>current</Text>
                  )}
                </Pressable>
              ))}
            </Card>
          </>
        )}

        {/* Interest policy */}
        <SectionTitle title="Interest rules" />
        <Card>
          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Field
                label="Default monthly rate (%)"
                value={rateText}
                onChangeText={setRateText}
                keyboardType="numeric"
                editable={isOwner}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Default grace (days)"
                value={graceText}
                onChangeText={setGraceText}
                keyboardType="numeric"
                editable={isOwner}
              />
            </View>
          </Row>

          <ChipGroup<InterestType>
            label="Default interest method for new pledges"
            columns={1}
            value={interestType}
            onChange={setInterestType}
            options={INTEREST_TYPE_OPTIONS.map((type) => {
              const info = getInterestTypeLabel(type);
              return { value: type, label: info.name, hint: info.frequencyDesc };
            })}
          />

          <View style={styles.policyBox}>
            <ToggleRow
              label="Auto-convert long-running simple loans to compound"
              description={`Once a simple-interest pledge passes ${afterMonthsText} months, the whole loan is recalculated as compound interest from its pledge date — not just from that anniversary. The amount owed steps up on the day it crosses. Individual pledges can override this.`}
              value={autoCompound}
              onChange={setAutoCompound}
              disabled={!isOwner}
            />

            {autoCompound && (
              <>
                <Field
                  label="Convert after (months)"
                  value={afterMonthsText}
                  onChangeText={setAfterMonthsText}
                  keyboardType="numeric"
                  editable={isOwner}
                  hint="24 months = 2 years"
                />
                <ChipGroup<CompoundFrequency>
                  label="Compounding cycle applied from the pledge date"
                  columns={3}
                  value={frequency}
                  onChange={setFrequency}
                  options={[
                    { value: 'MONTHLY', label: 'Monthly' },
                    { value: 'QUARTERLY', label: 'Quarterly' },
                    { value: 'ANNUAL', label: 'Yearly' },
                  ]}
                />
              </>
            )}
          </View>
        </Card>

        {/* Shop details */}
        <SectionTitle title="Shop details (printed on receipts)" />
        <Card>
          <Field label="Shop name" value={shopName} onChangeText={setShopName} editable={isOwner} />
          <Field label="Tagline" value={tagline} onChangeText={setTagline} editable={isOwner} />
          <Field label="Proprietor" value={proprietor} onChangeText={setProprietor} editable={isOwner} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={isOwner} />
          <Field label="Address" value={address} onChangeText={setAddress} multiline editable={isOwner} />
          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Field label="City" value={city} onChangeText={setCity} editable={isOwner} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" editable={isOwner} />
            </View>
          </Row>
          <Field label="Money-lending licence no." value={licence} onChangeText={setLicence} editable={isOwner} />
          <Field
            label="Terms printed on the pledge agreement"
            value={terms}
            onChangeText={setTerms}
            multiline
            editable={isOwner}
          />
        </Card>

        {/* Theme */}
        <SectionTitle title="Look & feel" />
        <Card>
          <Row style={{ flexWrap: 'wrap', gap: spacing.sm }}>
            {ACCENT_LIST.map((theme) => (
              <Pressable
                key={theme.id}
                onPress={() => void handleAccent(theme.id)}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: theme.primary,
                    borderColor: accent.id === theme.id ? neutral[900] : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.swatchText, { color: theme.onPrimary }]}>
                  {accent.id === theme.id ? '✓' : ''}
                </Text>
              </Pressable>
            ))}
          </Row>
          <Text style={styles.themeName}>
            {accent.name} — {accent.subtitle}
          </Text>
        </Card>

        {isOwner ? (
          <Button
            title={save.busy ? 'Saving…' : 'Save settings'}
            onPress={handleSave}
            loading={save.busy}
            disabled={!isOnline}
          />
        ) : (
          <InfoBanner message="Only the shop owner can change these settings." />
        )}
      </Screen>
    </>
  );
};

const styles = StyleSheet.create({
  back: { color: '#ffffff', fontSize: 30, fontWeight: '700', marginTop: -6 },
  darkLabel: { color: neutral[400], fontSize: 11, fontWeight: '700' },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 8, marginTop: 4 },
  darkHint: { color: neutral[500], fontSize: 11, marginTop: 6, lineHeight: 16 },
  rowLabel: { fontSize: 11, color: neutral[500], fontWeight: '600' },
  rowValue: { fontSize: 13.5, fontWeight: '700', color: neutral[900] },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: neutral[200],
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  current: { fontSize: 10.5, fontWeight: '800' },
  policyBox: {
    borderTopWidth: 1,
    borderTopColor: neutral[200],
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchText: { fontSize: 16, fontWeight: '900' },
  themeName: { fontSize: 11.5, color: neutral[500], marginTop: spacing.md },
});
