/**
 * Domain types. These mirror supabase/schema.sql but use camelCase —
 * mapping happens in src/services/mappers.ts.
 */

export type MetalType = 'GOLD' | 'SILVER' | 'BRONZE' | 'DIAMOND_GOLD' | 'OTHER';

export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'OVERDUE' | 'AUCTIONED' | 'NOTICE_SENT';

export type InterestType =
  | 'DAILY_PRO_RATA'
  | 'MONTHLY_SIMPLE'
  | 'MONTHLY_COMPOUND'
  | 'QUARTERLY_COMPOUND'
  | 'ANNUAL_COMPOUND';

export type CompoundFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export type PaymentType =
  | 'INTEREST_ONLY'
  | 'PRINCIPAL_ONLY'
  | 'COMBINED'
  | 'FULL_SETTLEMENT'
  | 'WAIVER_DISCOUNT';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';

export type AccentColor = 'gold' | 'emerald' | 'sapphire' | 'ruby' | 'slate' | 'amethyst';

export type MemberRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface PawnItem {
  id: string;
  loanId: string;
  itemName: string;
  metalType: MetalType;
  purity: string;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  valuationRatePerGram: number;
  estimatedValue: number;
  photos: string[];
  itemLockerLocation?: string;
  itemDescription?: string;
  addedWithTopupId?: string | null;
}

export interface GirviLoan {
  id: string;
  storeId: string;
  customerId: string;
  loanNo: string;
  loanDate: string; // YYYY-MM-DD
  dueDate?: string | null;

  /** Original disbursed amount. Later top-ups live in `topUps`. */
  principalAmount: number;
  monthlyInterestRate: number;
  interestType: InterestType;

  /**
   * Per-loan override of the shop's automatic simple -> compound switch.
   * null = follow the shop setting, true = always, false = never.
   */
  autoCompoundOverride: boolean | null;

  gracePeriodDays: number;
  vaultPouchNo: string;
  status: LoanStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;

  items: PawnItem[];
  topUps: LoanTopUp[];
}

export interface LoanTopUp {
  id: string;
  storeId: string;
  loanId: string;
  voucherNo: string;
  topUpDate: string; // YYYY-MM-DD
  amount: number;
  paymentMode: PaymentMode;
  /** Optional re-pricing of the loan from this date onwards. */
  newMonthlyRate?: number | null;
  notes?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  storeId: string;
  loanId: string;
  customerId: string;
  receiptNo: string;
  paymentDate: string; // YYYY-MM-DD
  totalAmount: number;
  interestPaid: number;
  principalPaid: number;
  discountWaived: number;
  previousPrincipal: number;
  remainingPrincipal: number;
  paymentType: PaymentType;
  paymentMode: PaymentMode;
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  storeId: string;
  customerCode: string;
  fullName: string;
  relativeName: string;
  relationType: 'S/O' | 'D/O' | 'W/O' | 'C/O';
  phone: string;
  alternatePhone?: string;
  address: string;
  city: string;
  pincode?: string;
  idProofType: 'Aadhar Card' | 'PAN Card' | 'Voter ID' | 'Driving License' | 'Ration Card' | 'Other';
  idProofNumber?: string;
  photoUrl?: string | null;
  idProofPhotoUrl?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** A shop. Replaces the old single-tenant ShopSettings blob. */
export interface Store {
  id: string;
  storeCode: string;
  shopName: string;
  tagline: string;
  proprietorName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  licenseNumber: string;
  currencySymbol: string;

  defaultMonthlyRate: number;
  defaultGracePeriodDays: number;
  defaultInterestType: InterestType;

  autoCompoundEnabled: boolean;
  autoCompoundAfterMonths: number;
  autoCompoundFrequency: CompoundFrequency;

  loanPrefix: string;
  receiptPrefix: string;
  customerPrefix: string;
  termsAndConditions: string;
  accentColor: AccentColor;
  autoLockMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreMember {
  storeId: string;
  userId: string;
  fullName: string;
  email: string;
  role: MemberRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}
