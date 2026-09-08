/**
 * Device-level app lock: fingerprint / face unlock with a PIN fallback.
 *
 * This is deliberately separate from Supabase auth. Supabase decides *who*
 * you are and what rows you may touch; this decides whether the phone in
 * someone's hand may open an already signed-in ledger.
 */

import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY_BIOMETRIC = 'girvi.lock.biometric';
const KEY_PIN_HASH = 'girvi.lock.pinHash';
const KEY_PIN_SALT = 'girvi.lock.pinSalt';
const KEY_AUTOLOCK = 'girvi.lock.minutes';

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** e.g. 'Fingerprint', 'Face Unlock' */
  label: string;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    let label = 'Biometric unlock';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = 'Face unlock';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = 'Fingerprint unlock';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = 'Iris unlock';
    }
    return { hasHardware, isEnrolled, label };
  } catch {
    return { hasHardware: false, isEnrolled: false, label: 'Biometric unlock' };
  }
}

export async function promptBiometric(reason = 'Unlock your Girvi ledger'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use PIN',
      // Allow the phone's own PIN/pattern as a fallback path.
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

// --- preferences -----------------------------------------------------------

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key)) === 'true';
  } catch {
    return false;
  }
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  return readFlag(KEY_BIOMETRIC);
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_BIOMETRIC, enabled ? 'true' : 'false');
}

export async function getAutoLockMinutes(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_AUTOLOCK);
    const value = raw ? parseInt(raw, 10) : 5;
    return Number.isFinite(value) ? value : 5;
  } catch {
    return 5;
  }
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  await SecureStore.setItemAsync(KEY_AUTOLOCK, String(minutes));
}

// --- PIN fallback ----------------------------------------------------------

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function setLockPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(KEY_PIN_SALT, salt);
  await SecureStore.setItemAsync(KEY_PIN_HASH, hash);
}

export async function hasLockPin(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(KEY_PIN_HASH));
  } catch {
    return false;
  }
}

export async function verifyLockPin(pin: string): Promise<boolean> {
  try {
    const [salt, stored] = await Promise.all([
      SecureStore.getItemAsync(KEY_PIN_SALT),
      SecureStore.getItemAsync(KEY_PIN_HASH),
    ]);
    if (!salt || !stored) return false;
    return (await hashPin(pin, salt)) === stored;
  } catch {
    return false;
  }
}

export async function clearLockPin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PIN_HASH);
  await SecureStore.deleteItemAsync(KEY_PIN_SALT);
}

/** Wipes lock settings — used on sign out so the next user starts clean. */
export async function clearLockSettings(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_BIOMETRIC).catch(() => {}),
    clearLockPin().catch(() => {}),
  ]);
}
