import { Action, ActionReducer, INIT, MetaReducer } from '@ngrx/store';
import { LoginResponse } from 'src/app/modules/shared/models/login/loginResponse.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { isTokenExpired } from 'src/app/modules/shared/utils/token-expiry.util';
import { AppState } from '../app/app.reducer';
import { SettingsState } from '../settings/settings.reducer';

/**
 * Single persistence layer for NgRx runtime state.
 *
 * NgRx is the only source of truth at runtime. This meta-reducer:
 *  1. on store INIT: migrates legacy storage keys once, removes obsolete
 *     keys, and hydrates the initial state from localStorage;
 *  2. after every action: writes the persisted slices back when (and only
 *     when) their reference changed.
 *
 * Each concern has exactly one versioned key. Components and services never
 * touch these keys directly; they dispatch actions instead.
 */
export const PERSISTED_KEYS = {
  auth: 'mtb.state.auth.v1',
  exchange: 'mtb.state.exchange.v1',
  darkMode: 'mtb.state.dark-mode.v1',
  onboarding: 'mtb.state.onboarding.v1',
  language: 'mtb.state.language.v1',
  liveFollowThreshold: 'mtb.state.live-follow-threshold.v1',
} as const;

/** Languages the app ships translations for (src/assets/i18n). */
export const SUPPORTED_LANGUAGES = ['en', 'nl'] as const;

/** Keys written by earlier app versions; migrated into PERSISTED_KEYS on startup. */
export const LEGACY_KEYS = {
  auth: 'mtb.auth.session',
  exchange: 'mtb.selected-exchange.v1',
  theme: 'app.theme',
  darkModeDefaultMigrated: 'mtb.darkmode.default.v1',
  onboarding: 'mtb.onboarding.complete',
} as const;

/** Prefixes of the pre-security-migration localStorage reducer's keys. */
const LEGACY_STATE_PREFIXES = ['appState', 'settingsState', 'keyZonesState'];
const OBSOLETE_KEYS = ['mtb_version'];

/** Shape of the slices this layer reads/writes. */
interface PersistableState {
  appState: AppState;
  settingsState: SettingsState;
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can throw (private mode / blocked site data).
    return null;
  }
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // In-memory state remains authoritative when storage is unavailable.
  }
}

function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore: storage unavailable.
  }
}

// ---------------------------------------------------------------------------
// Migration + cleanup (runs once per store creation, before hydration)
// ---------------------------------------------------------------------------

/** Moves a legacy value to its new key unless the new key already exists. */
function moveKey(
  storage: Storage,
  legacyKey: string,
  newKey: string,
  convert: (raw: string) => string | null = (raw) => raw,
): void {
  const legacy = safeGet(storage, legacyKey);
  if (legacy === null) return;
  if (safeGet(storage, newKey) === null) {
    const converted = convert(legacy);
    if (converted !== null) safeSet(storage, newKey, converted);
  }
  safeRemove(storage, legacyKey);
}

export function migrateLegacyStorage(storage: Storage): void {
  moveKey(storage, LEGACY_KEYS.auth, PERSISTED_KEYS.auth);
  moveKey(storage, LEGACY_KEYS.exchange, PERSISTED_KEYS.exchange);
  moveKey(storage, LEGACY_KEYS.onboarding, PERSISTED_KEYS.onboarding, (raw) =>
    raw === '1' ? 'true' : null,
  );

  // Dark mode: the old app forced dark once (flag `mtb.darkmode.default.v1`),
  // after which the user's choice lived in `app.theme`.
  const theme = safeGet(storage, LEGACY_KEYS.theme);
  const defaultMigrated =
    safeGet(storage, LEGACY_KEYS.darkModeDefaultMigrated) === '1';
  if (
    (theme !== null || defaultMigrated) &&
    safeGet(storage, PERSISTED_KEYS.darkMode) === null
  ) {
    const dark = !(defaultMigrated && theme === 'light');
    safeSet(storage, PERSISTED_KEYS.darkMode, JSON.stringify(dark));
  }
  safeRemove(storage, LEGACY_KEYS.theme);
  safeRemove(storage, LEGACY_KEYS.darkModeDefaultMigrated);

  // Remove state written by the pre-security-migration localStorage reducer.
  for (let index = storage.length - 1; index >= 0; index--) {
    let key: string | null = null;
    try {
      key = storage.key(index);
    } catch {
      break;
    }
    if (
      key &&
      LEGACY_STATE_PREFIXES.some(
        (prefix) => key === prefix || key!.startsWith(`${prefix}_`),
      )
    ) {
      safeRemove(storage, key);
    }
  }
  OBSOLETE_KEYS.forEach((key) => safeRemove(storage, key));
}

// ---------------------------------------------------------------------------
// Per-concern (de)serialization
// ---------------------------------------------------------------------------

function readJson(storage: Storage, key: string): unknown {
  const raw = safeGet(storage, key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    safeRemove(storage, key);
    return undefined;
  }
}

/** Fails closed: expired, opaque (unknown expiry) or malformed tokens are discarded. */
function readAuth(storage: Storage): LoginResponse | null {
  const parsed = readJson(storage, PERSISTED_KEYS.auth) as
    | Partial<LoginResponse>
    | undefined;
  if (parsed === undefined) return null;

  if (
    !parsed ||
    typeof parsed.AccessToken !== 'string' ||
    !parsed.AccessToken.trim()
  ) {
    safeRemove(storage, PERSISTED_KEYS.auth);
    return null;
  }

  const token = new LoginResponse();
  token.AccessToken = parsed.AccessToken;
  token.ExpiresIn =
    typeof parsed.ExpiresIn === 'string' ? parsed.ExpiresIn : '';
  token.CreatedAt = parsed.CreatedAt ? new Date(parsed.CreatedAt) : new Date();

  if (isTokenExpired(token)) {
    safeRemove(storage, PERSISTED_KEYS.auth);
    return null;
  }
  return token;
}

function writeAuth(storage: Storage, token: LoginResponse | null): void {
  if (!token?.AccessToken) {
    safeRemove(storage, PERSISTED_KEYS.auth);
    return;
  }
  safeSet(
    storage,
    PERSISTED_KEYS.auth,
    JSON.stringify({
      AccessToken: token.AccessToken,
      ExpiresIn: token.ExpiresIn,
      CreatedAt: token.CreatedAt,
    }),
  );
}

function readExchange(storage: Storage): Exchange | null {
  const parsed = readJson(storage, PERSISTED_KEYS.exchange) as
    | Partial<Exchange>
    | undefined;
  if (parsed === undefined) return null;

  const hasId =
    !!parsed && typeof parsed.Id === 'number' && Number.isFinite(parsed.Id);
  const hasName =
    !!parsed &&
    typeof parsed.Name === 'string' &&
    parsed.Name.trim().length > 0;
  if (!hasId && !hasName) {
    safeRemove(storage, PERSISTED_KEYS.exchange);
    return null;
  }

  const exchange = new Exchange();
  if (hasId) exchange.Id = parsed!.Id as number;
  if (hasName) exchange.Name = (parsed!.Name as string).trim();
  return exchange;
}

function writeExchange(storage: Storage, exchange: Exchange | null): void {
  if (!exchange) {
    safeRemove(storage, PERSISTED_KEYS.exchange);
    return;
  }
  safeSet(
    storage,
    PERSISTED_KEYS.exchange,
    JSON.stringify({ Id: exchange.Id, Name: exchange.Name }),
  );
}

function readBoolean(storage: Storage, key: string): boolean | undefined {
  const parsed = readJson(storage, key);
  if (parsed === undefined) return undefined;
  if (typeof parsed !== 'boolean') {
    safeRemove(storage, key);
    return undefined;
  }
  return parsed;
}

function readLanguage(storage: Storage): string | undefined {
  const parsed = readJson(storage, PERSISTED_KEYS.language);
  if (parsed === undefined) return undefined;
  if (
    typeof parsed !== 'string' ||
    !(SUPPORTED_LANGUAGES as readonly string[]).includes(parsed)
  ) {
    safeRemove(storage, PERSISTED_KEYS.language);
    return undefined;
  }
  return parsed;
}

/** Chart live-follow detach threshold (bars): a finite number >= 0. */
function readLiveFollowThreshold(storage: Storage): number | undefined {
  const parsed = readJson(storage, PERSISTED_KEYS.liveFollowThreshold);
  if (parsed === undefined) return undefined;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) {
    safeRemove(storage, PERSISTED_KEYS.liveFollowThreshold);
    return undefined;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Hydration + write-back
// ---------------------------------------------------------------------------

export function hydrateState<S extends PersistableState>(
  state: S,
  storage: Storage,
): S {
  const token = readAuth(storage);
  const exchange = readExchange(storage);
  const darkMode = readBoolean(storage, PERSISTED_KEYS.darkMode);
  const onboardingDone = readBoolean(storage, PERSISTED_KEYS.onboarding);
  const language = readLanguage(storage);
  const liveFollowThresholdBars = readLiveFollowThreshold(storage);

  return {
    ...state,
    appState: {
      ...state.appState,
      ...(token ? { token } : {}),
      ...(onboardingDone !== undefined ? { onboardingDone } : {}),
      ...(language !== undefined ? { language } : {}),
    },
    settingsState: {
      ...state.settingsState,
      ...(exchange ? { exchange } : {}),
      ...(darkMode !== undefined ? { darkModeEnabled: darkMode } : {}),
      ...(liveFollowThresholdBars !== undefined ? { liveFollowThresholdBars } : {}),
    },
  };
}

export function persistChanges(
  prev: PersistableState,
  next: PersistableState,
  storage: Storage,
): void {
  if (prev.appState?.token !== next.appState?.token) {
    writeAuth(storage, next.appState?.token ?? null);
  }
  if (prev.appState?.onboardingDone !== next.appState?.onboardingDone) {
    if (next.appState?.onboardingDone) {
      safeSet(storage, PERSISTED_KEYS.onboarding, 'true');
    } else {
      safeRemove(storage, PERSISTED_KEYS.onboarding);
    }
  }
  if (prev.appState?.language !== next.appState?.language) {
    const language = next.appState?.language;
    if (language && (SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
      safeSet(storage, PERSISTED_KEYS.language, JSON.stringify(language));
    } else {
      safeRemove(storage, PERSISTED_KEYS.language);
    }
  }
  if (prev.settingsState?.exchange !== next.settingsState?.exchange) {
    writeExchange(storage, next.settingsState?.exchange ?? null);
  }
  if (
    prev.settingsState?.darkModeEnabled !== next.settingsState?.darkModeEnabled
  ) {
    safeSet(
      storage,
      PERSISTED_KEYS.darkMode,
      JSON.stringify(next.settingsState?.darkModeEnabled !== false),
    );
  }
  if (
    prev.settingsState?.liveFollowThresholdBars !==
    next.settingsState?.liveFollowThresholdBars
  ) {
    const bars = next.settingsState?.liveFollowThresholdBars;
    if (typeof bars === 'number' && Number.isFinite(bars) && bars >= 0) {
      safeSet(storage, PERSISTED_KEYS.liveFollowThreshold, JSON.stringify(bars));
    } else {
      safeRemove(storage, PERSISTED_KEYS.liveFollowThreshold);
    }
  }
}

export function statePersistenceMetaReducer<S extends PersistableState>(
  reducer: ActionReducer<S>,
): ActionReducer<S> {
  return (state: S | undefined, action: Action): S => {
    const next = reducer(state, action);
    const storage = getStorage();
    if (!storage) return next;

    if (action.type === INIT) {
      migrateLegacyStorage(storage);
      return hydrateState(next, storage);
    }

    if (state && next !== state) {
      persistChanges(state, next, storage);
    }
    return next;
  };
}

export const persistenceMetaReducers: MetaReducer<any>[] = [
  statePersistenceMetaReducer,
];
