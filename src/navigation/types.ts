import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  LoanDetail: { loanId: string };
  NewLoan: { customerId?: string; loanId?: string } | undefined;
  TopUp: { loanId: string; topUpId?: string };
  CollectPayment: { loanId: string; paymentId?: string };
  CustomerForm: { customerId?: string } | undefined;
  CustomerDetail: { customerId: string };
  Settings: undefined;
  SecurityLock: undefined;
  Calculator: undefined;
  ShopTeam: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Loans: undefined;
  Customers: undefined;
  Payments: undefined;
  Reports: undefined;
};

export type AppNav = NativeStackNavigationProp<AppStackParamList>;
export type AuthNav = NativeStackNavigationProp<AuthStackParamList>;

export type AppRoute<T extends keyof AppStackParamList> = RouteProp<AppStackParamList, T>;
