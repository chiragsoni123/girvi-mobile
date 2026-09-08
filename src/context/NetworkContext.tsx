import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { neutral, semantic, spacing } from '../theme';

interface NetworkContextValue {
  /** False only when the device reports no usable connection. */
  isOnline: boolean;
  /** True when connected to a network that cannot actually reach the internet. */
  isLimited: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true, isLimited: false });

/**
 * This ledger is cloud-only by design, so the app has to be honest about
 * connectivity rather than failing silently at save time.
 */
export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [isReachable, setIsReachable] = useState<boolean | null>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
      setIsReachable(state.isInternetReachable);
    });
    void NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected ?? false);
      setIsReachable(state.isInternetReachable);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      isOnline: isConnected,
      // `isInternetReachable` is null while unknown — don't cry wolf on that.
      isLimited: isConnected && isReachable === false,
    }),
    [isConnected, isReachable]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}

/**
 * Thin strip shown whenever the connection is bad. Normally rendered as the
 * last row of the dark app bar, so it inherits the safe area; pass
 * `standalone` when there is no app bar above it.
 */
export const OfflineBanner: React.FC<{ standalone?: boolean }> = ({ standalone }) => {
  const { isOnline, isLimited } = useNetwork();
  const insets = useSafeAreaInsets();
  if (isOnline && !isLimited) return null;

  return (
    <View style={[styles.banner, standalone && { paddingTop: insets.top + 7 }]}>
      <Text style={styles.text}>
        {isOnline
          ? 'Connected, but the internet is not reachable — changes cannot be saved right now.'
          : 'No internet connection. You can read what is on screen, but nothing can be saved.'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: semantic.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  text: { color: neutral[950], fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
