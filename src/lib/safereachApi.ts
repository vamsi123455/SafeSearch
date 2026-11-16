import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DirectoryEntry,
  FamilyAlertType,
  FamilyLink,
  JourneyStatus,
  LatLngPoint,
  LinkStatus,
  RolePreference,
  SAFE_REACH_LIMITS,
  SAFE_REACH_UNIQUE_ID_CHARS,
  SubscriptionStatus,
  TravelModeType,
  TripStatus,
  UserProfile,
} from '../types/safereach';
import {db, handleFirestoreError, OperationType} from './firebase';

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function clampRadius(meters: number): number {
  const num = Number.isFinite(meters) ? meters : 300;
  return Math.max(
    SAFE_REACH_LIMITS.GEOFENCE_MIN_METERS,
    Math.min(SAFE_REACH_LIMITS.GEOFENCE_MAX_METERS, Math.round(num))
  );
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

/**
 * Generates an exact 10-character Unique ID guaranteed to include
 * uppercase letters, lowercase letters, digits, and special symbols.
 */
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

export async function generateUniqueSafeReachId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = buildComplex10CharId();
    try {
      const snap = await getDoc(doc(db, 'directory', candidate));
      if (!snap.exists()) {
        return candidate;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `directory/${candidate}`);
    }
  }
  return buildComplex10CharId();
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
  const accountId = params.accountId || createAccountId('acct');
  const safeReachId = await generateUniqueSafeReachId();
  const displayName =
    clampString(params.displayName, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX) ||
    'SafeReach User';
  const email =
    clampString(params.email, SAFE_REACH_LIMITS.EMAIL_MAX) ||
    'user@safereach.app';
  const emergencyContactName = clampString(
    params.emergencyContactName,
    SAFE_REACH_LIMITS.DISPLAY_NAME_MAX
  );
  const radius = clampRadius(params.defaultGeofenceRadiusMeters);

  const subscriptionStatus: SubscriptionStatus = params.isAdminCaller
    ? 'active'
    : 'pending';
  const accessGranted = Boolean(params.isAdminCaller);
  const subscriptionNote = params.isAdminCaller
    ? 'Admin account active'
    : 'Awaiting admin approval';

  const batch = writeBatch(db);

  batch.set(doc(db, 'users', accountId), {
    uid: accountId,
    ownerUid: params.ownerUid,
    safeReachId,
    displayName,
    rolePreference: params.rolePreference,
    isSharingEnabled: false,
    status: 'idle' as JourneyStatus,
    subscriptionStatus,
    accessGranted,
    subscriptionNote,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'directory', safeReachId), {
    safeReachId,
    uid: accountId,
    ownerUid: params.ownerUid,
    displayName,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', accountId, 'private', 'info'), {
    uid: accountId,
    ownerUid: params.ownerUid,
    email,
    emergencyContactName,
    defaultGeofenceRadiusMeters: radius,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', accountId, 'live', 'current'), {
    uid: accountId,
    ownerUid: params.ownerUid,
    lat: 13.6288,
    lng: 79.4192,
    accuracyMeters: 25,
    locationLabel: 'Location sharing not started',
    status: 'idle' as JourneyStatus,
    isSharingEnabled: false,
    activeTripId: '',
    destinationName: '',
    destinationLat: 0,
    destinationLng: 0,
    geofenceRadiusMeters: radius,
    distanceToDestinationMeters: 0,
    routeDeviationMeters: 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {accountId, safeReachId};
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${accountId}`);
  }
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

  const path = `directory/${safeReachId}`;
  try {
    const snap = await getDoc(doc(db, 'directory', safeReachId));
    if (!snap.exists()) return null;
    return snap.data() as DirectoryEntry;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function adminLookupUserByUniqueId(
  rawUniqueId: string
): Promise<{directory: DirectoryEntry; profile: UserProfile} | null> {
  const entry = await lookupDirectoryBySafeReachId(rawUniqueId);
  if (!entry) return null;

  const userPath = `users/${entry.uid}`;
  try {
    const userSnap = await getDoc(doc(db, 'users', entry.uid));
    if (!userSnap.exists()) return null;
    return {
      directory: entry,
      profile: userSnap.data() as UserProfile,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function adminUpdateUserAccessAndProfile(params: {
  targetProfile: UserProfile;
  displayName: string;
  rolePreference: RolePreference;
  subscriptionStatus: SubscriptionStatus;
  accessGranted: boolean;
  subscriptionNote: string;
}): Promise<void> {
  const targetUid = params.targetProfile.uid;
  const cleanName =
    clampString(params.displayName, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX) ||
    params.targetProfile.displayName ||
    'SafeReach User';
  const cleanNote = clampString(
    params.subscriptionNote,
    SAFE_REACH_LIMITS.SUBSCRIPTION_NOTE_MAX
  );
  const shouldPauseSharing =
    !params.accessGranted || params.subscriptionStatus !== 'active';

  const batch = writeBatch(db);

  const userUpdate: Record<string, unknown> = {
    ownerUid: params.targetProfile.ownerUid || targetUid,
    displayName: cleanName,
    rolePreference: params.rolePreference,
    subscriptionStatus: params.subscriptionStatus,
    accessGranted: params.accessGranted,
    subscriptionNote: cleanNote,
    updatedAt: serverTimestamp(),
  };

  if (shouldPauseSharing) {
    userUpdate.isSharingEnabled = false;
    userUpdate.status = 'idle' as JourneyStatus;
  }

  batch.update(doc(db, 'users', targetUid), userUpdate);

  if (cleanName !== params.targetProfile.displayName) {
    batch.update(doc(db, 'directory', params.targetProfile.safeReachId), {
      ownerUid: params.targetProfile.ownerUid || targetUid,
      displayName: cleanName,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }

  if (shouldPauseSharing) {
    try {
      const liveSnap = await getDoc(doc(db, 'users', targetUid, 'live', 'current'));
      if (liveSnap.exists()) {
        await updateDoc(doc(db, 'users', targetUid, 'live', 'current'), {
          isSharingEnabled: false,
          status: 'idle' as JourneyStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Live telemetry pause is best-effort; rules already block unsubscribed reads/writes
    }
  }
}

export async function sendFamilyLinkRequest(params: {
  traveler: DirectoryEntry;
  familyUid: string;
  familyOwnerUid: string;
  familyName: string;
  relationship: string;
}): Promise<void> {
  if (params.traveler.uid === params.familyUid) {
    throw new Error(
      'Switch to another SafeReach account (or create a duplicate-email test account) to test linking.'
    );
  }

  const linkId = `${params.traveler.uid}_${params.familyUid}`;
  const path = `familyLinks/${linkId}`;
  const cleanRel =
    clampString(params.relationship, SAFE_REACH_LIMITS.RELATIONSHIP_MAX) ||
    'Family';
  const cleanFamilyName =
    clampString(params.familyName, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX) ||
    'Family Member';
  const cleanTravelerName = clampString(
    params.traveler.displayName,
    SAFE_REACH_LIMITS.DISPLAY_NAME_MAX
  );
  const travelerOwnerUid = params.traveler.ownerUid || params.traveler.uid;

  try {
    const existingQuerySnap = await getDocs(
      query(
        collection(db, 'familyLinks'),
        where('familyOwnerUid', '==', params.familyOwnerUid),
        where('travelerUid', '==', params.traveler.uid)
      )
    );
    const matchingDoc = existingQuerySnap.docs.find((d) => d.id === linkId);
    if (matchingDoc) {
      const current = matchingDoc.data() as FamilyLink;
      if (current.status === 'approved') {
        throw new Error(`You are already linked with ${cleanTravelerName}.`);
      }
      if (current.status === 'pending') {
        throw new Error(
          `A request is already pending approval from ${cleanTravelerName}.`
        );
      }
      await updateDoc(doc(db, 'familyLinks', linkId), {
        travelerOwnerUid,
        familyOwnerUid: params.familyOwnerUid,
        relationship: cleanRel,
        familyName: cleanFamilyName,
        status: 'pending' as LinkStatus,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    await setDoc(doc(db, 'familyLinks', linkId), {
      id: linkId,
      travelerUid: params.traveler.uid,
      travelerOwnerUid,
      travelerSafeReachId: params.traveler.safeReachId,
      travelerName: cleanTravelerName,
      familyUid: params.familyUid,
      familyOwnerUid: params.familyOwnerUid,
      familyName: cleanFamilyName,
      relationship: cleanRel,
      status: 'pending' as LinkStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already linked') ||
        error.message.includes('already pending') ||
        error.message.includes('Switch to another'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function respondToFamilyLink(
  link: FamilyLink,
  status: 'approved' | 'revoked'
): Promise<void> {
  const path = `familyLinks/${link.id}`;
  const travelerOwnerUid = link.travelerOwnerUid || link.travelerUid;
  const familyOwnerUid = link.familyOwnerUid || link.familyUid;
  const accessId = `${link.travelerUid}_${familyOwnerUid}`;

  const batch = writeBatch(db);
  batch.update(doc(db, 'familyLinks', link.id), {
    travelerOwnerUid,
    familyOwnerUid,
    status,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'familyAccess', accessId), {
    id: accessId,
    travelerUid: link.travelerUid,
    travelerOwnerUid,
    familyOwnerUid,
    status,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeFamilyLink(link: FamilyLink): Promise<void> {
  const path = `familyLinks/${link.id}`;
  try {
    await deleteDoc(doc(db, 'familyLinks', link.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updatePrivateSettings(params: {
  uid: string;
  ownerUid: string;
  email: string;
  emergencyContactName: string;
  defaultGeofenceRadiusMeters: number;
}): Promise<void> {
  const path = `users/${params.uid}/private/info`;
  try {
    await setDoc(doc(db, 'users', params.uid, 'private', 'info'), {
      uid: params.uid,
      ownerUid: params.ownerUid,
      email:
        clampString(params.email, SAFE_REACH_LIMITS.EMAIL_MAX) ||
        'user@safereach.app',
      emergencyContactName: clampString(
        params.emergencyContactName,
        SAFE_REACH_LIMITS.DISPLAY_NAME_MAX
      ),
      defaultGeofenceRadiusMeters: clampRadius(params.defaultGeofenceRadiusMeters),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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

  const batch = writeBatch(db);
  const cleanTravelerName =
    clampString(params.travelerName, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX) ||
    'Family Member';
  const cleanMessage = clampString(
    params.message,
    SAFE_REACH_LIMITS.ALERT_MESSAGE_MAX
  );
  const cleanLocationLabel = clampString(
    params.locationLabel,
    SAFE_REACH_LIMITS.LOCATION_LABEL_MAX
  );

  for (const link of params.approvedFamilyLinks.slice(0, 20)) {
    const alertId = createAccountId('alert');
    batch.set(doc(db, 'familyAlerts', alertId), {
      id: alertId,
      travelerUid: params.travelerUid,
      travelerOwnerUid: params.travelerOwnerUid,
      travelerName: cleanTravelerName,
      recipientUid: link.familyUid,
      recipientOwnerUid: link.familyOwnerUid || link.familyUid,
      type: params.type,
      message: cleanMessage,
      locationLabel: cleanLocationLabel,
      lat: params.lat,
      lng: params.lng,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'familyAlerts');
  }
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
  const tripId = createAccountId('trip');
  const radius = clampRadius(params.geofenceRadiusMeters);
  const originName =
    clampString(params.originName, SAFE_REACH_LIMITS.PLACE_NAME_MAX) ||
    'Current Location';
  const destinationName =
    clampString(params.destinationName, SAFE_REACH_LIMITS.PLACE_NAME_MAX) ||
    'Destination';
  const expectedPolyline = params.expectedEncodedPolyline.slice(
    0,
    SAFE_REACH_LIMITS.POLYLINE_MAX
  );
  const historyId = createAccountId('hist');

  const batch = writeBatch(db);

  batch.set(doc(db, 'users', params.uid, 'trips', tripId), {
    id: tripId,
    uid: params.uid,
    ownerUid: params.ownerUid,
    originName,
    originLat: params.originPoint.lat,
    originLng: params.originPoint.lng,
    destinationName,
    destinationLat: params.destinationPoint.lat,
    destinationLng: params.destinationPoint.lng,
    geofenceRadiusMeters: radius,
    travelMode: params.travelMode,
    expectedEncodedPolyline: expectedPolyline,
    actualEncodedPolyline: '',
    status: 'travelling' as TripStatus,
    maxDeviationMeters: 0,
    arrivedAtMs: 0,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', params.uid, 'live', 'current'), {
    uid: params.uid,
    ownerUid: params.ownerUid,
    lat: params.originPoint.lat,
    lng: params.originPoint.lng,
    accuracyMeters: 15,
    locationLabel: originName,
    status: 'travelling' as JourneyStatus,
    isSharingEnabled: true,
    activeTripId: tripId,
    destinationName,
    destinationLat: params.destinationPoint.lat,
    destinationLng: params.destinationPoint.lng,
    geofenceRadiusMeters: radius,
    distanceToDestinationMeters: Math.max(
      0,
      Math.round(params.distanceToDestinationMeters)
    ),
    routeDeviationMeters: 0,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', params.uid), {
    ownerUid: params.ownerUid,
    isSharingEnabled: true,
    status: 'travelling' as JourneyStatus,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', params.uid, 'history', historyId), {
    id: historyId,
    uid: params.uid,
    ownerUid: params.ownerUid,
    tripId,
    lat: params.originPoint.lat,
    lng: params.originPoint.lng,
    locationLabel: originName,
    status: 'travelling' as JourneyStatus,
    recordedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `users/${params.uid}/trips/${tripId}`
    );
  }

  if (params.approvedFamilyLinks.length > 0) {
    await dispatchFamilyAlerts({
      travelerUid: params.uid,
      travelerOwnerUid: params.ownerUid,
      travelerName: params.travelerName,
      approvedFamilyLinks: params.approvedFamilyLinks,
      type: 'trip_started',
      message: `${params.travelerName} started a journey to ${destinationName}.`,
      locationLabel: originName,
      lat: params.originPoint.lat,
      lng: params.originPoint.lng,
    });
  }

  return tripId;
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
  const cleanLabel = clampString(
    params.locationLabel,
    SAFE_REACH_LIMITS.LOCATION_LABEL_MAX
  );
  const cleanDest = clampString(
    params.destinationName,
    SAFE_REACH_LIMITS.PLACE_NAME_MAX
  );
  const radius = clampRadius(params.geofenceRadiusMeters);

  const batch = writeBatch(db);

  batch.set(doc(db, 'users', params.uid, 'live', 'current'), {
    uid: params.uid,
    ownerUid: params.ownerUid,
    lat: params.point.lat,
    lng: params.point.lng,
    accuracyMeters: Math.max(0, Math.round(params.accuracyMeters)),
    locationLabel: cleanLabel,
    status: params.status,
    isSharingEnabled: params.isSharingEnabled,
    activeTripId: params.activeTripId,
    destinationName: cleanDest,
    destinationLat: params.destinationPoint.lat,
    destinationLng: params.destinationPoint.lng,
    geofenceRadiusMeters: radius,
    distanceToDestinationMeters: Math.max(
      0,
      Math.round(params.distanceToDestinationMeters)
    ),
    routeDeviationMeters: Math.max(0, Math.round(params.routeDeviationMeters)),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', params.uid), {
    ownerUid: params.ownerUid,
    isSharingEnabled: params.isSharingEnabled,
    status: params.status,
    updatedAt: serverTimestamp(),
  });

  if (params.activeTripId && params.tripStatus) {
    batch.update(doc(db, 'users', params.uid, 'trips', params.activeTripId), {
      ownerUid: params.ownerUid,
      actualEncodedPolyline: (params.actualEncodedPolyline || '').slice(
        0,
        SAFE_REACH_LIMITS.POLYLINE_MAX
      ),
      status: params.tripStatus,
      maxDeviationMeters: Math.max(
        0,
        Math.round(params.maxDeviationMeters ?? params.routeDeviationMeters)
      ),
      arrivedAtMs: params.arrivedAtMs ?? 0,
      updatedAt: serverTimestamp(),
    });
  }

  if (params.recordHistory) {
    const historyId = createAccountId('hist');
    batch.set(doc(db, 'users', params.uid, 'history', historyId), {
      id: historyId,
      uid: params.uid,
      ownerUid: params.ownerUid,
      tripId: params.activeTripId,
      lat: params.point.lat,
      lng: params.point.lng,
      locationLabel: cleanLabel,
      status: params.status,
      recordedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `users/${params.uid}/live/current`
    );
  }
}

export async function stopLocationSharing(params: {
  uid: string;
  ownerUid: string;
  activeTripId: string;
  currentPoint: LatLngPoint;
  locationLabel: string;
}): Promise<void> {
  const batch = writeBatch(db);

  batch.update(doc(db, 'users', params.uid), {
    ownerUid: params.ownerUid,
    isSharingEnabled: false,
    status: 'idle' as JourneyStatus,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', params.uid, 'live', 'current'), {
    uid: params.uid,
    ownerUid: params.ownerUid,
    lat: params.currentPoint.lat,
    lng: params.currentPoint.lng,
    accuracyMeters: 0,
    locationLabel: clampString(
      params.locationLabel || 'Location sharing paused',
      SAFE_REACH_LIMITS.LOCATION_LABEL_MAX
    ),
    status: 'idle' as JourneyStatus,
    isSharingEnabled: false,
    activeTripId: '',
    destinationName: '',
    destinationLat: 0,
    destinationLng: 0,
    geofenceRadiusMeters: 300,
    distanceToDestinationMeters: 0,
    routeDeviationMeters: 0,
    updatedAt: serverTimestamp(),
  });

  if (params.activeTripId) {
    batch.update(doc(db, 'users', params.uid, 'trips', params.activeTripId), {
      ownerUid: params.ownerUid,
      status: 'cancelled' as TripStatus,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users/${params.uid}/live/current`
    );
  }
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
  const path = `familyAlerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'familyAlerts', alertId), {
      isRead: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteHistoryEntry(
  uid: string,
  entryId: string
): Promise<void> {
  const path = `users/${uid}/history/${entryId}`;
  try {
    await deleteDoc(doc(collection(db, 'users', uid, 'history'), entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteSafeReachAccount(
  profile: UserProfile,
  callerOwnerUid: string,
  isAdminCaller = false
): Promise<void> {
  const targetUid = profile.uid;
  const ownerUid = profile.ownerUid || callerOwnerUid;

  // 1. Delete trips & history subcollections while parent users/{uid} still exists
  try {
    const tripsQuery = isAdminCaller
      ? collection(db, 'users', targetUid, 'trips')
      : query(
          collection(db, 'users', targetUid, 'trips'),
          where('ownerUid', '==', ownerUid)
        );
    const tripsSnap = await getDocs(tripsQuery);
    for (const d of tripsSnap.docs) {
      await deleteDoc(d.ref);
    }

    const historyQuery = isAdminCaller
      ? collection(db, 'users', targetUid, 'history')
      : query(
          collection(db, 'users', targetUid, 'history'),
          where('ownerUid', '==', ownerUid)
        );
    const historySnap = await getDocs(historyQuery);
    for (const d of historySnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch {
    // Continue cleanup of main docs
  }

  // 2. Delete familyLinks, familyAccess, and familyAlerts tied to this account
  try {
    const asTravelerLinks = await getDocs(
      isAdminCaller
        ? query(collection(db, 'familyLinks'), where('travelerUid', '==', targetUid))
        : query(
            collection(db, 'familyLinks'),
            where('travelerOwnerUid', '==', ownerUid)
          )
    );
    for (const d of asTravelerLinks.docs) {
      const link = d.data() as FamilyLink;
      if (link.travelerUid === targetUid) {
        const accessId = `${link.travelerUid}_${link.familyOwnerUid || link.familyUid}`;
        await deleteDoc(doc(db, 'familyAccess', accessId)).catch(() => {});
        await deleteDoc(d.ref).catch(() => {});
      }
    }

    const asFamilyLinks = await getDocs(
      isAdminCaller
        ? query(collection(db, 'familyLinks'), where('familyUid', '==', targetUid))
        : query(
            collection(db, 'familyLinks'),
            where('familyOwnerUid', '==', ownerUid)
          )
    );
    for (const d of asFamilyLinks.docs) {
      const link = d.data() as FamilyLink;
      if (link.familyUid === targetUid) {
        await deleteDoc(d.ref).catch(() => {});
      }
    }

    const alertsAsRecipient = await getDocs(
      isAdminCaller
        ? query(collection(db, 'familyAlerts'), where('recipientUid', '==', targetUid))
        : query(
            collection(db, 'familyAlerts'),
            where('recipientOwnerUid', '==', ownerUid)
          )
    );
    for (const d of alertsAsRecipient.docs) {
      if (d.data().recipientUid === targetUid) {
        await deleteDoc(d.ref).catch(() => {});
      }
    }
  } catch {
    // Continue cleanup of main docs
  }

  // 3. Delete private/info and live/current
  await deleteDoc(doc(db, 'users', targetUid, 'private', 'info')).catch(() => {});
  await deleteDoc(doc(db, 'users', targetUid, 'live', 'current')).catch(() => {});

  // 4. Delete directory entry and main user profile
  try {
    if (profile.safeReachId) {
      await deleteDoc(doc(db, 'directory', profile.safeReachId)).catch(() => {});
    }
    await deleteDoc(doc(db, 'users', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${targetUid}`);
  }
}

export async function deleteMultipleSafeReachAccounts(
  profiles: UserProfile[],
  callerOwnerUid: string,
  isAdminCaller = false
): Promise<void> {
  for (const profile of profiles) {
    await deleteSafeReachAccount(profile, callerOwnerUid, isAdminCaller);
  }
}
