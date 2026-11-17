export interface SafeReachTimestamp {
  seconds: number;
  nanoseconds: number;
  toMillis(): number;
  toDate(): Date;
}

export function createTimestamp(ms: number): SafeReachTimestamp {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return {
    seconds: Math.floor(safeMs / 1000),
    nanoseconds: (safeMs % 1000) * 1000000,
    toMillis: () => safeMs,
    toDate: () => new Date(safeMs),
  };
}

export const ADMIN_EMAIL = 'udayphanindravamsikoyya@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export type JourneyStatus =
  | 'idle'
  | 'travelling'
  | 'reached_safely'
  | 'sos_alert'
  | 'route_deviation'
  | 'signal_stale';

export type TripStatus =
  | 'travelling'
  | 'reached_safely'
  | 'cancelled'
  | 'sos_alert'
  | 'route_deviation';

export type TravelModeType = 'DRIVING' | 'WALKING' | 'TRANSIT' | 'TWO_WHEELER';

export type LinkStatus = 'pending' | 'approved' | 'revoked';

export type RolePreference = 'traveler' | 'family' | 'both';

export type SubscriptionStatus = 'pending' | 'active' | 'revoked';

export type FamilyAlertType =
  | 'trip_started'
  | 'reached_safely'
  | 'route_deviation'
  | 'sos_alert'
  | 'signal_stale'
  | 'sharing_stopped';

export const SAFE_REACH_UNIQUE_ID_CHARS = {
  UPPER: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  LOWER: 'abcdefghijklmnopqrstuvwxyz',
  DIGITS: '0123456789',
  SPECIALS: '!@#$%^&*-_+=~',
} as const;

export const SAFE_REACH_LIMITS = {
  DISPLAY_NAME_MAX: 80,
  EMAIL_MAX: 160,
  RELATIONSHIP_MAX: 40,
  LOCATION_LABEL_MAX: 160,
  PLACE_NAME_MAX: 120,
  ALERT_MESSAGE_MAX: 240,
  SUBSCRIPTION_NOTE_MAX: 120,
  POLYLINE_MAX: 20000,
  GEOFENCE_MIN_METERS: 50,
  GEOFENCE_MAX_METERS: 5000,
  UNIQUE_ID_LENGTH: 10,
  SAFE_REACH_ID_REGEX:
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*\-_+=~])[A-Za-z0-9!@#$%^&*\-_+=~]{10}$/,
  LEGACY_SAFE_REACH_ID_REGEX: /^SR[0-9]{5}$/,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
} as const;

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface AuthSession {
  ownerUid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export interface UserProfile {
  uid: string;
  ownerUid: string;
  safeReachId: string;
  displayName: string;
  rolePreference: RolePreference;
  isSharingEnabled: boolean;
  status: JourneyStatus;
  subscriptionStatus?: SubscriptionStatus;
  accessGranted?: boolean;
  subscriptionNote?: string;
  createdAt?: SafeReachTimestamp;
  updatedAt?: SafeReachTimestamp;
}

export function isUserProfileActive(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.accessGranted === true && profile.subscriptionStatus === 'active'
  );
}

export interface PrivateUserInfo {
  uid: string;
  ownerUid: string;
  email: string;
  emergencyContactName: string;
  defaultGeofenceRadiusMeters: number;
  updatedAt?: SafeReachTimestamp;
}

export interface DirectoryEntry {
  safeReachId: string;
  uid: string;
  ownerUid: string;
  displayName: string;
  createdAt?: SafeReachTimestamp;
}

export interface FamilyLink {
  id: string;
  travelerUid: string;
  travelerOwnerUid: string;
  travelerSafeReachId: string;
  travelerName: string;
  familyUid: string;
  familyOwnerUid: string;
  familyName: string;
  relationship: string;
  status: LinkStatus;
  createdAt?: SafeReachTimestamp;
  updatedAt?: SafeReachTimestamp;
}

export interface LiveLocationState {
  uid: string;
  ownerUid: string;
  lat: number;
  lng: number;
  accuracyMeters: number;
  locationLabel: string;
  status: JourneyStatus;
  isSharingEnabled: boolean;
  activeTripId: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  geofenceRadiusMeters: number;
  distanceToDestinationMeters: number;
  routeDeviationMeters: number;
  updatedAt?: SafeReachTimestamp;
}

export interface Trip {
  id: string;
  uid: string;
  ownerUid: string;
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  geofenceRadiusMeters: number;
  travelMode: TravelModeType;
  expectedEncodedPolyline: string;
  actualEncodedPolyline: string;
  status: TripStatus;
  maxDeviationMeters: number;
  arrivedAtMs: number;
  startedAt?: SafeReachTimestamp;
  updatedAt?: SafeReachTimestamp;
}

export interface LocationHistoryEntry {
  id: string;
  uid: string;
  ownerUid: string;
  tripId: string;
  lat: number;
  lng: number;
  locationLabel: string;
  status: JourneyStatus;
  recordedAt?: SafeReachTimestamp;
}

export interface FamilyAlert {
  id: string;
  travelerUid: string;
  travelerOwnerUid: string;
  travelerName: string;
  recipientUid: string;
  recipientOwnerUid: string;
  type: FamilyAlertType;
  message: string;
  locationLabel: string;
  lat: number;
  lng: number;
  isRead: boolean;
  createdAt?: SafeReachTimestamp;
}
