import {
  AuthSession,
  createTimestamp,
  DirectoryEntry,
  FamilyAlert,
  FamilyAlertType,
  FamilyLink,
  JourneyStatus,
  LatLngPoint,
  LinkStatus,
  LiveLocationState,
  LocationHistoryEntry,
  PrivateUserInfo,
  RolePreference,
  SAFE_REACH_LIMITS,
  SAFE_REACH_UNIQUE_ID_CHARS,
  SubscriptionStatus,
  TravelModeType,
  Trip,
  TripStatus,
  UserProfile,
} from '../types/safereach';

const SESSION_STORAGE_KEY = 'safereach_session_v1';

export function getStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.ownerUid || !parsed.email) return null;
    return {
      ownerUid: parsed.ownerUid,
      email: parsed.email,
      displayName: parsed.displayName || 'SafeReach User',
      isAdmin: Boolean(parsed.isAdmin),
    };
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors
  }
}

interface RawUserProfile extends Omit<UserProfile, 'createdAt' | 'updatedAt'> {
  createdAtMs?: number;
  updatedAtMs?: number;
}

interface RawPrivateInfo extends Omit<PrivateUserInfo, 'updatedAt'> {
  updatedAtMs?: number;
}

interface RawDirectoryEntry extends Omit<DirectoryEntry, 'createdAt'> {
  createdAtMs?: number;
}

interface RawFamilyLink extends Omit<FamilyLink, 'createdAt' | 'updatedAt'> {
  createdAtMs?: number;
  updatedAtMs?: number;
}

interface RawLiveState extends Omit<LiveLocationState, 'updatedAt'> {
  updatedAtMs?: number;
}

interface RawTrip extends Omit<Trip, 'startedAt' | 'updatedAt'> {
  startedAtMs?: number;
  updatedAtMs?: number;
}

interface RawHistoryEntry extends Omit<LocationHistoryEntry, 'recordedAt'> {
  recordedAtMs?: number;
}

interface RawFamilyAlert extends Omit<FamilyAlert, 'createdAt'> {
  createdAtMs?: number;
}

function hydrateProfile(raw: RawUserProfile): UserProfile {
  return {
    ...raw,
    createdAt: createTimestamp(raw.createdAtMs ?? Date.now()),
    updatedAt: createTimestamp(raw.updatedAtMs ?? Date.now()),
  };
}

function hydratePrivateInfo(raw: RawPrivateInfo): PrivateUserInfo {
  return {
    ...raw,
    updatedAt: createTimestamp(raw.updatedAtMs ?? Date.now()),
  };
}

function hydrateDirectory(raw: RawDirectoryEntry): DirectoryEntry {
  return {
    ...raw,
    createdAt: createTimestamp(raw.createdAtMs ?? Date.now()),
  };
}

function hydrateLink(raw: RawFamilyLink): FamilyLink {
  return {
    ...raw,
    createdAt: createTimestamp(raw.createdAtMs ?? Date.now()),
    updatedAt: createTimestamp(raw.updatedAtMs ?? Date.now()),
  };
}

function hydrateLive(raw: RawLiveState): LiveLocationState {
  return {
    ...raw,
    updatedAt: createTimestamp(raw.updatedAtMs ?? Date.now()),
  };
}

function hydrateTrip(raw: RawTrip): Trip {
  return {
    ...raw,
    startedAt: createTimestamp(raw.startedAtMs ?? Date.now()),
    updatedAt: createTimestamp(raw.updatedAtMs ?? Date.now()),
  };
}

function hydrateHistory(raw: RawHistoryEntry): LocationHistoryEntry {
  return {
    ...raw,
    recordedAt: createTimestamp(raw.recordedAtMs ?? Date.now()),
  };
}

function hydrateAlert(raw: RawFamilyAlert): FamilyAlert {
  return {
    ...raw,
    createdAt: createTimestamp(raw.createdAtMs ?? Date.now()),
  };
}

export class SafeReachApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  let parsedOk = false;
  try {
    if (text) {
      data = JSON.parse(text) as Record<string, unknown>;
      parsedOk = true;
    }
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string' && data.error
        ? data.error
        : `Request failed (${res.status})`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    throw new SafeReachApiError(msg, res.status, code);
  }
  if (!parsedOk) {
    const isBootHtml =
      text.includes('Starting Server') || text.trimStart().startsWith('<!');
    throw new SafeReachApiError(
      isBootHtml
        ? 'Server is still starting up. Please wait a few seconds and try again.'
        : 'Unexpected server response. Please refresh and try again.',
      res.status
    );
  }
  return data as T;
}

export function createAccountId(prefix = 'acct'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function secureRandomIndex(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function pickChar(charset: string): string {
  return charset[secureRandomIndex(charset.length)];
}

export function buildComplex10CharId(): string {
  const {UPPER, LOWER, DIGITS, SPECIALS} = SAFE_REACH_UNIQUE_ID_CHARS;
  const all = `${UPPER}${LOWER}${DIGITS}${SPECIALS}`;
  const chars: string[] = [
    pickChar(UPPER),
    pickChar(UPPER),
    pickChar(LOWER),
    pickChar(LOWER),
    pickChar(DIGITS),
    pickChar(DIGITS),
    pickChar(SPECIALS),
    pickChar(SPECIALS),
    pickChar(all),
    pickChar(all),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

export interface PendingSignupResponse {
  pendingId: string;
  email: string;
  displayName: string;
  expiresAtMs: number;
  deliveryMode: 'smtp' | 'relay' | 'brevo' | 'resend';
}

export interface SignupVerificationResult {
  completed: boolean;
  otpVerified: boolean;
  pendingId?: string;
  email?: string;
  displayName?: string;
  expiresAtMs?: number;
  session?: AuthSession;
  accountId?: string;
  safeReachId?: string;
  profile?: UserProfile;
}

export async function requestSignupEmailConfirmation(params: {
  displayName: string;
  email: string;
  password: string;
  rolePreference: RolePreference;
}): Promise<PendingSignupResponse> {
  return apiFetch<PendingSignupResponse>('/api/auth/signup/request', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function resendSignupConfirmationEmail(
  pendingId: string
): Promise<PendingSignupResponse> {
  return apiFetch<PendingSignupResponse>('/api/auth/signup/resend', {
    method: 'POST',
    body: JSON.stringify({pendingId}),
  });
}

export async function verifySignupOtp(
  pendingId: string,
  otp: string
): Promise<SignupVerificationResult> {
  const data = await apiFetch<
    Omit<SignupVerificationResult, 'profile'> & {profile?: RawUserProfile}
  >('/api/auth/signup/verify-otp', {
    method: 'POST',
    body: JSON.stringify({pendingId, otp}),
  });
  return {
    ...data,
    profile: data.profile ? hydrateProfile(data.profile) : undefined,
  };
}


export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<{session: AuthSession; accounts: UserProfile[]}> {
  const data = await apiFetch<{
    session: AuthSession;
    accounts: RawUserProfile[];
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({email, password}),
  });
  return {
    session: data.session,
    accounts: data.accounts.map(hydrateProfile),
  };
}

export interface WorkspaceSnapshot {
  allowAllUsers: boolean;
  accounts: UserProfile[];
  privateInfoByUid: Record<string, PrivateUserInfo>;
  liveState: LiveLocationState | null;
  trips: Trip[];
  history: LocationHistoryEntry[];
  allIncomingLinks: FamilyLink[];
  allOutgoingLinks: FamilyLink[];
  allAlerts: FamilyAlert[];
  allPlatformUsers: UserProfile[];
}

export async function fetchWorkspaceSnapshot(
  ownerUid: string,
  activeAccountId: string | null,
  email: string
): Promise<WorkspaceSnapshot> {
  const qs = new URLSearchParams({
    activeAccountId: activeAccountId || '',
    email: email || '',
  });
  const raw = await apiFetch<{
    allowAllUsers?: boolean;
    accounts: RawUserProfile[];
    privateInfoByUid: Record<string, RawPrivateInfo>;
    liveState: RawLiveState | null;
    trips: RawTrip[];
    history: RawHistoryEntry[];
    allIncomingLinks: RawFamilyLink[];
    allOutgoingLinks: RawFamilyLink[];
    allAlerts: RawFamilyAlert[];
    allPlatformUsers: RawUserProfile[];
  }>(`/api/workspace/${encodeURIComponent(ownerUid)}?${qs.toString()}`);

  const privateInfoByUid: Record<string, PrivateUserInfo> = {};
  for (const [k, v] of Object.entries(raw.privateInfoByUid || {})) {
    privateInfoByUid[k] = hydratePrivateInfo(v);
  }

  return {
    allowAllUsers: Boolean(raw.allowAllUsers),
    accounts: (raw.accounts || []).map(hydrateProfile),
    privateInfoByUid,
    liveState: raw.liveState ? hydrateLive(raw.liveState) : null,
    trips: (raw.trips || []).map(hydrateTrip),
    history: (raw.history || []).map(hydrateHistory),
    allIncomingLinks: (raw.allIncomingLinks || []).map(hydrateLink),
    allOutgoingLinks: (raw.allOutgoingLinks || []).map(hydrateLink),
    allAlerts: (raw.allAlerts || []).map(hydrateAlert),
    allPlatformUsers: (raw.allPlatformUsers || []).map(hydrateProfile),
  };
}

export async function fetchApprovedTravelerLive(
  travelerUid: string,
  familyUid: string
): Promise<{live: LiveLocationState | null; activeTrip: Trip | null}> {
  const qs = new URLSearchParams({familyUid});
  const raw = await apiFetch<{
    live: RawLiveState | null;
    activeTrip: RawTrip | null;
  }>(`/api/traveler-live/${encodeURIComponent(travelerUid)}?${qs.toString()}`);
  return {
    live: raw.live ? hydrateLive(raw.live) : null,
    activeTrip: raw.activeTrip ? hydrateTrip(raw.activeTrip) : null,
  };
}

export function subscribeToSafeReachSync(
  onSync: () => void,
  fallbackIntervalMs = 1000
): () => void {
  let es: EventSource | null = null;
  if (typeof EventSource !== 'undefined') {
    es = new EventSource('/api/stream');
    es.addEventListener('sync', () => {
      onSync();
    });
  }
  const pollId = window.setInterval(() => {
    if (!es || es.readyState !== EventSource.OPEN) {
      onSync();
    }
  }, fallbackIntervalMs);

  return () => {
    if (es) {
      es.close();
    }
    window.clearInterval(pollId);
  };
}


export async function registerSafeReachProfile(params: {
  accountId?: string;
  ownerUid: string;
  email: string;
  displayName: string;
  emergencyContactName: string;
  rolePreference: RolePreference;
  defaultGeofenceRadiusMeters: number;
  isAdminCaller?: boolean;
}): Promise<{accountId: string; safeReachId: string}> {
  const data = await apiFetch<{accountId: string; safeReachId: string}>(
    '/api/accounts',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
  return {accountId: data.accountId, safeReachId: data.safeReachId};
}

export async function lookupDirectoryBySafeReachId(
  rawId: string
): Promise<DirectoryEntry | null> {
  const safeReachId = rawId.trim();
  const isValid =
    SAFE_REACH_LIMITS.SAFE_REACH_ID_REGEX.test(safeReachId) ||
    SAFE_REACH_LIMITS.LEGACY_SAFE_REACH_ID_REGEX.test(safeReachId);
  if (!isValid) {
    throw new Error(
      'Enter a valid 10-character Unique ID containing capital letters, small letters, numbers, and special symbols.'
    );
  }

  try {
    const res = await fetch(`/api/directory/${encodeURIComponent(safeReachId)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error('Unable to look up Unique ID.');
    }
    const data = (await res.json()) as {entry: RawDirectoryEntry};
    return data.entry ? hydrateDirectory(data.entry) : null;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('Unable to look up Unique ID.');
  }
}

export async function adminLookupUserByUniqueId(
  rawUniqueId: string
): Promise<{directory: DirectoryEntry; profile: UserProfile} | null> {
  const safeReachId = rawUniqueId.trim();
  const isValid =
    SAFE_REACH_LIMITS.SAFE_REACH_ID_REGEX.test(safeReachId) ||
    SAFE_REACH_LIMITS.LEGACY_SAFE_REACH_ID_REGEX.test(safeReachId);
  if (!isValid) {
    throw new Error(
      'Enter a valid 10-character Unique ID containing capital letters, small letters, numbers, and special symbols.'
    );
  }

  const res = await fetch(`/api/directory/${encodeURIComponent(safeReachId)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Unable to look up Unique ID.');
  }
  const data = (await res.json()) as {
    entry: RawDirectoryEntry | null;
    profile: RawUserProfile | null;
  };
  if (!data.entry || !data.profile) return null;
  return {
    directory: hydrateDirectory(data.entry),
    profile: hydrateProfile(data.profile),
  };
}

export async function adminUpdateUserAccessAndProfile(params: {
  targetProfile: UserProfile;
  displayName: string;
  rolePreference: RolePreference;
  subscriptionStatus: SubscriptionStatus;
  accessGranted: boolean;
  subscriptionNote: string;
}): Promise<void> {
  const session = getStoredSession();
  await apiFetch('/api/admin/update-user', {
    method: 'POST',
    body: JSON.stringify({
      callerEmail: session?.email || '',
      targetUid: params.targetProfile.uid,
      displayName: params.displayName,
      rolePreference: params.rolePreference,
      subscriptionStatus: params.subscriptionStatus,
      accessGranted: params.accessGranted,
      subscriptionNote: params.subscriptionNote,
    }),
  });
}

export async function adminSetGlobalAccess(
  allowAllUsers: boolean
): Promise<{allowAllUsers: boolean}> {
  const session = getStoredSession();
  return apiFetch<{allowAllUsers: boolean}>('/api/admin/global-access', {
    method: 'POST',
    body: JSON.stringify({
      callerEmail: session?.email || '',
      allowAllUsers,
    }),
  });
}

export async function sendFamilyLinkRequest(params: {
  traveler: DirectoryEntry;
  familyUid: string;
  familyOwnerUid: string;
  familyName: string;
  relationship: string;
}): Promise<void> {
  await apiFetch('/api/family-links/request', {
    method: 'POST',
    body: JSON.stringify({
      travelerUid: params.traveler.uid,
      familyUid: params.familyUid,
      familyOwnerUid: params.familyOwnerUid,
      familyName: params.familyName,
      relationship: params.relationship,
    }),
  });
}

export async function respondToFamilyLink(
  link: FamilyLink,
  status: 'approved' | 'revoked'
): Promise<void> {
  await apiFetch('/api/family-links/respond', {
    method: 'POST',
    body: JSON.stringify({
      linkId: link.id,
      status,
    }),
  });
}

export async function removeFamilyLink(link: FamilyLink): Promise<void> {
  await apiFetch(`/api/family-links/${encodeURIComponent(link.id)}`, {
    method: 'DELETE',
  });
}

export async function updatePrivateSettings(params: {
  uid: string;
  ownerUid: string;
  email: string;
  emergencyContactName: string;
  defaultGeofenceRadiusMeters: number;
}): Promise<void> {
  await apiFetch('/api/private-settings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function dispatchFamilyAlerts(params: {
  travelerUid: string;
  travelerOwnerUid: string;
  travelerName: string;
  approvedFamilyLinks: FamilyLink[];
  type: FamilyAlertType;
  message: string;
  locationLabel: string;
  lat: number;
  lng: number;
}): Promise<void> {
  if (params.approvedFamilyLinks.length === 0) return;
  await apiFetch('/api/alerts/dispatch', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function startJourney(params: {
  uid: string;
  ownerUid: string;
  travelerName: string;
  approvedFamilyLinks: FamilyLink[];
  originName: string;
  originPoint: LatLngPoint;
  destinationName: string;
  destinationPoint: LatLngPoint;
  geofenceRadiusMeters: number;
  travelMode: TravelModeType;
  expectedEncodedPolyline: string;
  distanceToDestinationMeters: number;
}): Promise<string> {
  const data = await apiFetch<{tripId: string}>('/api/trips/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.tripId;
}

export async function updateLiveTelemetry(params: {
  uid: string;
  ownerUid: string;
  point: LatLngPoint;
  accuracyMeters: number;
  locationLabel: string;
  status: JourneyStatus;
  isSharingEnabled: boolean;
  activeTripId: string;
  destinationName: string;
  destinationPoint: LatLngPoint;
  geofenceRadiusMeters: number;
  distanceToDestinationMeters: number;
  routeDeviationMeters: number;
  actualEncodedPolyline?: string;
  tripStatus?: TripStatus;
  maxDeviationMeters?: number;
  arrivedAtMs?: number;
  recordHistory?: boolean;
}): Promise<void> {
  await apiFetch('/api/telemetry/update', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function stopLocationSharing(params: {
  uid: string;
  ownerUid: string;
  activeTripId: string;
  currentPoint: LatLngPoint;
  locationLabel: string;
}): Promise<void> {
  await apiFetch('/api/telemetry/stop', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function triggerSosAlert(params: {
  uid: string;
  ownerUid: string;
  travelerName: string;
  approvedFamilyLinks: FamilyLink[];
  point: LatLngPoint;
  locationLabel: string;
  activeTripId: string;
  destinationName: string;
  destinationPoint: LatLngPoint;
  geofenceRadiusMeters: number;
  distanceToDestinationMeters: number;
  actualEncodedPolyline?: string;
}): Promise<void> {
  await updateLiveTelemetry({
    uid: params.uid,
    ownerUid: params.ownerUid,
    point: params.point,
    accuracyMeters: 10,
    locationLabel: params.locationLabel || 'SOS Location',
    status: 'sos_alert',
    isSharingEnabled: true,
    activeTripId: params.activeTripId,
    destinationName: params.destinationName,
    destinationPoint: params.destinationPoint,
    geofenceRadiusMeters: params.geofenceRadiusMeters,
    distanceToDestinationMeters: params.distanceToDestinationMeters,
    routeDeviationMeters: 0,
    actualEncodedPolyline: params.actualEncodedPolyline,
    tripStatus: params.activeTripId ? 'sos_alert' : undefined,
    recordHistory: true,
  });

  if (params.approvedFamilyLinks.length > 0) {
    await dispatchFamilyAlerts({
      travelerUid: params.uid,
      travelerOwnerUid: params.ownerUid,
      travelerName: params.travelerName,
      approvedFamilyLinks: params.approvedFamilyLinks,
      type: 'sos_alert',
      message: `URGENT SOS from ${params.travelerName} near ${
        params.locationLabel || 'current GPS coordinates'
      }.`,
      locationLabel: params.locationLabel || 'SOS Location',
      lat: params.point.lat,
      lng: params.point.lng,
    });
  }
}

export async function markAlertRead(alertId: string): Promise<void> {
  await apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/read`, {
    method: 'POST',
  });
}

export async function deleteHistoryEntry(
  uid: string,
  entryId: string
): Promise<void> {
  await apiFetch(
    `/api/history/${encodeURIComponent(uid)}/${encodeURIComponent(entryId)}`,
    {method: 'DELETE'}
  );
}

export async function deleteSafeReachAccount(
  profile: UserProfile,
  _callerOwnerUid: string,
  _isAdminCaller = false
): Promise<void> {
  await apiFetch(`/api/accounts/${encodeURIComponent(profile.uid)}`, {
    method: 'DELETE',
  });
}

export async function deleteMultipleSafeReachAccounts(
  profiles: UserProfile[],
  callerOwnerUid: string,
  isAdminCaller = false
): Promise<void> {
  await apiFetch('/api/accounts/delete-all', {
    method: 'POST',
    body: JSON.stringify({
      accountIds: profiles.map((p) => p.uid),
      ownerUid: callerOwnerUid,
      clearAllPlatform: isAdminCaller,
    }),
  });
}
