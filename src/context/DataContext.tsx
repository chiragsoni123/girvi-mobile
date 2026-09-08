import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useToast } from '../components/Toast';
import { AppError, logError, toAppError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import * as api from '../services/api';
import { Customer, GirviLoan, PaymentRecord, Store } from '../types/girvi';
import { CompoundPolicy } from '../utils/interest';
import { useAccent } from '../theme/AccentContext';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';

interface DataContextValue {
  /** True only on the very first load, when there is nothing to show yet. */
  loading: boolean;
  refreshing: boolean;
  /** Set when the last load failed. Existing data stays on screen. */
  error: AppError | null;
  /** True when a load failed and we have nothing cached to fall back on. */
  isEmptyFailure: boolean;
  /** Server data currently on screen may be out of date. */
  isStale: boolean;

  store: Store | null;
  customers: Customer[];
  loans: GirviLoan[];
  payments: PaymentRecord[];

  policy: CompoundPolicy;
  currency: string;

  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  customerById: (id: string) => Customer | undefined;
  loanById: (id: string) => GirviLoan | undefined;
  paymentsForLoan: (loanId: string) => PaymentRecord[];
  loansForCustomer: (customerId: string) => GirviLoan[];

  saveStore: (patch: Partial<Store>) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeStore, patchActiveStore, session, handleSessionExpiry } = useAuth();
  const { setAccentId } = useAccent();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<GirviLoan[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const storeId = activeStore?.id ?? null;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!storeId) {
        setCustomers([]);
        setLoans([]);
        setPayments([]);
        setLoading(false);
        return;
      }

      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        const [nextCustomers, nextLoans, nextPayments] = await Promise.all([
          api.fetchCustomers(storeId),
          api.fetchLoans(storeId),
          api.fetchPayments(storeId),
        ]);
        if (!mounted.current) return;

        setCustomers(nextCustomers);
        setLoans(nextLoans);
        setPayments(nextPayments);
        setError(null);
        setIsStale(false);
        setHasLoadedOnce(true);
      } catch (caught) {
        if (!mounted.current) return;
        const appError = toAppError(caught);
        logError('DataContext.load', caught);

        // An expired session is handled globally, not as a screen error.
        if (appError.requiresSignIn) {
          void handleSessionExpiry();
          return;
        }

        setError(appError);
        // Keep whatever is already on screen; just flag it as possibly stale.
        setIsStale(hasLoadedOnce);
        if (mode === 'refresh' && hasLoadedOnce) {
          toast.showError(caught, { retry: () => void load('refresh') });
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [handleSessionExpiry, hasLoadedOnce, storeId, toast]
  );

  useEffect(() => {
    void load('initial');
    // Deliberately keyed on the shop only — `load` changes identity often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Coming back online after a failure: quietly try again.
  useEffect(() => {
    if (isOnline && error?.kind === 'NETWORK') {
      void load('silent');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Keep the accent in sync with the shop's saved preference.
  useEffect(() => {
    if (activeStore?.accentColor) setAccentId(activeStore.accentColor);
  }, [activeStore?.accentColor, setAccentId]);

  // Realtime: a second phone in the same shop sees changes without a pull.
  useEffect(() => {
    if (!storeId || !session) return;

    const onChange = () => void load('silent');

    const channel = supabase
      .channel(`store-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans', filter: `store_id=eq.${storeId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `store_id=eq.${storeId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `store_id=eq.${storeId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_topups', filter: `store_id=eq.${storeId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_items', filter: `store_id=eq.${storeId}` }, onChange)
      .subscribe((status) => {
        // Realtime dropping out is not worth interrupting the shopkeeper —
        // pull-to-refresh still works, so just record it.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logError('DataContext.realtime', new Error(`Realtime channel ${status}`));
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, storeId]);

  const saveStore = useCallback(
    async (patch: Partial<Store>) => {
      if (!storeId) throw new Error('No shop selected');
      const updated = await api.updateStore(storeId, patch);
      patchActiveStore(updated);
    },
    [patchActiveStore, storeId]
  );

  const policy = useMemo<CompoundPolicy>(
    () => ({
      autoConvertEnabled: activeStore?.autoCompoundEnabled ?? true,
      afterMonths: activeStore?.autoCompoundAfterMonths ?? 24,
      frequency: activeStore?.autoCompoundFrequency ?? 'ANNUAL',
    }),
    [activeStore]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      loading,
      refreshing,
      error,
      isEmptyFailure: !!error && !hasLoadedOnce,
      isStale,
      store: activeStore,
      customers,
      loans,
      payments,
      policy,
      currency: activeStore?.currencySymbol ?? '₹',
      refresh: () => load('refresh'),
      retry: () => load('initial'),
      customerById: (id) => customers.find((c) => c.id === id),
      loanById: (id) => loans.find((l) => l.id === id),
      paymentsForLoan: (loanId) => payments.filter((p) => p.loanId === loanId),
      loansForCustomer: (customerId) => loans.filter((l) => l.customerId === customerId),
      saveStore,
    }),
    [
      activeStore,
      customers,
      error,
      hasLoadedOnce,
      isStale,
      load,
      loading,
      loans,
      payments,
      policy,
      refreshing,
      saveStore,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used inside <DataProvider>');
  return context;
}
