import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import React, { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootSplash } from './src/components/BootSplash';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastProvider } from './src/components/Toast';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AccentProvider } from './src/theme/AccentContext';

// Keep the native splash (app.json's plain background colour) up until
// BootSplash has mounted and can hand off to the Shreeji image with no gap.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Bumping this key remounts the whole tree after an unrecoverable error.
  const [treeKey, setTreeKey] = useState(0);
  const [showBoot, setShowBoot] = useState(true);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary key={treeKey} onReset={() => setTreeKey((n) => n + 1)}>
          <NetworkProvider>
            <AccentProvider>
              <ToastProvider>
                <AuthProvider>
                  <StatusBar style="light" backgroundColor="#1c1917" />
                  <RootNavigator />
                </AuthProvider>
              </ToastProvider>
            </AccentProvider>
          </NetworkProvider>
        </ErrorBoundary>
        {showBoot && <BootSplash onFinish={() => setShowBoot(false)} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
