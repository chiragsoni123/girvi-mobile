/**
 * Shared UI kit — the React Native equivalent of the web prototype's
 * Tailwind component classes (dark stone app bar, white rounded cards,
 * pill badges, accent-coloured primary actions).
 */

import LottieView from 'lottie-react-native';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBanner } from '../context/NetworkContext';
import { AppError } from '../lib/errors';
import { neutral, radius, semantic, shadow, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const Screen: React.FC<{
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  dark?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: ViewStyle;
}> = ({ children, scroll = true, padded = true, dark = false, refreshControl, contentStyle }) => {
  const background = dark ? neutral[950] : neutral[100];
  const body = (
    <View style={[padded ? styles.screenPadded : undefined, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{body}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const AppBar: React.FC<{
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, subtitle, left, right }) => {
  const insets = useSafeAreaInsets();
  return (
    <View>
      <View style={[styles.appBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.appBarRow}>
          <View style={styles.appBarLeft}>
            {left}
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.appBarTitle} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.appBarSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.appBarRight}>{right}</View>
        </View>
      </View>
      <OfflineBanner />
    </View>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  dark?: boolean;
  onPress?: () => void;
}> = ({ children, style, dark, onPress }) => {
  const content = (
    <View style={[dark ? styles.cardDark : styles.card, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}>
      {content}
    </Pressable>
  );
};

export const SectionTitle: React.FC<{ title: string; action?: React.ReactNode }> = ({
  title,
  action,
}) => (
  <View style={styles.sectionTitleRow}>
    <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
    {action}
  </View>
);

export const Divider: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <View style={{ height: 1, backgroundColor: dark ? neutral[800] : neutral[200] }} />
);

// ---------------------------------------------------------------------------
// Content atoms
// ---------------------------------------------------------------------------

export const Badge: React.FC<{
  label: string;
  bg?: string;
  color?: string;
  style?: ViewStyle;
}> = ({ label, bg, color, style }) => {
  const { accent } = useAccent();
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? accent.soft }, style]}>
      <Text style={[styles.badgeText, { color: color ?? accent.softText }]}>{label}</Text>
    </View>
  );
};

export const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'success' | 'danger';
  dark?: boolean;
}> = ({ label, value, hint, tone = 'default', dark }) => {
  const { accent } = useAccent();
  const valueColor =
    tone === 'accent'
      ? dark
        ? accent.onDark
        : accent.primary
      : tone === 'success'
      ? semantic.success
      : tone === 'danger'
      ? semantic.danger
      : dark
      ? '#ffffff'
      : neutral[900];

  return (
    <View style={[styles.statTile, dark && styles.statTileDark]}>
      <Text style={[styles.statLabel, dark && { color: neutral[400] }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!hint && (
        <Text style={[styles.statHint, dark && { color: neutral[500] }]} numberOfLines={1}>
          {hint}
        </Text>
      )}
    </View>
  );
};

export const KeyValue: React.FC<{ label: string; value: string; dark?: boolean }> = ({
  label,
  value,
  dark,
}) => (
  <View style={styles.keyValueRow}>
    <Text style={[styles.keyValueLabel, dark && { color: neutral[400] }]}>{label}</Text>
    <Text style={[styles.keyValueValue, dark && { color: neutral[100] }]}>{value}</Text>
  </View>
);

export const EmptyState: React.FC<{ title: string; message?: string; action?: React.ReactNode }> = ({
  title,
  message,
  action,
}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    {!!message && <Text style={styles.emptyMessage}>{message}</Text>}
    {!!action && <View style={{ marginTop: spacing.md }}>{action}</View>}
  </View>
);

export const Loading: React.FC<{ label?: string; size?: number }> = ({ label, size = 110 }) => (
  <View style={styles.loading}>
    <LottieView
      source={require('../../asset/Rupee-Coin.json')}
      autoPlay
      loop
      style={{ width: size, height: size }}
    />
    {!!label && <Text style={styles.loadingLabel}>{label}</Text>}
  </View>
);

/** Inline error strip for forms. Accepts a raw string or a classified AppError. */
export const ErrorBanner: React.FC<{
  message?: string | AppError | null;
  onRetry?: () => void;
}> = ({ message, onRetry }) => {
  if (!message) return null;
  const isApp = typeof message !== 'string';
  const text = isApp ? (message as AppError).message : (message as string);
  const showRetry = !!onRetry && (!isApp || (message as AppError).retryable);

  return (
    <View style={styles.errorBanner}>
      <View style={{ flex: 1 }}>
        {isApp && <Text style={styles.errorTitle}>{(message as AppError).title}</Text>}
        <Text style={styles.errorText}>{text}</Text>
      </View>
      {showRetry && (
        <Pressable onPress={onRetry} hitSlop={8} style={styles.errorRetry}>
          <Text style={styles.errorRetryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
};

/**
 * Full-panel failure state for when a screen has no data to show at all —
 * distinct from an empty list, which is a normal situation.
 */
export const ErrorState: React.FC<{
  error: AppError;
  onRetry?: () => void;
  onSignIn?: () => void;
}> = ({ error, onRetry, onSignIn }) => (
  <View style={styles.errorState}>
    <View style={styles.errorStateBadge}>
      <Text style={styles.errorStateBadgeText}>!</Text>
    </View>
    <Text style={styles.errorStateTitle}>{error.title}</Text>
    <Text style={styles.errorStateBody}>{error.message}</Text>

    {error.requiresSignIn && onSignIn ? (
      <Button title="Sign in again" onPress={onSignIn} style={{ marginTop: spacing.lg, minWidth: 200 }} />
    ) : (
      !!onRetry && (
        <Button
          title="Try again"
          onPress={onRetry}
          variant="dark"
          style={{ marginTop: spacing.lg, minWidth: 200 }}
        />
      )
    )}
  </View>
);

export const InfoBanner: React.FC<{ message: string; tone?: 'info' | 'warning' | 'success' }> = ({
  message,
  tone = 'info',
}) => {
  const map = {
    info: { bg: semantic.infoSoft, color: semantic.infoText },
    warning: { bg: semantic.warningSoft, color: semantic.warningText },
    success: { bg: semantic.successSoft, color: semantic.successText },
  } as const;
  return (
    <View style={[styles.infoBanner, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.infoText, { color: map[tone].color }]}>{message}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export const Button: React.FC<{
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'dark' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  small?: boolean;
}> = ({ title, onPress, variant = 'primary', disabled, loading, style, small }) => {
  const { accent } = useAccent();

  const palette: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: accent.primary, fg: accent.onPrimary },
    secondary: { bg: accent.soft, fg: accent.softText },
    dark: { bg: neutral[900], fg: '#ffffff' },
    danger: { bg: semantic.danger, fg: '#ffffff' },
    ghost: { bg: 'transparent', fg: neutral[700], border: neutral[300] },
  };
  const tone = palette[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border ?? 'transparent',
          borderWidth: tone.border ? 1 : 0,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, small && { fontSize: 12.5 }, { color: tone.fg }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
};

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  prefix?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, prefix, style, ...rest }) => {
  const { accent } = useAccent();
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <View
        style={[
          styles.fieldBox,
          focused && { borderColor: accent.primary },
          !!error && { borderColor: semantic.danger },
        ]}
      >
        {!!prefix && <Text style={styles.fieldPrefix}>{prefix}</Text>}
        <TextInput
          placeholderTextColor={neutral[400]}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.fieldInput, style]}
        />
      </View>
      {!!hint && !error && <Text style={styles.fieldHint}>{hint}</Text>}
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
};

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label?: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  const { accent } = useAccent();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <View style={styles.chipWrap}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.chip,
                { width: `${100 / columns - 2}%` },
                active
                  ? { backgroundColor: accent.primary, borderColor: accent.primary }
                  : { backgroundColor: '#ffffff', borderColor: neutral[200] },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? accent.onPrimary : neutral[700] },
                ]}
              >
                {opt.label}
              </Text>
              {!!opt.hint && (
                <Text
                  style={[
                    styles.chipHint,
                    { color: active ? accent.onPrimary : neutral[400] },
                  ]}
                >
                  {opt.hint}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const ToggleRow: React.FC<{
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ label, description, value, onChange, disabled }) => {
  const { accent } = useAccent();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {!!description && <Text style={styles.toggleDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: accent.primary, false: neutral[300] }}
        thumbColor="#ffffff"
      />
    </View>
  );
};

export const Fab: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => {
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        shadow.raised,
        {
          backgroundColor: accent.primary,
          bottom: insets.bottom + 24,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text style={[styles.fabText, { color: accent.onPrimary }]}>{label}</Text>
    </Pressable>
  );
};

export const Row: React.FC<{ children: React.ReactNode; style?: ViewStyle; gap?: number }> = ({
  children,
  style,
  gap = spacing.sm,
}) => <View style={[{ flexDirection: 'row', gap }, style]}>{children}</View>;

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screenPadded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  appBar: {
    backgroundColor: neutral[900],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: neutral[800],
  },
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appBarTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  appBarSubtitle: { color: neutral[400], fontSize: 11, marginTop: 1 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: neutral[200],
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardDark: {
    backgroundColor: neutral[900],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: neutral[800],
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: neutral[500],
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

  statTile: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutral[200],
    padding: spacing.md,
  },
  statTileDark: { backgroundColor: neutral[800], borderColor: neutral[700] },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: neutral[500], marginBottom: 4 },
  statValue: { fontSize: 17, fontWeight: '800' },
  statHint: { fontSize: 10, color: neutral[400], marginTop: 2 },

  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: spacing.md,
  },
  keyValueLabel: { fontSize: 12, color: neutral[500], flexShrink: 1 },
  keyValueValue: { fontSize: 12.5, fontWeight: '700', color: neutral[900], textAlign: 'right' },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: neutral[700] },
  emptyMessage: {
    fontSize: 12,
    color: neutral[500],
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  loading: { paddingVertical: 40, alignItems: 'center', gap: spacing.md },
  loadingLabel: { fontSize: 12, color: neutral[500] },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorTitle: {
    color: semantic.dangerText,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  errorText: { color: semantic.dangerText, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  errorRetry: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: semantic.danger,
  },
  errorRetryText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },

  errorState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: spacing.lg },
  errorStateBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: semantic.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorStateBadgeText: { color: semantic.danger, fontSize: 22, fontWeight: '900' },
  errorStateTitle: { fontSize: 15, fontWeight: '800', color: neutral[900] },
  errorStateBody: {
    fontSize: 12.5,
    color: neutral[500],
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  infoBanner: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  infoText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },

  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 9, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: neutral[600],
    marginBottom: 6,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: neutral[300],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  fieldPrefix: { fontSize: 16, fontWeight: '700', color: neutral[400], marginRight: 4 },
  fieldInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    color: neutral[900],
    textAlignVertical: 'center',
  },
  fieldHint: { fontSize: 10.5, color: neutral[400], marginTop: 4 },
  fieldError: { fontSize: 11, color: semantic.danger, marginTop: 4, fontWeight: '600' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  chipHint: { fontSize: 9.5, marginTop: 2, fontWeight: '500' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: neutral[900] },
  toggleDescription: { fontSize: 11, color: neutral[500], marginTop: 2, lineHeight: 15 },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: radius.pill,
  },
  fabText: { fontSize: 14, fontWeight: '800' },
});
