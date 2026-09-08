import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useToast } from '../components/Toast';
import { AppError, logError, toAppError } from '../lib/errors';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  clearLockSettings,
  getAutoLockMinutes,
  isBiometricLockEnabled,
} from '../lib/security';
import { MembershipWithStore, createStore, fetchMemberships, joinStore } from '../services/api';
import { Store } from '../types/girvi';

const ACTIVE_STORE_KEY = 'girvi.activeStoreId';
const PENDING_INTENT_KEY = 'girvi.pendingStoreIntent';

/**
 * When email confirmation is switched on in Supabase, sign-up returns no
 * session — so the shop cannot be created yet. The intent is parked here and
 * replayed on the first successful sign-in.
 */
export interface PendingStoreIntent {
  mode: 'CREATE' | 'JOIN';
  shopName?: string;
  storeCode?: string;
  fullName?: string;
  phone?: string;
  city?: string;
}

interface AuthContextValue {
  initializing: boolean;
  session: Session | null;
  user: User | null;
  memberships: MembershipWithStore[];
  activeStore: Store | null;
  activeMembership: MembershipWithStore | null;
  isOwner: boolean;

  /** True when a signed-in user still has to create or join a shop. */
  needsStore: boolean;

  /** Set when the shop list could not be loaded at startup. */
  bootstrapError: AppError | null;
  retryBootstrap: () => Promise<void>;
  /** Signs out cleanly and tells the user why. */
  handleSessionExpiry: () => Promise<void>;

  isLocked: boolean;
  lockNow: () => void;
  unlock: () => void;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: {
    email: string;
    password: string;
    fullName: string;
    intent: PendingStoreIntent;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;

  createNewStore: (params: {
    shopName: string;
    proprietorName?: string;
    phone?: string;
    city?: string;
  }) => Promise<void>;
  joinExistingStore: (storeCode: string, fullName?: string) => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  refreshMemberships: () => Promise<void>;
  patchActiveStore: (store: Store) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();

  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<AppError | null>(null);

  const backgroundedAt = useRef<number | null>(null);

  // --- membership loading --------------------------------------------------

  const loadMemberships = useCallback(async (): Promise<MembershipWithStore[]> => {
    const list = await fetchMemberships();
    setMemberships(list);

    const savedId = await AsyncStorage.getItem(ACTIVE_STORE_KEY);
    const preferred =
      list.find((m) => m.store.id === savedId) ??
      list.find((m) => m.member.role === 'OWNER') ??
      list[0];

    setActiveStoreId(preferred ? preferred.store.id : null);
    if (preferred) await AsyncStorage.setItem(ACTIVE_STORE_KEY, preferred.store.id);
    return list;
  }, []);

  /** Replays a create/join intent parked during sign-up. */
  const applyPendingIntent = useCallback(async () => {
    const raw = await AsyncStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return false;

    let intent: PendingStoreIntent;
    try {
      intent = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(PENDING_INTENT_KEY);
      return false;
    }

    try {
      if (intent.mode === 'CREATE' && intent.shopName) {
        await createStore({
          shopName: intent.shopName,
          proprietorName: intent.fullName,
          phone: intent.phone,
          city: intent.city,
        });
      } else if (intent.mode === 'JOIN' && intent.storeCode) {
        await joinStore(intent.storeCode, intent.fullName ?? '');
      }
      await AsyncStorage.removeItem(PENDING_INTENT_KEY);
      return true;
    } catch (error) {
      // Keep the intent so the user can retry from the store gate screen,
      // and tell them why it did not go through.
      logError('AuthContext.applyPendingIntent', error);
      const appError = toAppError(error);
      if (appError.kind === 'NOT_FOUND' || appError.kind === 'VALIDATION') {
        toast.showError(error);
      }
      return false;
    }
  }, [toast]);

  const bootstrapSession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      if (!nextSession) {
        setMemberships([]);
        setActiveStoreId(null);
        setBootstrapError(null);
        return;
      }

      try {
        let list = await loadMemberships();
        if (list.length === 0) {
          const applied = await applyPendingIntent();
          if (applied) list = await loadMemberships();
        }
        setBootstrapError(null);
        // A signed-in user with a shop starts locked if they enabled the lock.
        if (list.length > 0 && (await isBiometricLockEnabled())) setIsLocked(true);
      } catch (error) {
        logError('AuthContext.bootstrapSession', error);
        const appError = toAppError(error);
        if (appError.requiresSignIn) {
          await clearLockSettings().catch(() => {});
          await supabase.auth.signOut().catch(() => {});
          toast.showError(error);
          return;
        }
        setBootstrapError(appError);
      }
    },
    [applyPendingIntent, loadMemberships, toast]
  );

  // --- initial load & auth subscription ------------------------------------

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!isSupabaseConfigured) {
        setInitializing(false);
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) await bootstrapSession(data.session ?? null);
      } catch (error) {
        logError('AuthContext.restoreSession', error);
        if (mounted) setBootstrapError(toAppError(error));
      } finally {
        if (mounted) setInitializing(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(nextSession);
        return;
      }
      void bootstrapSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [bootstrapSession]);

  // --- auto lock on background ---------------------------------------------

  useEffect(() => {
    const handler = async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state === 'active' && backgroundedAt.current && session) {
        const minutes = await getAutoLockMinutes();
        const enabled = await isBiometricLockEnabled();
        const awayMs = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabled && minutes >= 0 && awayMs >= minutes * 60 * 1000) {
          setIsLocked(true);
        }
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [session]);

  // --- actions -------------------------------------------------------------

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ email, password, fullName, intent }) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: fullName },
        // Without this, Supabase falls back to the project's Site URL (often
        // still the http://localhost default) for the confirmation link.
        // RootNavigator's deep-link handler completes the sign-in once the
        // user taps back into girvi://confirm-email.
        emailRedirectTo: Linking.createURL('/confirm-email'),
      },
    });
    if (error) throw error;

    await AsyncStorage.setItem(
      PENDING_INTENT_KEY,
      JSON.stringify({ ...intent, fullName: intent.fullName || fullName })
    );

    if (data.session) {
      await applyPendingIntent();
      await loadMemberships();
      return { needsEmailConfirmation: false };
    }
    return { needsEmailConfirmation: true };
  }, [applyPendingIntent, loadMemberships]);

  const sendPasswordReset = useCallback(async (email: string) => {
    // createURL resolves to girvi://reset-password in a real build and to the
    // exp://<host>/--/reset-password tunnel inside Expo Go, so the emailed
    // link opens whichever one the user is actually running.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // Clear local state first so a failed network round-trip cannot strand the
    // user in a signed-in-looking app.
    await clearLockSettings().catch(() => {});
    await AsyncStorage.multiRemove([ACTIVE_STORE_KEY, PENDING_INTENT_KEY]).catch(() => {});
    setIsLocked(false);
    setBootstrapError(null);
    const { error } = await supabase.auth.signOut();
    if (error) logError('AuthContext.signOut', error);
    setSession(null);
    setMemberships([]);
    setActiveStoreId(null);
  }, []);

  const handleSessionExpiry = useCallback(async () => {
    toast.showError({ message: 'JWT expired' });
    await signOut();
  }, [signOut, toast]);

  const retryBootstrap = useCallback(async () => {
    setBootstrapError(null);
    setInitializing(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await bootstrapSession(data.session ?? null);
    } catch (error) {
      logError('AuthContext.retryBootstrap', error);
      setBootstrapError(toAppError(error));
    } finally {
      setInitializing(false);
    }
  }, [bootstrapSession]);

  const createNewStore = useCallback<AuthContextValue['createNewStore']>(
    async (params) => {
      await createStore(params);
      await AsyncStorage.removeItem(PENDING_INTENT_KEY);
      await loadMemberships();
    },
    [loadMemberships]
  );

  const joinExistingStore = useCallback(
    async (storeCode: string, fullName = '') => {
      await joinStore(storeCode, fullName);
      await AsyncStorage.removeItem(PENDING_INTENT_KEY);
      await loadMemberships();
    },
    [loadMemberships]
  );

  const switchStore = useCallback(async (storeId: string) => {
    setActiveStoreId(storeId);
    await AsyncStorage.setItem(ACTIVE_STORE_KEY, storeId);
  }, []);

  const patchActiveStore = useCallback((store: Store) => {
    setMemberships((prev) =>
      prev.map((m) => (m.store.id === store.id ? { ...m, store } : m))
    );
  }, []);

  const activeMembership = useMemo(
    () => memberships.find((m) => m.store.id === activeStoreId) ?? memberships[0] ?? null,
    [memberships, activeStoreId]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
      memberships,
      activeStore: activeMembership?.store ?? null,
      activeMembership,
      isOwner: activeMembership?.member.role === 'OWNER' || activeMembership?.member.role === 'MANAGER',
      needsStore: !!session && memberships.length === 0 && !bootstrapError,
      bootstrapError,
      retryBootstrap,
      handleSessionExpiry,
      isLocked,
      lockNow: () => setIsLocked(true),
      unlock: () => setIsLocked(false),
      signIn,
      signUp,
      sendPasswordReset,
      updatePassword,
      signOut,
      createNewStore,
      joinExistingStore,
      switchStore,
      refreshMemberships: async () => {
        await loadMemberships();
      },
      patchActiveStore,
    }),
    [
      activeMembership,
      bootstrapError,
      createNewStore,
      handleSessionExpiry,
      initializing,
      isLocked,
      joinExistingStore,
      loadMemberships,
      memberships,
      patchActiveStore,
      retryBootstrap,
      sendPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      switchStore,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
