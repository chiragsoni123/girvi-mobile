import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Loading, Screen } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { OfflineBanner } from '../context/NetworkContext';
import { logError } from '../lib/errors';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { CalculatorScreen } from '../screens/CalculatorScreen';
import { CollectPaymentScreen } from '../screens/CollectPaymentScreen';
import { CustomerDetailScreen } from '../screens/CustomerDetailScreen';
import { CustomerFormScreen } from '../screens/CustomerFormScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LoanDetailScreen } from '../screens/LoanDetailScreen';
import { LoansScreen } from '../screens/LoansScreen';
import { LockScreen } from '../screens/LockScreen';
import { NewLoanScreen } from '../screens/NewLoanScreen';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { SecurityLockScreen } from '../screens/SecurityLockScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShopTeamScreen } from '../screens/ShopTeamScreen';
import { TopUpScreen } from '../screens/TopUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { StoreGateScreen } from '../screens/auth/StoreGateScreen';
import { neutral, spacing } from '../theme';
import { useAccent } from '../theme/AccentContext';
import { AppStackParamList, AuthStackParamList, TabParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Dashboard: '⌂',
  Loans: '◈',
  Customers: '☺',
  Payments: '₹',
  Reports: '▤',
};

function TabsNavigator() {
  const { accent } = useAccent();
  // edgeToEdgeEnabled (app.json) draws the app behind the system nav bar, so
  // without this the gesture pill / 3-button nav sits on top of the tab bar.
  const insets = useSafeAreaInsets();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: accent.primary,
        tabBarInactiveTintColor: neutral[400],
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: neutral[200],
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 17 }}>{TAB_ICONS[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      <Tabs.Screen name="Loans" component={LoansScreen} options={{ title: 'Pledges' }} />
      <Tabs.Screen name="Customers" component={CustomersScreen} />
      <Tabs.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Receipts' }} />
      <Tabs.Screen name="Reports" component={ReportsScreen} />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AppStack.Screen name="Tabs" component={TabsNavigator} />
      <AppStack.Screen name="LoanDetail" component={LoanDetailScreen} />
      <AppStack.Screen name="NewLoan" component={NewLoanScreen} />
      <AppStack.Screen name="TopUp" component={TopUpScreen} />
      <AppStack.Screen name="CollectPayment" component={CollectPaymentScreen} />
      <AppStack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <AppStack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <AppStack.Screen name="Settings" component={SettingsScreen} />
      <AppStack.Screen name="SecurityLock" component={SecurityLockScreen} />
      <AppStack.Screen name="Calculator" component={CalculatorScreen} />
      <AppStack.Screen name="ShopTeam" component={ShopTeamScreen} />
    </AppStack.Navigator>
  );
}

function AuthNavigator({ recovery }: { recovery: boolean }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {recovery ? (
        <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      ) : (
        <>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      )}
    </AuthStack.Navigator>
  );
}

const SetupNotice: React.FC = () => (
  <View style={styles.setup}>
    <Text style={styles.setupTitle}>Supabase is not configured yet</Text>
    <Text style={styles.setupBody}>
      Copy <Text style={styles.mono}>.env.example</Text> to <Text style={styles.mono}>.env</Text>,
      paste your project URL and anon key from the Supabase dashboard, then restart with{'\n'}
      <Text style={styles.mono}>npx expo start -c</Text>.
    </Text>
    <Text style={styles.setupBody}>
      Run <Text style={styles.mono}>supabase/schema.sql</Text> in the SQL editor first — it creates
      the tables, security rules and the store-code functions.
    </Text>
  </View>
);

export const RootNavigator: React.FC = () => {
  const { initializing, session, needsStore, isLocked, bootstrapError, retryBootstrap, signOut } =
    useAuth();
  const [recoveryMode, setRecoveryMode] = useState(false);
  const toast = useToast();

  // A password-reset deep link opens a recovery session; swap to the reset
  // screen rather than dropping the user into the ledger.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT') setRecoveryMode(false);
    });

    // Both the password-reset and email-confirmation links land here as
    // girvi://…?code=… (PKCE). lib/supabase.ts turns off detectSessionInUrl —
    // "React Native has no URL bar for the session to come back through" —
    // so nothing completes the sign-in automatically; this does it by hand.
    // exchangeCodeForSession itself fires PASSWORD_RECOVERY vs SIGNED_IN
    // depending on which flow originally issued the code, which is what
    // flips recoveryMode above and, for a fresh sign-up, lets the existing
    // bootstrapSession/applyPendingIntent flow take over normally.
    const completeFromUrl = async (url: string | null) => {
      if (!url) return;
      const code = new URL(url).searchParams.get('code');
      if (!code) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logError('RootNavigator.exchangeCodeForSession', error);
        toast.showError(error);
      }
    };

    // getInitialURL covers a cold start (app opened *by* the link); the
    // event listener covers the app already being open in the background.
    void Linking.getInitialURL().then(completeFromUrl);
    const sub = Linking.addEventListener('url', ({ url }) => void completeFromUrl(url));

    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, [toast]);

  if (!isSupabaseConfigured) {
    return (
      <NavigationContainer theme={navTheme}>
        <SetupNotice />
      </NavigationContainer>
    );
  }

  if (initializing) {
    return (
      <View style={styles.splash}>
        <Loading label="Opening your vault…" />
      </View>
    );
  }

  // Signed in, but the shop list could not be fetched — offer a way forward
  // instead of dropping the user into an empty-looking ledger.
  if (session && bootstrapError && !recoveryMode) {
    return (
      <NavigationContainer theme={navTheme}>
        <View style={{ flex: 1, backgroundColor: neutral[100] }}>
          <OfflineBanner standalone />
          <Screen scroll={false}>
            <ErrorState
              error={bootstrapError}
              onRetry={() => void retryBootstrap()}
              onSignIn={() => void signOut()}
            />
          </Screen>
        </View>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navTheme} linking={linkingConfig}>
      <View style={{ flex: 1 }}>
        {/* Signed-out screens have no app bar to host the strip. */}
        {(!session || recoveryMode || needsStore) && <OfflineBanner standalone />}
        {!session || recoveryMode ? (
          <AuthNavigator recovery={recoveryMode && !!session} />
        ) : needsStore ? (
          <StoreGateScreen />
        ) : (
          <DataProvider>{isLocked ? <LockScreen /> : <AppNavigator />}</DataProvider>
        )}
      </View>
    </NavigationContainer>
  );
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: neutral[100] },
};

const linkingConfig = {
  prefixes: [Linking.createURL('/'), 'girvi://'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
    },
  },
};

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: neutral[950], justifyContent: 'center' },
  setup: {
    flex: 1,
    backgroundColor: neutral[950],
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  setupTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  setupBody: { color: neutral[400], fontSize: 13, lineHeight: 20 },
  mono: { fontFamily: 'monospace', color: '#fbbf24' },
});
