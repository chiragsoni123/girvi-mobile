import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toAppError } from '../lib/errors';
import { neutral, radius, semantic, shadow, spacing } from '../theme';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  showError: (error: unknown, options?: { retry?: () => void }) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TONE_STYLES: Record<ToastTone, { bg: string; fg: string }> = {
  success: { bg: '#065f46', fg: '#d1fae5' },
  error: { bg: '#9f1239', fg: '#ffe4e6' },
  info: { bg: neutral[800], fg: neutral[100] },
};

/**
 * Lightweight snackbar. Used for outcomes the shopkeeper should notice but
 * does not need to acknowledge — saves, sync failures, retryable errors.
 * Anything destructive or irreversible still uses a blocking Alert.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [opacity]);

  const push = useCallback(
    (item: Omit<ToastItem, 'id'>, durationMs: number) => {
      clearTimer();
      setToast({ ...item, id: nextId.current++ });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(hide, durationMs);
    },
    [hide, opacity]
  );

  useEffect(() => clearTimer, []);

  const value: ToastContextValue = {
    showSuccess: useCallback(
      (message) => push({ tone: 'success', message }, 2600),
      [push]
    ),
    showInfo: useCallback((message) => push({ tone: 'info', message }, 3000), [push]),
    showError: useCallback(
      (error, options) => {
        const appError = toAppError(error);
        push(
          {
            tone: 'error',
            message: appError.message,
            actionLabel: appError.retryable && options?.retry ? 'Retry' : undefined,
            onAction: appError.retryable ? options?.retry : undefined,
          },
          appError.retryable && options?.retry ? 6000 : 4500
        );
      },
      [push]
    ),
    dismiss: hide,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {!!toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrapper, { opacity, bottom: insets.bottom + 78 }]}
        >
          <View style={[styles.toast, shadow.raised, { backgroundColor: TONE_STYLES[toast.tone].bg }]}>
            <Text style={[styles.message, { color: TONE_STYLES[toast.tone].fg }]}>
              {toast.message}
            </Text>

            {!!toast.actionLabel && (
              <Pressable
                onPress={() => {
                  hide();
                  toast.onAction?.();
                }}
                hitSlop={8}
                style={styles.action}
              >
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </Pressable>
            )}

            <Pressable onPress={hide} hitSlop={8}>
              <Text style={[styles.close, { color: TONE_STYLES[toast.tone].fg }]}>✕</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  message: { flex: 1, fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  close: { fontSize: 13, fontWeight: '700', opacity: 0.7 },
});

export const toastTones = { success: semantic.success, error: semantic.danger };
