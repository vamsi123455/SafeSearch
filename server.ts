import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import type {Request, Response} from 'express';
import nodemailer from 'nodemailer';

const ADMIN_EMAIL = 'udayphanindravamsikoyya@gmail.com';
const PORT = Number(process.env.PORT || 3000);
const LEGACY_STORE_PATH = path.resolve(process.cwd(), '.safereach-store.json');
const DB_PATH = path.resolve(process.cwd(), '.safereach-data.db');

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIALS = '!@#$%^&*-_+=~';
const ALL_ID_CHARS = `${UPPER}${LOWER}${DIGITS}${SPECIALS}`;

interface StoredCredential {
  id: string;
  ownerUid: string;
  email: string;
  passwordHash: string;
  createdAtMs: number;
}

interface StoredUserProfile {
  uid: string;
  ownerUid: string;
  safeReachId: string;
  displayName: string;
  rolePreference: 'traveler' | 'family' | 'both';
  isSharingEnabled: boolean;
  status: string;
  subscriptionStatus: 'pending' | 'active' | 'revoked';
  accessGranted: boolean;
  subscriptionNote: string;
  createdAtMs: number;
  updatedAtMs: number;
}

interface StoredPrivateInfo {
  uid: string;
  ownerUid: string;
  email: string;
  emergencyContactName: string;
  defaultGeofenceRadiusMeters: number;
  updatedAtMs: number;
}

interface StoredDirectoryEntry {
  safeReachId: string;
  uid: string;
  ownerUid: string;
  displayName: string;
  createdAtMs: number;
}

interface StoredFamilyLink {
  id: string;
  travelerUid: string;
  travelerOwnerUid: string;
  travelerSafeReachId: string;
  travelerName: string;
  familyUid: string;
  familyOwnerUid: string;
  familyName: string;
  relationship: string;
  status: 'pending' | 'approved' | 'revoked';
  createdAtMs: number;
  updatedAtMs: number;
}

interface StoredLiveState {
  uid: string;
  ownerUid: string;
  lat: number;
  lng: number;
  accuracyMeters: number;
  locationLabel: string;
  status: string;
  isSharingEnabled: boolean;
  activeTripId: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  geofenceRadiusMeters: number;
  distanceToDestinationMeters: number;
  routeDeviationMeters: number;
  updatedAtMs: number;
}

interface StoredTrip {
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
  travelMode: string;
  expectedEncodedPolyline: string;
  actualEncodedPolyline: string;
  status: string;
  maxDeviationMeters: number;
  arrivedAtMs: number;
  startedAtMs: number;
  updatedAtMs: number;
}

interface StoredHistoryEntry {
  id: string;
  uid: string;
  ownerUid: string;
  tripId: string;
  lat: number;
  lng: number;
  locationLabel: string;
  status: string;
  recordedAtMs: number;
}

interface StoredFamilyAlert {
  id: string;
  travelerUid: string;
  travelerOwnerUid: string;
  travelerName: string;
  recipientUid: string;
  recipientOwnerUid: string;
  type: string;
  message: string;
  locationLabel: string;
  lat: number;
  lng: number;
  isRead: boolean;
  createdAtMs: number;
}

interface StoredPendingSignup {
  pendingId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  rolePreference: 'traveler' | 'family' | 'both';
  otpHash: string;
  otpVerified: boolean;
  completedAccountId?: string;
  completedOwnerUid?: string;
  completedSafeReachId?: string;
  expiresAtMs: number;
  createdAtMs: number;
}

interface SafeReachStore {
  allowAllUsers: boolean;
  credentials: StoredCredential[];
  pendingSignups: Record<string, StoredPendingSignup>;
  users: Record<string, StoredUserProfile>;
  privateInfo: Record<string, StoredPrivateInfo>;
  directory: Record<string, StoredDirectoryEntry>;
  familyLinks: Record<string, StoredFamilyLink>;
  live: Record<string, StoredLiveState>;
  trips: Record<string, StoredTrip>;
  history: Record<string, StoredHistoryEntry>;
  familyAlerts: Record<string, StoredFamilyAlert>;
}

function emptyStore(): SafeReachStore {
  return {
    allowAllUsers: false,
    credentials: [],
    pendingSignups: {},
    users: {},
    privateInfo: {},
    directory: {},
    familyLinks: {},
    live: {},
    trips: {},
    history: {},
    familyAlerts: {},
  };
}

const sqliteDb = new DatabaseSync(DB_PATH);
sqliteDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    owner_uid TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credentials_email ON credentials(email);

  CREATE TABLE IF NOT EXISTS pending_signups (
    pending_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role_preference TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    otp_verified INTEGER NOT NULL,
    completed_account_id TEXT,
    completed_owner_uid TEXT,
    completed_safe_reach_id TEXT,
    expires_at_ms INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    owner_uid TEXT NOT NULL,
    safe_reach_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role_preference TEXT NOT NULL,
    is_sharing_enabled INTEGER NOT NULL,
    status TEXT NOT NULL,
    subscription_status TEXT NOT NULL,
    access_granted INTEGER NOT NULL,
    subscription_note TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_owner_uid ON users(owner_uid);

  CREATE TABLE IF NOT EXISTS private_info (
    uid TEXT PRIMARY KEY,
    owner_uid TEXT NOT NULL,
    email TEXT NOT NULL,
    emergency_contact_name TEXT NOT NULL,
    default_geofence_radius_meters INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS directory (
    safe_reach_id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    owner_uid TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_links (
    id TEXT PRIMARY KEY,
    traveler_uid TEXT NOT NULL,
    traveler_owner_uid TEXT NOT NULL,
    traveler_safe_reach_id TEXT NOT NULL,
    traveler_name TEXT NOT NULL,
    family_uid TEXT NOT NULL,
    family_owner_uid TEXT NOT NULL,
    family_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS live_state (
    uid TEXT PRIMARY KEY,
    owner_uid TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    accuracy_meters REAL NOT NULL,
    location_label TEXT NOT NULL,
    status TEXT NOT NULL,
    is_sharing_enabled INTEGER NOT NULL,
    active_trip_id TEXT NOT NULL,
    destination_name TEXT NOT NULL,
    destination_lat REAL NOT NULL,
    destination_lng REAL NOT NULL,
    geofence_radius_meters INTEGER NOT NULL,
    distance_to_destination_meters REAL NOT NULL,
    route_deviation_meters REAL NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    store_key TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    uid TEXT NOT NULL,
    owner_uid TEXT NOT NULL,
    origin_name TEXT NOT NULL,
    origin_lat REAL NOT NULL,
    origin_lng REAL NOT NULL,
    destination_name TEXT NOT NULL,
    destination_lat REAL NOT NULL,
    destination_lng REAL NOT NULL,
    geofence_radius_meters INTEGER NOT NULL,
    travel_mode TEXT NOT NULL,
    expected_encoded_polyline TEXT NOT NULL,
    actual_encoded_polyline TEXT NOT NULL,
    status TEXT NOT NULL,
    max_deviation_meters REAL NOT NULL,
    arrived_at_ms INTEGER NOT NULL,
    started_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    store_key TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    uid TEXT NOT NULL,
    owner_uid TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    location_label TEXT NOT NULL,
    status TEXT NOT NULL,
    recorded_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_alerts (
    id TEXT PRIMARY KEY,
    traveler_uid TEXT NOT NULL,
    traveler_owner_uid TEXT NOT NULL,
    traveler_name TEXT NOT NULL,
    recipient_uid TEXT NOT NULL,
    recipient_owner_uid TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    location_label TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    is_read INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL
  );
`);

function writeStoreToSqlite(target: SafeReachStore): void {
  sqliteDb.exec('BEGIN IMMEDIATE');
  try {
    sqliteDb.exec(`
      DELETE FROM app_settings;
      DELETE FROM credentials;
      DELETE FROM pending_signups;
      DELETE FROM users;
      DELETE FROM private_info;
      DELETE FROM directory;
      DELETE FROM family_links;
      DELETE FROM live_state;
      DELETE FROM trips;
      DELETE FROM history;
      DELETE FROM family_alerts;
    `);

    sqliteDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('allowAllUsers', target.allowAllUsers ? '1' : '0');

    const insertCred = sqliteDb.prepare(
      'INSERT INTO credentials (id, owner_uid, email, password_hash, created_at_ms) VALUES (?, ?, ?, ?, ?)'
    );
    for (const c of target.credentials) {
      insertCred.run(c.id, c.ownerUid, c.email, c.passwordHash, c.createdAtMs);
    }

    const insertPending = sqliteDb.prepare(
      `INSERT INTO pending_signups (
        pending_id, display_name, email, password_hash, role_preference,
        otp_hash, otp_verified, completed_account_id, completed_owner_uid,
        completed_safe_reach_id, expires_at_ms, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of Object.values(target.pendingSignups)) {
      insertPending.run(
        p.pendingId,
        p.displayName,
        p.email,
        p.passwordHash,
        p.rolePreference,
        p.otpHash,
        p.otpVerified ? 1 : 0,
        p.completedAccountId || null,
        p.completedOwnerUid || null,
        p.completedSafeReachId || null,
        p.expiresAtMs,
        p.createdAtMs
      );
    }

    const insertUser = sqliteDb.prepare(
      `INSERT INTO users (
        uid, owner_uid, safe_reach_id, display_name, role_preference,
        is_sharing_enabled, status, subscription_status, access_granted,
        subscription_note, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const u of Object.values(target.users)) {
      insertUser.run(
        u.uid,
        u.ownerUid,
        u.safeReachId,
        u.displayName,
        u.rolePreference,
        u.isSharingEnabled ? 1 : 0,
        u.status,
        u.subscriptionStatus,
        u.accessGranted ? 1 : 0,
        u.subscriptionNote,
        u.createdAtMs,
        u.updatedAtMs
      );
    }

    const insertPriv = sqliteDb.prepare(
      'INSERT INTO private_info (uid, owner_uid, email, emergency_contact_name, default_geofence_radius_meters, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const p of Object.values(target.privateInfo)) {
      insertPriv.run(
        p.uid,
        p.ownerUid,
        p.email,
        p.emergencyContactName,
        p.defaultGeofenceRadiusMeters,
        p.updatedAtMs
      );
    }

    const insertDir = sqliteDb.prepare(
      'INSERT INTO directory (safe_reach_id, uid, owner_uid, display_name, created_at_ms) VALUES (?, ?, ?, ?, ?)'
    );
    for (const d of Object.values(target.directory)) {
      insertDir.run(d.safeReachId, d.uid, d.ownerUid, d.displayName, d.createdAtMs);
    }

    const insertLink = sqliteDb.prepare(
      `INSERT INTO family_links (
        id, traveler_uid, traveler_owner_uid, traveler_safe_reach_id, traveler_name,
        family_uid, family_owner_uid, family_name, relationship, status,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of Object.values(target.familyLinks)) {
      insertLink.run(
        l.id,
        l.travelerUid,
        l.travelerOwnerUid,
        l.travelerSafeReachId,
        l.travelerName,
        l.familyUid,
        l.familyOwnerUid,
        l.familyName,
        l.relationship,
        l.status,
        l.createdAtMs,
        l.updatedAtMs
      );
    }

    const insertLive = sqliteDb.prepare(
      `INSERT INTO live_state (
        uid, owner_uid, lat, lng, accuracy_meters, location_label, status,
        is_sharing_enabled, active_trip_id, destination_name, destination_lat,
        destination_lng, geofence_radius_meters, distance_to_destination_meters,
        route_deviation_meters, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of Object.values(target.live)) {
      insertLive.run(
        s.uid,
        s.ownerUid,
        s.lat,
        s.lng,
        s.accuracyMeters,
        s.locationLabel,
        s.status,
        s.isSharingEnabled ? 1 : 0,
        s.activeTripId,
        s.destinationName,
        s.destinationLat,
        s.destinationLng,
        s.geofenceRadiusMeters,
        s.distanceToDestinationMeters,
        s.routeDeviationMeters,
        s.updatedAtMs
      );
    }

    const insertTrip = sqliteDb.prepare(
      `INSERT INTO trips (
        store_key, id, uid, owner_uid, origin_name, origin_lat, origin_lng,
        destination_name, destination_lat, destination_lng, geofence_radius_meters,
        travel_mode, expected_encoded_polyline, actual_encoded_polyline, status,
        max_deviation_meters, arrived_at_ms, started_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [storeKey, t] of Object.entries(target.trips)) {
      insertTrip.run(
        storeKey,
        t.id,
        t.uid,
        t.ownerUid,
        t.originName,
        t.originLat,
        t.originLng,
        t.destinationName,
        t.destinationLat,
        t.destinationLng,
        t.geofenceRadiusMeters,
        t.travelMode,
        t.expectedEncodedPolyline,
        t.actualEncodedPolyline,
        t.status,
        t.maxDeviationMeters,
        t.arrivedAtMs,
        t.startedAtMs,
        t.updatedAtMs
      );
    }

    const insertHist = sqliteDb.prepare(
      `INSERT INTO history (
        store_key, id, uid, owner_uid, trip_id, lat, lng, location_label, status, recorded_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [storeKey, h] of Object.entries(target.history)) {
      insertHist.run(
        storeKey,
        h.id,
        h.uid,
        h.ownerUid,
        h.tripId,
        h.lat,
        h.lng,
        h.locationLabel,
        h.status,
        h.recordedAtMs
      );
    }

    const insertAlert = sqliteDb.prepare(
      `INSERT INTO family_alerts (
        id, traveler_uid, traveler_owner_uid, traveler_name, recipient_uid,
        recipient_owner_uid, type, message, location_label, lat, lng, is_read, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of Object.values(target.familyAlerts)) {
      insertAlert.run(
        a.id,
        a.travelerUid,
        a.travelerOwnerUid,
        a.travelerName,
        a.recipientUid,
        a.recipientOwnerUid,
        a.type,
        a.message,
        a.locationLabel,
        a.lat,
        a.lng,
        a.isRead ? 1 : 0,
        a.createdAtMs
      );
    }

    sqliteDb.exec('COMMIT');
  } catch (err) {
    sqliteDb.exec('ROLLBACK');
    throw err;
  }
}

function loadStore(): SafeReachStore {
  const result = emptyStore();
  try {
    const userCountRow = sqliteDb
      .prepare('SELECT COUNT(*) AS cnt FROM users')
      .get() as {cnt: number};
    const credCountRow = sqliteDb
      .prepare('SELECT COUNT(*) AS cnt FROM credentials')
      .get() as {cnt: number};

    if (
      userCountRow.cnt === 0 &&
      credCountRow.cnt === 0 &&
      fs.existsSync(LEGACY_STORE_PATH)
    ) {
      const raw = fs.readFileSync(LEGACY_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SafeReachStore>;
      const migrated: SafeReachStore = {
        allowAllUsers: Boolean(parsed.allowAllUsers),
        credentials: Array.isArray(parsed.credentials)
          ? parsed.credentials
          : [],
        pendingSignups: parsed.pendingSignups || {},
        users: parsed.users || {},
        privateInfo: parsed.privateInfo || {},
        directory: parsed.directory || {},
        familyLinks: parsed.familyLinks || {},
        live: parsed.live || {},
        trips: parsed.trips || {},
        history: parsed.history || {},
        familyAlerts: parsed.familyAlerts || {},
      };
      writeStoreToSqlite(migrated);
      return migrated;
    }

    const allowRow = sqliteDb
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('allowAllUsers') as {value: string} | undefined;
    result.allowAllUsers = allowRow?.value === '1';

    for (const r of sqliteDb
      .prepare('SELECT * FROM credentials')
      .all() as Array<Record<string, unknown>>) {
      result.credentials.push({
        id: String(r.id),
        ownerUid: String(r.owner_uid),
        email: String(r.email),
        passwordHash: String(r.password_hash),
        createdAtMs: Number(r.created_at_ms),
      });
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM pending_signups')
      .all() as Array<Record<string, unknown>>) {
      const pendingId = String(r.pending_id);
      result.pendingSignups[pendingId] = {
        pendingId,
        displayName: String(r.display_name),
        email: String(r.email),
        passwordHash: String(r.password_hash),
        rolePreference: String(
          r.role_preference
        ) as StoredPendingSignup['rolePreference'],
        otpHash: String(r.otp_hash),
        otpVerified: Boolean(r.otp_verified),
        completedAccountId: r.completed_account_id
          ? String(r.completed_account_id)
          : undefined,
        completedOwnerUid: r.completed_owner_uid
          ? String(r.completed_owner_uid)
          : undefined,
        completedSafeReachId: r.completed_safe_reach_id
          ? String(r.completed_safe_reach_id)
          : undefined,
        expiresAtMs: Number(r.expires_at_ms),
        createdAtMs: Number(r.created_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM users')
      .all() as Array<Record<string, unknown>>) {
      const uid = String(r.uid);
      result.users[uid] = {
        uid,
        ownerUid: String(r.owner_uid),
        safeReachId: String(r.safe_reach_id),
        displayName: String(r.display_name),
        rolePreference: String(
          r.role_preference
        ) as StoredUserProfile['rolePreference'],
        isSharingEnabled: Boolean(r.is_sharing_enabled),
        status: String(r.status),
        subscriptionStatus: String(
          r.subscription_status
        ) as StoredUserProfile['subscriptionStatus'],
        accessGranted: Boolean(r.access_granted),
        subscriptionNote: String(r.subscription_note),
        createdAtMs: Number(r.created_at_ms),
        updatedAtMs: Number(r.updated_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM private_info')
      .all() as Array<Record<string, unknown>>) {
      const uid = String(r.uid);
      result.privateInfo[uid] = {
        uid,
        ownerUid: String(r.owner_uid),
        email: String(r.email),
        emergencyContactName: String(r.emergency_contact_name),
        defaultGeofenceRadiusMeters: Number(r.default_geofence_radius_meters),
        updatedAtMs: Number(r.updated_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM directory')
      .all() as Array<Record<string, unknown>>) {
      const safeReachId = String(r.safe_reach_id);
      result.directory[safeReachId] = {
        safeReachId,
        uid: String(r.uid),
        ownerUid: String(r.owner_uid),
        displayName: String(r.display_name),
        createdAtMs: Number(r.created_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM family_links')
      .all() as Array<Record<string, unknown>>) {
      const id = String(r.id);
      result.familyLinks[id] = {
        id,
        travelerUid: String(r.traveler_uid),
        travelerOwnerUid: String(r.traveler_owner_uid),
        travelerSafeReachId: String(r.traveler_safe_reach_id),
        travelerName: String(r.traveler_name),
        familyUid: String(r.family_uid),
        familyOwnerUid: String(r.family_owner_uid),
        familyName: String(r.family_name),
        relationship: String(r.relationship),
        status: String(r.status) as StoredFamilyLink['status'],
        createdAtMs: Number(r.created_at_ms),
        updatedAtMs: Number(r.updated_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM live_state')
      .all() as Array<Record<string, unknown>>) {
      const uid = String(r.uid);
      result.live[uid] = {
        uid,
        ownerUid: String(r.owner_uid),
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracyMeters: Number(r.accuracy_meters),
        locationLabel: String(r.location_label),
        status: String(r.status),
        isSharingEnabled: Boolean(r.is_sharing_enabled),
        activeTripId: String(r.active_trip_id),
        destinationName: String(r.destination_name),
        destinationLat: Number(r.destination_lat),
        destinationLng: Number(r.destination_lng),
        geofenceRadiusMeters: Number(r.geofence_radius_meters),
        distanceToDestinationMeters: Number(r.distance_to_destination_meters),
        routeDeviationMeters: Number(r.route_deviation_meters),
        updatedAtMs: Number(r.updated_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM trips')
      .all() as Array<Record<string, unknown>>) {
      const key = String(r.store_key);
      result.trips[key] = {
        id: String(r.id),
        uid: String(r.uid),
        ownerUid: String(r.owner_uid),
        originName: String(r.origin_name),
        originLat: Number(r.origin_lat),
        originLng: Number(r.origin_lng),
        destinationName: String(r.destination_name),
        destinationLat: Number(r.destination_lat),
        destinationLng: Number(r.destination_lng),
        geofenceRadiusMeters: Number(r.geofence_radius_meters),
        travelMode: String(r.travel_mode),
        expectedEncodedPolyline: String(r.expected_encoded_polyline),
        actualEncodedPolyline: String(r.actual_encoded_polyline),
        status: String(r.status),
        maxDeviationMeters: Number(r.max_deviation_meters),
        arrivedAtMs: Number(r.arrived_at_ms),
        startedAtMs: Number(r.started_at_ms),
        updatedAtMs: Number(r.updated_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM history')
      .all() as Array<Record<string, unknown>>) {
      const key = String(r.store_key);
      result.history[key] = {
        id: String(r.id),
        uid: String(r.uid),
        ownerUid: String(r.owner_uid),
        tripId: String(r.trip_id),
        lat: Number(r.lat),
        lng: Number(r.lng),
        locationLabel: String(r.location_label),
        status: String(r.status),
        recordedAtMs: Number(r.recorded_at_ms),
      };
    }

    for (const r of sqliteDb
      .prepare('SELECT * FROM family_alerts')
      .all() as Array<Record<string, unknown>>) {
      const id = String(r.id);
      result.familyAlerts[id] = {
        id,
        travelerUid: String(r.traveler_uid),
        travelerOwnerUid: String(r.traveler_owner_uid),
        travelerName: String(r.traveler_name),
        recipientUid: String(r.recipient_uid),
        recipientOwnerUid: String(r.recipient_owner_uid),
        type: String(r.type),
        message: String(r.message),
        locationLabel: String(r.location_label),
        lat: Number(r.lat),
        lng: Number(r.lng),
        isRead: Boolean(r.is_read),
        createdAtMs: Number(r.created_at_ms),
      };
    }

    return result;
  } catch {
    return emptyStore();
  }
}

const store: SafeReachStore = loadStore();
let storeVersion = 1;
const sseClients = new Set<Response>();

let pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;

function flushStoreToDisk(): void {
  try {
    writeStoreToSqlite(store);
  } catch {
    // Keep in-memory state active if SQLite write encounters a transient lock
  }
}

function saveStore(immediateDiskWrite = false): void {
  storeVersion += 1;
  const payload = `event: sync\ndata: ${JSON.stringify({version: storeVersion})}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }

  if (immediateDiskWrite) {
    if (pendingWriteTimer) {
      clearTimeout(pendingWriteTimer);
      pendingWriteTimer = null;
    }
    flushStoreToDisk();
    return;
  }

  if (!pendingWriteTimer) {
    pendingWriteTimer = setTimeout(() => {
      pendingWriteTimer = null;
      flushStoreToDisk();
    }, 400);
  }
}

function clampString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function clampRadius(meters: unknown): number {
  const num = typeof meters === 'number' && Number.isFinite(meters) ? meters : 300;
  return Math.max(50, Math.min(5000, Math.round(num)));
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function pickChar(charset: string): string {
  return charset[crypto.randomInt(0, charset.length)];
}

function generateUniqueComplex10CharId(): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    const chars = [
      pickChar(UPPER),
      pickChar(UPPER),
      pickChar(LOWER),
      pickChar(LOWER),
      pickChar(DIGITS),
      pickChar(DIGITS),
      pickChar(SPECIALS),
      pickChar(SPECIALS),
      pickChar(ALL_ID_CHARS),
      pickChar(ALL_ID_CHARS),
    ];
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }
    const candidate = chars.join('');
    if (!store.directory[candidate]) {
      return candidate;
    }
  }
  return `${pickChar(UPPER)}${pickChar(LOWER)}${pickChar(DIGITS)}${pickChar(SPECIALS)}${crypto
    .randomBytes(3)
    .toString('hex')}`.slice(0, 10);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

function isProfileSubscribedOrAdmin(uid: string): boolean {
  const user = store.users[uid];
  if (!user) return false;
  if (store.allowAllUsers) return true;
  if (user.accessGranted === true && user.subscriptionStatus === 'active') {
    return true;
  }
  const priv = store.privateInfo[uid];
  return Boolean(priv && isAdminEmail(priv.email));
}

function createProfileRecord(params: {
  ownerUid: string;
  email: string;
  displayName: string;
  rolePreference: 'traveler' | 'family' | 'both';
  emergencyContactName?: string;
  defaultGeofenceRadiusMeters?: number;
}): {accountId: string; safeReachId: string; profile: StoredUserProfile} {
  const now = Date.now();
  const accountId = makeId('acct');
  const safeReachId = generateUniqueComplex10CharId();
  const displayName = clampString(params.displayName, 80) || 'SafeReach User';
  const email =
    clampString(params.email, 160).toLowerCase() || 'user@safereach.app';
  const emergencyContactName = clampString(params.emergencyContactName || '', 80);
  const radius = clampRadius(params.defaultGeofenceRadiusMeters);
  const adminUser = isAdminEmail(email);

  const profile: StoredUserProfile = {
    uid: accountId,
    ownerUid: params.ownerUid,
    safeReachId,
    displayName,
    rolePreference:
      params.rolePreference === 'family' ||
      params.rolePreference === 'traveler' ||
      params.rolePreference === 'both'
        ? params.rolePreference
        : 'traveler',
    isSharingEnabled: false,
    status: 'idle',
    subscriptionStatus: adminUser ? 'active' : 'pending',
    accessGranted: adminUser,
    subscriptionNote: adminUser
      ? 'Admin account active'
      : 'Awaiting admin approval',
    createdAtMs: now,
    updatedAtMs: now,
  };

  store.users[accountId] = profile;
  store.directory[safeReachId] = {
    safeReachId,
    uid: accountId,
    ownerUid: params.ownerUid,
    displayName,
    createdAtMs: now,
  };
  store.privateInfo[accountId] = {
    uid: accountId,
    ownerUid: params.ownerUid,
    email,
    emergencyContactName,
    defaultGeofenceRadiusMeters: radius,
    updatedAtMs: now,
  };
  store.live[accountId] = {
    uid: accountId,
    ownerUid: params.ownerUid,
    lat: 13.6288,
    lng: 79.4192,
    accuracyMeters: 25,
    locationLabel: 'Location sharing not started',
    status: 'idle',
    isSharingEnabled: false,
    activeTripId: '',
    destinationName: '',
    destinationLat: 0,
    destinationLng: 0,
    geofenceRadiusMeters: radius,
    distanceToDestinationMeters: 0,
    routeDeviationMeters: 0,
    updatedAtMs: now,
  };

  return {accountId, safeReachId, profile};
}

function removeSingleProfile(accountId: string): void {
  const existing = store.users[accountId];
  if (existing?.safeReachId) {
    delete store.directory[existing.safeReachId];
  }
  delete store.users[accountId];
  delete store.privateInfo[accountId];
  delete store.live[accountId];

  for (const key of Object.keys(store.trips)) {
    if (store.trips[key]?.uid === accountId) {
      delete store.trips[key];
    }
  }
  for (const key of Object.keys(store.history)) {
    if (store.history[key]?.uid === accountId) {
      delete store.history[key];
    }
  }
  for (const key of Object.keys(store.familyLinks)) {
    const link = store.familyLinks[key];
    if (link && (link.travelerUid === accountId || link.familyUid === accountId)) {
      delete store.familyLinks[key];
    }
  }
  for (const key of Object.keys(store.familyAlerts)) {
    const alert = store.familyAlerts[key];
    if (
      alert &&
      (alert.travelerUid === accountId || alert.recipientUid === accountId)
    ) {
      delete store.familyAlerts[key];
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  // Real-time multi-tab SSE sync stream
  app.get('/api/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: sync\ndata: ${JSON.stringify({version: storeVersion})}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  function pruneExpiredPendingSignups(): void {
    const now = Date.now();
    for (const [id, pending] of Object.entries(store.pendingSignups)) {
      const doneAge = pending.completedAccountId
        ? now - pending.createdAtMs > 30 * 60 * 1000
        : false;
      if (now > pending.expiresAtMs + 5 * 60 * 1000 || doneAge) {
        delete store.pendingSignups[id];
      }
    }
  }

  function escapeHtml(raw: string): string {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class MailDeliveryError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode = 400, code = 'MAIL_DELIVERY_FAILED') {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }

  function cleanEnv(val?: string): string {
    const cleaned = (val || '').trim().replace(/^['"]|['"]$/g, '');
    if (
      !cleaned ||
      /^(unused|none|null|undefined|n\/a|-)$/i.test(cleaned)
    ) {
      return '';
    }
    return cleaned;
  }

  function isServerMailConfigured(): boolean {
    const hasRelay = Boolean(cleanEnv(process.env.MAIL_RELAY_URL));
    const hasBrevo = Boolean(cleanEnv(process.env.BREVO_API_KEY));
    const hasResend = Boolean(cleanEnv(process.env.RESEND_API_KEY));
    const hasSmtp = Boolean(
      cleanEnv(process.env.SMTP_USER) &&
        cleanEnv(process.env.SMTP_PASS).replace(/\s+/g, '')
    );
    return hasRelay || hasBrevo || hasResend || hasSmtp;
  }

  app.get('/api/auth/mail-config', (_req: Request, res: Response) => {
    res.json({emailConfigured: isServerMailConfigured()});
  });

  async function sendConfirmationEmail(params: {
    to: string;
    displayName: string;
    otp: string;
  }): Promise<{deliveryMode: 'smtp' | 'relay' | 'brevo' | 'resend'}> {
    const subject = `SafeReach Verification Code: ${params.otp}`;
    const safeName = escapeHtml(params.displayName);
    const textBody = [
      `Hi ${params.displayName},`,
      '',
      `Your SafeReach 6-digit verification OTP is: ${params.otp}`,
      '',
      'Enter this OTP on the SafeReach sign-up screen to complete your registration.',
      '',
      'This OTP expires in 10 minutes.',
    ].join('\n');

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; color: #1c1917;">
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5;">Hi <strong>${safeName}</strong>,</p>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5;">
          Enter this 6-digit OTP on SafeReach to complete your registration:
        </p>
        <div style="background: #f5f5f4; border: 1px solid #d6d3d1; border-radius: 10px; padding: 14px; text-align: center; margin: 0 0 16px;">
          <div style="font-size: 30px; font-weight: 700; letter-spacing: 6px; color: #0f766e; font-family: monospace;">${params.otp}</div>
        </div>
        <p style="margin: 0; font-size: 12px; color: #78716c; line-height: 1.5;">
          This verification code expires in 10 minutes.
        </p>
      </div>
    `;

    // 1. Google Apps Script Web App Relay (zero App Password, zero 2FA required)
    const mailRelayUrl = cleanEnv(process.env.MAIL_RELAY_URL);
    if (mailRelayUrl) {
      const relayRes = await fetch(mailRelayUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          to: params.to,
          subject,
          text: textBody,
          html: htmlBody,
        }),
        redirect: 'follow',
      });
      const relayText = await relayRes.text();
      if (!relayRes.ok) {
        throw new MailDeliveryError(
          `Google Apps Script mail relay error (${relayRes.status}): ${relayText.slice(0, 160)}`,
          422,
          'RELAY_SEND_FAILED'
        );
      }
      try {
        const parsed = JSON.parse(relayText) as {ok?: boolean; error?: string};
        if (parsed && parsed.ok === false) {
          throw new MailDeliveryError(
            parsed.error || 'Google Apps Script mail relay returned an error.',
            422,
            'RELAY_SEND_FAILED'
          );
        }
      } catch (err) {
        if (err instanceof MailDeliveryError) throw err;
      }
      return {deliveryMode: 'relay'};
    }

    // 2. Brevo Transactional Email API (free tier sends to any Gmail without custom domain)
    const brevoKey = cleanEnv(process.env.BREVO_API_KEY);
    if (brevoKey) {
      const senderEmail =
        cleanEnv(process.env.BREVO_SENDER_EMAIL) ||
        cleanEnv(process.env.SMTP_USER) ||
        ADMIN_EMAIL;
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {name: 'SafeReach', email: senderEmail},
          to: [{email: params.to, name: params.displayName}],
          subject,
          textContent: textBody,
          htmlContent: htmlBody,
        }),
      });
      if (!brevoRes.ok) {
        const errText = await brevoRes.text();
        throw new MailDeliveryError(
          `Brevo email error (${brevoRes.status}): ${errText.slice(0, 180)}`,
          422,
          'BREVO_SEND_FAILED'
        );
      }
      return {deliveryMode: 'brevo'};
    }

    // 3. Resend API
    const resendKey = cleanEnv(process.env.RESEND_API_KEY);
    if (resendKey) {
      const resendFrom =
        cleanEnv(process.env.RESEND_FROM) || 'SafeReach <onboarding@resend.dev>';
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [params.to],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (!resendRes.ok) {
        const errText = await resendRes.text();
        throw new MailDeliveryError(
          `Resend email error (${resendRes.status}): ${errText.slice(0, 180)}`,
          422,
          'RESEND_SEND_FAILED'
        );
      }
      return {deliveryMode: 'resend'};
    }

    // 4. Gmail SMTP (App Password)
    const smtpUser = cleanEnv(process.env.SMTP_USER);
    const smtpPass = cleanEnv(process.env.SMTP_PASS).replace(/\s+/g, '');
    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {user: smtpUser, pass: smtpPass},
        });
        await transporter.sendMail({
          from: `SafeReach <${smtpUser}>`,
          to: params.to,
          subject,
          text: textBody,
          html: htmlBody,
        });
        return {deliveryMode: 'smtp'};
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SMTP delivery failed';
        if (
          msg.includes('535') ||
          msg.includes('BadCredentials') ||
          msg.includes('Username and Password not accepted')
        ) {
          throw new MailDeliveryError(
            'Gmail SMTP rejected SMTP_USER / SMTP_PASS (535 BadCredentials). Set SMTP_PASS to a 16-character Google App Password (myaccount.google.com/apppasswords), or set MAIL_RELAY_URL / BREVO_API_KEY in AI Studio Secrets.',
            422,
            'SMTP_BAD_CREDENTIALS'
          );
        }
        throw new MailDeliveryError(
          `Failed to send OTP email via SMTP: ${msg}`,
          422,
          'SMTP_SEND_FAILED'
        );
      }
    }

    throw new MailDeliveryError(
      'No email sender is configured yet. Set MAIL_RELAY_URL (Google Apps Script), BREVO_API_KEY, or Gmail SMTP App Password in AI Studio Secrets.',
      422,
      'MAIL_NOT_CONFIGURED'
    );
  }

  function finalizePendingSignup(pending: StoredPendingSignup): {
    session: {
      ownerUid: string;
      email: string;
      displayName: string;
      isAdmin: boolean;
    };
    accountId: string;
    safeReachId: string;
    profile: StoredUserProfile;
  } {
    if (
      pending.completedAccountId &&
      pending.completedOwnerUid &&
      store.users[pending.completedAccountId]
    ) {
      const existingProfile = store.users[pending.completedAccountId];
      return {
        session: {
          ownerUid: pending.completedOwnerUid,
          email: pending.email,
          displayName: existingProfile.displayName,
          isAdmin: isAdminEmail(pending.email),
        },
        accountId: existingProfile.uid,
        safeReachId: existingProfile.safeReachId,
        profile: existingProfile,
      };
    }

    const matchingCred = store.credentials.find(
      (c) => c.email === pending.email && c.passwordHash === pending.passwordHash
    );
    let ownerUid: string;
    if (matchingCred) {
      ownerUid = matchingCred.ownerUid;
    } else {
      ownerUid = makeId('owner');
      store.credentials.push({
        id: makeId('cred'),
        ownerUid,
        email: pending.email,
        passwordHash: pending.passwordHash,
        createdAtMs: Date.now(),
      });
    }

    const created = createProfileRecord({
      ownerUid,
      email: pending.email,
      displayName: pending.displayName,
      rolePreference: pending.rolePreference,
      emergencyContactName: '',
      defaultGeofenceRadiusMeters: 300,
    });

    pending.completedAccountId = created.accountId;
    pending.completedOwnerUid = ownerUid;
    pending.completedSafeReachId = created.safeReachId;
    saveStore(true);

    return {
      session: {
        ownerUid,
        email: pending.email,
        displayName: created.profile.displayName,
        isAdmin: isAdminEmail(pending.email),
      },
      accountId: created.accountId,
      safeReachId: created.safeReachId,
      profile: created.profile,
    };
  }

  // Auth Step 1: Request Sign Up -> sends 6-digit OTP directly to user's Gmail inbox (no popup, no premature registration)
  app.post('/api/auth/signup/request', async (req: Request, res: Response) => {
    pruneExpiredPendingSignups();
    const displayName = clampString(req.body?.displayName, 80);
    const email = clampString(req.body?.email, 160).toLowerCase();
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';
    const rawRole = req.body?.rolePreference;
    const rolePreference: 'traveler' | 'family' | 'both' =
      rawRole === 'family' || rawRole === 'traveler' || rawRole === 'both'
        ? rawRole
        : 'traveler';

    if (!displayName) {
      res.status(400).json({error: 'Please enter your full name.'});
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }
    if (password.length < 6) {
      res
        .status(400)
        .json({error: 'Password must be at least 6 characters.'});
      return;
    }

    // Reuse existing ownerUid if duplicate-email uses the same password
    const existingMatchingCred = store.credentials.find(
      (c) => c.email === email && verifyPassword(password, c.passwordHash)
    );

    const pendingId = makeId('pend');
    const otp = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAtMs = now + 10 * 60 * 1000;

    store.pendingSignups[pendingId] = {
      pendingId,
      displayName,
      email,
      passwordHash: existingMatchingCred
        ? existingMatchingCred.passwordHash
        : hashPassword(password),
      rolePreference,
      otpHash: hashPassword(otp),
      otpVerified: false,
      expiresAtMs,
      createdAtMs: now,
    };

    try {
      const delivery = await sendConfirmationEmail({
        to: email,
        displayName,
        otp,
      });
      saveStore(true);

      res.json({
        pendingId,
        email,
        displayName,
        expiresAtMs,
        deliveryMode: delivery.deliveryMode,
      });
    } catch (err) {
      delete store.pendingSignups[pendingId];
      if (err instanceof MailDeliveryError) {
        res.status(err.statusCode).json({error: err.message, code: err.code});
        return;
      }
      res.status(422).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to deliver verification email.',
      });
    }
  });

  // Auth Step 1b: Resend 6-digit OTP email
  app.post('/api/auth/signup/resend', async (req: Request, res: Response) => {
    const pendingId = clampString(req.body?.pendingId, 128);
    const pending = store.pendingSignups[pendingId];
    if (!pending) {
      res.status(404).json({
        error: 'Pending signup expired. Please fill out the Sign Up form again.',
      });
      return;
    }
    if (pending.completedAccountId) {
      res.status(400).json({error: 'This registration is already completed.'});
      return;
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const prevOtpHash = pending.otpHash;
    const prevExpiresAtMs = pending.expiresAtMs;

    pending.otpHash = hashPassword(otp);
    pending.otpVerified = false;
    pending.expiresAtMs = Date.now() + 10 * 60 * 1000;

    try {
      const delivery = await sendConfirmationEmail({
        to: pending.email,
        displayName: pending.displayName,
        otp,
      });
      saveStore(true);

      res.json({
        pendingId: pending.pendingId,
        email: pending.email,
        displayName: pending.displayName,
        expiresAtMs: pending.expiresAtMs,
        deliveryMode: delivery.deliveryMode,
      });
    } catch (err) {
      pending.otpHash = prevOtpHash;
      pending.expiresAtMs = prevExpiresAtMs;
      if (err instanceof MailDeliveryError) {
        res.status(err.statusCode).json({error: err.message, code: err.code});
        return;
      }
      res.status(422).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to resend verification email.',
      });
    }
  });

  // Auth Step 2: Verify 6-digit OTP from email -> completes registration immediately
  app.post('/api/auth/signup/verify-otp', (req: Request, res: Response) => {
    const pendingId = clampString(req.body?.pendingId, 128);
    const otp = clampString(req.body?.otp, 16);
    const pending = store.pendingSignups[pendingId];

    if (!pending) {
      res.status(404).json({
        error: 'Pending signup not found or expired. Please sign up again.',
      });
      return;
    }
    if (Date.now() > pending.expiresAtMs && !pending.completedAccountId) {
      delete store.pendingSignups[pendingId];
      saveStore(true);
      res.status(400).json({
        error: 'OTP has expired. Please sign up again.',
      });
      return;
    }

    if (!pending.otpVerified) {
      if (!otp || !verifyPassword(otp, pending.otpHash)) {
        res.status(400).json({
          error: 'Invalid OTP code. Enter the 6-digit OTP from your email.',
        });
        return;
      }
      pending.otpVerified = true;
    }

    const completed = finalizePendingSignup(pending);
    res.json({
      completed: true,
      otpVerified: true,
      ...completed,
    });
  });

  // Auth: Login with Username/Email + Password
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = clampString(req.body?.email, 160).toLowerCase();
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !email.includes('@')) {
      res.status(400).json({
        error: 'Please enter the registered email address you used during Sign Up.',
      });
      return;
    }
    if (!password) {
      res.status(400).json({error: 'Please enter your password.'});
      return;
    }

    const matchedCred = store.credentials.find(
      (c) => c.email === email && verifyPassword(password, c.passwordHash)
    );
    if (!matchedCred) {
      res.status(401).json({
        error:
          'Invalid username/email or password. Please check your credentials or sign up as a new user.',
      });
      return;
    }

    const ownedAccounts = Object.values(store.users).filter(
      (u) => u.ownerUid === matchedCred.ownerUid
    );
    if (ownedAccounts.length === 0) {
      res.status(401).json({
        error: 'Account was removed. Please sign up to create a new Unique ID.',
      });
      return;
    }

    res.json({
      session: {
        ownerUid: matchedCred.ownerUid,
        email: matchedCred.email,
        displayName: ownedAccounts[0].displayName,
        isAdmin: isAdminEmail(matchedCred.email),
      },
      accounts: ownedAccounts,
    });
  });

  // Workspace snapshot for active owner session
  app.get('/api/workspace/:ownerUid', (req: Request, res: Response) => {
    const ownerUid = String(req.params.ownerUid || '');
    const activeAccountId =
      typeof req.query.activeAccountId === 'string'
        ? req.query.activeAccountId
        : '';
    const callerEmail =
      typeof req.query.email === 'string' ? req.query.email : '';
    const adminUser = isAdminEmail(callerEmail);

    const accounts = Object.values(store.users)
      .filter((u) => u.ownerUid === ownerUid)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    const privateInfoByUid: Record<string, StoredPrivateInfo> = {};
    for (const acc of accounts) {
      if (store.privateInfo[acc.uid]) {
        privateInfoByUid[acc.uid] = store.privateInfo[acc.uid];
      }
    }

    const resolvedActiveId =
      accounts.find((a) => a.uid === activeAccountId)?.uid ||
      accounts[0]?.uid ||
      '';

    const liveState = resolvedActiveId ? store.live[resolvedActiveId] || null : null;
    const trips = resolvedActiveId
      ? Object.values(store.trips)
          .filter((t) => t.uid === resolvedActiveId)
          .sort((a, b) => b.startedAtMs - a.startedAtMs)
          .slice(0, 25)
      : [];
    const history = resolvedActiveId
      ? Object.values(store.history)
          .filter((h) => h.uid === resolvedActiveId)
          .sort((a, b) => b.recordedAtMs - a.recordedAtMs)
          .slice(0, 50)
      : [];

    const allIncomingLinks = Object.values(store.familyLinks).filter(
      (l) => l.travelerOwnerUid === ownerUid
    );
    const allOutgoingLinks = Object.values(store.familyLinks).filter(
      (l) => l.familyOwnerUid === ownerUid
    );
    const allAlerts = Object.values(store.familyAlerts).filter(
      (a) => a.recipientOwnerUid === ownerUid
    );
    const allPlatformUsers = adminUser ? Object.values(store.users) : [];

    res.json({
      allowAllUsers: store.allowAllUsers,
      accounts,
      privateInfoByUid,
      liveState,
      trips,
      history,
      allIncomingLinks,
      allOutgoingLinks,
      allAlerts,
      allPlatformUsers,
    });
  });

  // Create additional duplicate-email / test SafeReach profile under signed-in owner
  app.post('/api/accounts', (req: Request, res: Response) => {
    const ownerUid = clampString(req.body?.ownerUid, 128);
    const email = clampString(req.body?.email, 160).toLowerCase();
    const displayName = clampString(req.body?.displayName, 80);
    if (!ownerUid || !displayName) {
      res.status(400).json({error: 'Owner session and account name required.'});
      return;
    }

    const created = createProfileRecord({
      ownerUid,
      email: email || 'tester@safereach.app',
      displayName,
      rolePreference: req.body?.rolePreference || 'family',
      emergencyContactName: clampString(req.body?.emergencyContactName || '', 80),
      defaultGeofenceRadiusMeters: clampRadius(
        req.body?.defaultGeofenceRadiusMeters
      ),
    });
    saveStore();
    res.json(created);
  });

  // Delete single account
  app.delete('/api/accounts/:accountId', (req: Request, res: Response) => {
    const accountId = String(req.params.accountId || '');
    if (!store.users[accountId]) {
      res.status(404).json({error: 'Account not found.'});
      return;
    }
    const deletedOwnerUid = store.users[accountId].ownerUid;
    removeSingleProfile(accountId);
    const stillHasOwned = Object.values(store.users).some(
      (u) => u.ownerUid === deletedOwnerUid
    );
    if (!stillHasOwned) {
      store.credentials = store.credentials.filter(
        (c) => c.ownerUid !== deletedOwnerUid
      );
    }
    saveStore();
    res.json({ok: true});
  });

  // Delete multiple or all accounts
  app.post('/api/accounts/delete-all', (req: Request, res: Response) => {
    const accountIds: string[] = Array.isArray(req.body?.accountIds)
      ? req.body.accountIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const ownerUid = clampString(req.body?.ownerUid, 128);
    const clearAllPlatform = Boolean(req.body?.clearAllPlatform);

    if (clearAllPlatform) {
      Object.assign(store, emptyStore());
    } else {
      for (const id of accountIds) {
        removeSingleProfile(id);
      }
      if (ownerUid) {
        const remainingForOwner = Object.values(store.users).some(
          (u) => u.ownerUid === ownerUid
        );
        if (!remainingForOwner) {
          store.credentials = store.credentials.filter(
            (c) => c.ownerUid !== ownerUid
          );
        }
      }
    }
    saveStore();
    res.json({ok: true});
  });

  // Exact 10-character Unique ID lookup
  app.get('/api/directory/:safeReachId', (req: Request, res: Response) => {
    const safeReachId = String(req.params.safeReachId || '').trim();
    const entry = store.directory[safeReachId] || null;
    if (!entry) {
      res.status(404).json({error: 'Unique ID not found.'});
      return;
    }
    const profile = store.users[entry.uid] || null;
    res.json({entry, profile});
  });

  // Admin: update subscription / profile modifications
  app.post('/api/admin/update-user', (req: Request, res: Response) => {
    const callerEmail = clampString(req.body?.callerEmail, 160);
    if (!isAdminEmail(callerEmail)) {
      res.status(403).json({error: 'Admin privileges required.'});
      return;
    }
    const targetUid = clampString(req.body?.targetUid, 128);
    const target = store.users[targetUid];
    if (!target) {
      res.status(404).json({error: 'User profile not found.'});
      return;
    }

    const cleanName = clampString(req.body?.displayName, 80) || target.displayName;
    const rolePreference =
      req.body?.rolePreference === 'family' ||
      req.body?.rolePreference === 'traveler' ||
      req.body?.rolePreference === 'both'
        ? req.body.rolePreference
        : target.rolePreference;
    const subscriptionStatus =
      req.body?.subscriptionStatus === 'active' ||
      req.body?.subscriptionStatus === 'revoked' ||
      req.body?.subscriptionStatus === 'pending'
        ? req.body.subscriptionStatus
        : target.subscriptionStatus;
    const accessGranted = Boolean(req.body?.accessGranted);
    const subscriptionNote = clampString(req.body?.subscriptionNote || '', 120);
    const shouldPause = !accessGranted || subscriptionStatus !== 'active';
    const now = Date.now();

    target.displayName = cleanName;
    target.rolePreference = rolePreference;
    target.subscriptionStatus = subscriptionStatus;
    target.accessGranted = accessGranted;
    target.subscriptionNote = subscriptionNote;
    target.updatedAtMs = now;
    if (shouldPause) {
      target.isSharingEnabled = false;
      target.status = 'idle';
      if (store.live[targetUid]) {
        store.live[targetUid].isSharingEnabled = false;
        store.live[targetUid].status = 'idle';
        store.live[targetUid].updatedAtMs = now;
      }
    }

    if (store.directory[target.safeReachId]) {
      store.directory[target.safeReachId].displayName = cleanName;
    }

    saveStore();
    res.json({profile: target});
  });

  // Admin: global access toggle (ON = all users have access, OFF = only allowed users have access)
  app.post('/api/admin/global-access', (req: Request, res: Response) => {
    const callerEmail = clampString(req.body?.callerEmail, 160);
    if (!isAdminEmail(callerEmail)) {
      res.status(403).json({error: 'Admin privileges required.'});
      return;
    }
    const enabled = Boolean(req.body?.allowAllUsers);
    store.allowAllUsers = enabled;
    const now = Date.now();

    if (!enabled) {
      for (const user of Object.values(store.users)) {
        const priv = store.privateInfo[user.uid];
        const individuallyAllowed =
          (user.accessGranted === true && user.subscriptionStatus === 'active') ||
          Boolean(priv && isAdminEmail(priv.email));
        if (!individuallyAllowed) {
          user.isSharingEnabled = false;
          user.status = 'idle';
          user.updatedAtMs = now;
          if (store.live[user.uid]) {
            store.live[user.uid].isSharingEnabled = false;
            store.live[user.uid].status = 'idle';
            store.live[user.uid].updatedAtMs = now;
          }
        }
      }
    }

    saveStore(true);
    res.json({allowAllUsers: store.allowAllUsers});
  });

  // Family link request
  app.post('/api/family-links/request', (req: Request, res: Response) => {
    const travelerUid = clampString(req.body?.travelerUid, 128);
    const familyUid = clampString(req.body?.familyUid, 128);
    const familyOwnerUid = clampString(req.body?.familyOwnerUid, 128);
    const familyName = clampString(req.body?.familyName, 80) || 'Family Member';
    const relationship = clampString(req.body?.relationship, 40) || 'Family';

    if (!travelerUid || !familyUid) {
      res.status(400).json({error: 'Invalid traveler or family account.'});
      return;
    }
    if (travelerUid === familyUid) {
      res.status(400).json({
        error:
          'Switch to another SafeReach account (or create a duplicate-email test account) to test linking.',
      });
      return;
    }
    if (!isProfileSubscribedOrAdmin(familyUid)) {
      res.status(403).json({
        error: 'Admin access approval is required to send requests.',
      });
      return;
    }

    const traveler = store.users[travelerUid];
    if (!traveler) {
      res.status(404).json({error: 'Traveler account not found.'});
      return;
    }

    const linkId = `${travelerUid}_${familyUid}`;
    const existing = store.familyLinks[linkId];
    const now = Date.now();

    if (existing) {
      if (existing.status === 'approved') {
        res.status(400).json({
          error: `You are already linked with ${traveler.displayName}.`,
        });
        return;
      }
      if (existing.status === 'pending') {
        res.status(400).json({
          error: `A request is already pending approval from ${traveler.displayName}.`,
        });
        return;
      }
      existing.relationship = relationship;
      existing.familyName = familyName;
      existing.status = 'pending';
      existing.updatedAtMs = now;
      saveStore();
      res.json({link: existing});
      return;
    }

    const link: StoredFamilyLink = {
      id: linkId,
      travelerUid,
      travelerOwnerUid: traveler.ownerUid,
      travelerSafeReachId: traveler.safeReachId,
      travelerName: traveler.displayName,
      familyUid,
      familyOwnerUid: familyOwnerUid || store.users[familyUid]?.ownerUid || familyUid,
      familyName,
      relationship,
      status: 'pending',
      createdAtMs: now,
      updatedAtMs: now,
    };
    store.familyLinks[linkId] = link;
    saveStore();
    res.json({link});
  });

  // Respond to family link (approve / revoke)
  app.post('/api/family-links/respond', (req: Request, res: Response) => {
    const linkId = clampString(req.body?.linkId, 260);
    const status = req.body?.status === 'approved' ? 'approved' : 'revoked';
    const link = store.familyLinks[linkId];
    if (!link) {
      res.status(404).json({error: 'Connection request not found.'});
      return;
    }
    if (!isProfileSubscribedOrAdmin(link.travelerUid)) {
      res.status(403).json({
        error: 'Admin access approval is required to approve links.',
      });
      return;
    }
    link.status = status;
    link.updatedAtMs = Date.now();
    saveStore();
    res.json({link});
  });

  // Remove family link
  app.delete('/api/family-links/:linkId', (req: Request, res: Response) => {
    const linkId = String(req.params.linkId || '');
    delete store.familyLinks[linkId];
    saveStore();
    res.json({ok: true});
  });

  // Update private preferences
  app.post('/api/private-settings', (req: Request, res: Response) => {
    const uid = clampString(req.body?.uid, 128);
    if (!store.users[uid]) {
      res.status(404).json({error: 'Account not found.'});
      return;
    }
    const existing = store.privateInfo[uid];
    store.privateInfo[uid] = {
      uid,
      ownerUid: clampString(req.body?.ownerUid, 128) || existing?.ownerUid || uid,
      email:
        clampString(req.body?.email, 160).toLowerCase() ||
        existing?.email ||
        'user@safereach.app',
      emergencyContactName: clampString(req.body?.emergencyContactName || '', 80),
      defaultGeofenceRadiusMeters: clampRadius(
        req.body?.defaultGeofenceRadiusMeters
      ),
      updatedAtMs: Date.now(),
    };
    saveStore();
    res.json({privateInfo: store.privateInfo[uid]});
  });

  // Dispatch family alerts
  app.post('/api/alerts/dispatch', (req: Request, res: Response) => {
    const travelerUid = clampString(req.body?.travelerUid, 128);
    const travelerOwnerUid = clampString(req.body?.travelerOwnerUid, 128);
    const travelerName =
      clampString(req.body?.travelerName, 80) || 'Family Member';
    const type = clampString(req.body?.type, 40) || 'sos_alert';
    const message = clampString(req.body?.message, 240);
    const locationLabel = clampString(req.body?.locationLabel, 160);
    const lat = Number(req.body?.lat || 0);
    const lng = Number(req.body?.lng || 0);
    const links: Array<{familyUid?: string; familyOwnerUid?: string}> =
      Array.isArray(req.body?.approvedFamilyLinks)
        ? req.body.approvedFamilyLinks
        : [];

    const now = Date.now();
    for (const link of links.slice(0, 20)) {
      if (!link.familyUid) continue;
      const alertId = makeId('alert');
      store.familyAlerts[alertId] = {
        id: alertId,
        travelerUid,
        travelerOwnerUid,
        travelerName,
        recipientUid: link.familyUid,
        recipientOwnerUid: link.familyOwnerUid || link.familyUid,
        type,
        message,
        locationLabel,
        lat,
        lng,
        isRead: false,
        createdAtMs: now,
      };
    }
    saveStore();
    res.json({ok: true});
  });

  // Mark alert read
  app.post('/api/alerts/:alertId/read', (req: Request, res: Response) => {
    const alertId = String(req.params.alertId || '');
    if (store.familyAlerts[alertId]) {
      store.familyAlerts[alertId].isRead = true;
      saveStore();
    }
    res.json({ok: true});
  });

  // Start journey
  app.post('/api/trips/start', (req: Request, res: Response) => {
    const uid = clampString(req.body?.uid, 128);
    const user = store.users[uid];
    if (!user) {
      res.status(404).json({error: 'Account not found.'});
      return;
    }
    if (!isProfileSubscribedOrAdmin(uid)) {
      res.status(403).json({
        error: 'Admin access approval is required to share location.',
      });
      return;
    }

    const now = Date.now();
    const tripId = makeId('trip');
    const historyId = makeId('hist');
    const radius = clampRadius(req.body?.geofenceRadiusMeters);
    const originName = clampString(req.body?.originName, 120) || 'Current Location';
    const destinationName = clampString(req.body?.destinationName, 120) || 'Destination';
    const originLat = Number(req.body?.originPoint?.lat || 0);
    const originLng = Number(req.body?.originPoint?.lng || 0);
    const destinationLat = Number(req.body?.destinationPoint?.lat || 0);
    const destinationLng = Number(req.body?.destinationPoint?.lng || 0);
    const ownerUid = clampString(req.body?.ownerUid, 128) || user.ownerUid;

    store.trips[`${uid}::${tripId}`] = {
      id: tripId,
      uid,
      ownerUid,
      originName,
      originLat,
      originLng,
      destinationName,
      destinationLat,
      destinationLng,
      geofenceRadiusMeters: radius,
      travelMode: clampString(req.body?.travelMode, 20) || 'DRIVING',
      expectedEncodedPolyline: clampString(
        req.body?.expectedEncodedPolyline || '',
        20000
      ),
      actualEncodedPolyline: '',
      status: 'travelling',
      maxDeviationMeters: 0,
      arrivedAtMs: 0,
      startedAtMs: now,
      updatedAtMs: now,
    };

    store.live[uid] = {
      uid,
      ownerUid,
      lat: originLat,
      lng: originLng,
      accuracyMeters: 15,
      locationLabel: originName,
      status: 'travelling',
      isSharingEnabled: true,
      activeTripId: tripId,
      destinationName,
      destinationLat,
      destinationLng,
      geofenceRadiusMeters: radius,
      distanceToDestinationMeters: Math.max(
        0,
        Math.round(Number(req.body?.distanceToDestinationMeters || 0))
      ),
      routeDeviationMeters: 0,
      updatedAtMs: now,
    };

    user.isSharingEnabled = true;
    user.status = 'travelling';
    user.updatedAtMs = now;

    store.history[`${uid}::${historyId}`] = {
      id: historyId,
      uid,
      ownerUid,
      tripId,
      lat: originLat,
      lng: originLng,
      locationLabel: originName,
      status: 'travelling',
      recordedAtMs: now,
    };

    const links: Array<{familyUid?: string; familyOwnerUid?: string}> =
      Array.isArray(req.body?.approvedFamilyLinks)
        ? req.body.approvedFamilyLinks
        : [];
    const travelerName =
      clampString(req.body?.travelerName, 80) || user.displayName;
    for (const link of links.slice(0, 20)) {
      if (!link.familyUid) continue;
      const alertId = makeId('alert');
      store.familyAlerts[alertId] = {
        id: alertId,
        travelerUid: uid,
        travelerOwnerUid: ownerUid,
        travelerName,
        recipientUid: link.familyUid,
        recipientOwnerUid: link.familyOwnerUid || link.familyUid,
        type: 'trip_started',
        message: `${travelerName} started a journey to ${destinationName}.`,
        locationLabel: originName,
        lat: originLat,
        lng: originLng,
        isRead: false,
        createdAtMs: now,
      };
    }

    saveStore();
    res.json({tripId});
  });

  // Live telemetry update
  app.post('/api/telemetry/update', (req: Request, res: Response) => {
    const uid = clampString(req.body?.uid, 128);
    const user = store.users[uid];
    if (!user) {
      res.status(404).json({error: 'Account not found.'});
      return;
    }
    if (!isProfileSubscribedOrAdmin(uid)) {
      res.status(403).json({
        error: 'Admin access approval is required to share location.',
      });
      return;
    }

    const now = Date.now();
    const ownerUid = clampString(req.body?.ownerUid, 128) || user.ownerUid;
    const lat = Number(req.body?.point?.lat || 0);
    const lng = Number(req.body?.point?.lng || 0);
    const locationLabel = clampString(req.body?.locationLabel || '', 160);
    const destinationName = clampString(req.body?.destinationName || '', 120);
    const status = clampString(req.body?.status || 'travelling', 32);
    const isSharingEnabled = Boolean(req.body?.isSharingEnabled);
    const activeTripId = clampString(req.body?.activeTripId || '', 128);
    const radius = clampRadius(req.body?.geofenceRadiusMeters);

    store.live[uid] = {
      uid,
      ownerUid,
      lat,
      lng,
      accuracyMeters: Math.max(0, Math.round(Number(req.body?.accuracyMeters || 15))),
      locationLabel,
      status,
      isSharingEnabled,
      activeTripId,
      destinationName,
      destinationLat: Number(req.body?.destinationPoint?.lat || 0),
      destinationLng: Number(req.body?.destinationPoint?.lng || 0),
      geofenceRadiusMeters: radius,
      distanceToDestinationMeters: Math.max(
        0,
        Math.round(Number(req.body?.distanceToDestinationMeters || 0))
      ),
      routeDeviationMeters: Math.max(
        0,
        Math.round(Number(req.body?.routeDeviationMeters || 0))
      ),
      updatedAtMs: now,
    };

    user.isSharingEnabled = isSharingEnabled;
    user.status = status;
    user.updatedAtMs = now;

    if (activeTripId && req.body?.tripStatus) {
      const trip = store.trips[`${uid}::${activeTripId}`];
      if (trip) {
        trip.actualEncodedPolyline = clampString(
          req.body?.actualEncodedPolyline || '',
          20000
        );
        trip.status = clampString(req.body?.tripStatus, 32);
        trip.maxDeviationMeters = Math.max(
          0,
          Math.round(
            Number(
              req.body?.maxDeviationMeters ?? req.body?.routeDeviationMeters ?? 0
            )
          )
        );
        trip.arrivedAtMs = Number(req.body?.arrivedAtMs || 0);
        trip.updatedAtMs = now;
      }
    }

    if (req.body?.recordHistory) {
      const historyId = makeId('hist');
      store.history[`${uid}::${historyId}`] = {
        id: historyId,
        uid,
        ownerUid,
        tripId: activeTripId,
        lat,
        lng,
        locationLabel,
        status,
        recordedAtMs: now,
      };
    }

    saveStore();
    res.json({ok: true});
  });

  // Stop sharing
  app.post('/api/telemetry/stop', (req: Request, res: Response) => {
    const uid = clampString(req.body?.uid, 128);
    const user = store.users[uid];
    if (!user) {
      res.status(404).json({error: 'Account not found.'});
      return;
    }
    const now = Date.now();
    const ownerUid = clampString(req.body?.ownerUid, 128) || user.ownerUid;
    const activeTripId = clampString(req.body?.activeTripId || '', 128);
    const lat = Number(req.body?.currentPoint?.lat || 0);
    const lng = Number(req.body?.currentPoint?.lng || 0);

    user.isSharingEnabled = false;
    user.status = 'idle';
    user.updatedAtMs = now;

    store.live[uid] = {
      uid,
      ownerUid,
      lat,
      lng,
      accuracyMeters: 0,
      locationLabel:
        clampString(req.body?.locationLabel || 'Location sharing paused', 160),
      status: 'idle',
      isSharingEnabled: false,
      activeTripId: '',
      destinationName: '',
      destinationLat: 0,
      destinationLng: 0,
      geofenceRadiusMeters: 300,
      distanceToDestinationMeters: 0,
      routeDeviationMeters: 0,
      updatedAtMs: now,
    };

    if (activeTripId && store.trips[`${uid}::${activeTripId}`]) {
      store.trips[`${uid}::${activeTripId}`].status = 'cancelled';
      store.trips[`${uid}::${activeTripId}`].updatedAtMs = now;
    }

    saveStore();
    res.json({ok: true});
  });

  // Delete single history entry
  app.delete('/api/history/:uid/:entryId', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const entryId = String(req.params.entryId || '');
    delete store.history[`${uid}::${entryId}`];
    saveStore();
    res.json({ok: true});
  });

  // Family live tracking fetch for an approved traveler
  app.get('/api/traveler-live/:travelerUid', (req: Request, res: Response) => {
    const travelerUid = String(req.params.travelerUid || '');
    const familyUid =
      typeof req.query.familyUid === 'string' ? req.query.familyUid : '';

    const link = familyUid
      ? store.familyLinks[`${travelerUid}_${familyUid}`]
      : Object.values(store.familyLinks).find(
          (l) => l.travelerUid === travelerUid && l.status === 'approved'
        );

    if (!link || link.status !== 'approved' || !isProfileSubscribedOrAdmin(travelerUid)) {
      res.json({live: null, activeTrip: null});
      return;
    }

    const live = store.live[travelerUid] || null;
    const activeTrip =
      live?.activeTripId
        ? store.trips[`${travelerUid}::${live.activeTripId}`] || null
        : null;

    res.json({live, activeTrip});
  });

  // Free zero-billing destination autocomplete (Photon / OpenStreetMap Nominatim)
  app.get('/api/places/autocomplete', async (req: Request, res: Response) => {
    const q = clampString(req.query.q, 140);
    if (q.length < 2) {
      res.json({results: []});
      return;
    }
    const latNum = Number(req.query.lat);
    const lngNum = Number(req.query.lng);
    const hasBias =
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      (latNum !== 0 || lngNum !== 0);

    try {
      const photonParams = new URLSearchParams({
        q,
        limit: '6',
        lang: 'en',
      });
      if (hasBias) {
        photonParams.set('lat', String(latNum));
        photonParams.set('lon', String(lngNum));
      }
      const photonRes = await fetch(
        `https://photon.komoot.io/api/?${photonParams.toString()}`,
        {
          headers: {'User-Agent': 'SafeReach/1.0 (https://safereach.app)'},
          signal: AbortSignal.timeout(4500),
        }
      );
      if (photonRes.ok) {
        const data = (await photonRes.json()) as {
          features?: Array<{
            geometry?: {coordinates?: [number, number]};
            properties?: {
              name?: string;
              street?: string;
              city?: string;
              state?: string;
              country?: string;
            };
          }>;
        };
        const results = (data.features || [])
          .map((f) => {
            const coords = f.geometry?.coordinates;
            const p = f.properties;
            if (!coords || coords.length < 2) return null;
            const name =
              p?.name || p?.street || p?.city || p?.state || 'Selected place';
            const addrParts = [p?.street, p?.city, p?.state, p?.country].filter(
              (v): v is string => Boolean(v && v !== name)
            );
            return {
              name,
              address: addrParts.join(', ') || name,
              location: {lat: Number(coords[1]), lng: Number(coords[0])},
            };
          })
          .filter(
            (
              item
            ): item is {
              name: string;
              address: string;
              location: {lat: number; lng: number};
            } => Boolean(item)
          );
        if (results.length > 0) {
          res.json({results});
          return;
        }
      }
    } catch {
      // Fall through to Nominatim
    }

    try {
      const nomParams = new URLSearchParams({
        q,
        format: 'json',
        limit: '6',
        addressdetails: '1',
      });
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?${nomParams.toString()}`,
        {
          headers: {'User-Agent': 'SafeReach/1.0 (https://safereach.app)'},
          signal: AbortSignal.timeout(4500),
        }
      );
      if (nomRes.ok) {
        const items = (await nomRes.json()) as Array<{
          display_name?: string;
          name?: string;
          lat?: string;
          lon?: string;
        }>;
        const results = items
          .map((it) => {
            const lat = Number(it.lat);
            const lng = Number(it.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const full = it.display_name || '';
            const firstPart = full.split(',')[0]?.trim();
            const name = it.name || firstPart || 'Selected place';
            return {
              name,
              address: full || name,
              location: {lat, lng},
            };
          })
          .filter(
            (
              item
            ): item is {
              name: string;
              address: string;
              location: {lat: number; lng: number};
            } => Boolean(item)
          );
        res.json({results});
        return;
      }
    } catch {
      // Ignore upstream timeout
    }

    res.json({results: []});
  });

  // Free zero-billing reverse landmark lookup (OpenStreetMap Nominatim)
  app.get('/api/places/reverse', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.json({label: 'Live Coordinates'});
      return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17`;
      const nomRes = await fetch(url, {
        headers: {'User-Agent': 'SafeReach/1.0 (https://safereach.app)'},
        signal: AbortSignal.timeout(3500),
      });
      if (nomRes.ok) {
        const data = (await nomRes.json()) as {
          name?: string;
          display_name?: string;
          address?: {
            road?: string;
            neighbourhood?: string;
            suburb?: string;
            city?: string;
            town?: string;
            village?: string;
          };
        };
        const a = data.address;
        const landmark =
          data.name ||
          a?.road ||
          a?.neighbourhood ||
          a?.suburb ||
          a?.city ||
          a?.town ||
          a?.village ||
          data.display_name?.split(',')[0]?.trim();
        if (landmark) {
          res.json({label: `Near ${landmark.slice(0, 120)}`});
          return;
        }
      }
    } catch {
      // Graceful fallback below
    }

    res.json({label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`});
  });

  // Free zero-billing road route estimation (OSRM public routing server)
  app.post('/api/routes/compute', async (req: Request, res: Response) => {
    const oLat = Number(req.body?.origin?.lat);
    const oLng = Number(req.body?.origin?.lng);
    const dLat = Number(req.body?.destination?.lat);
    const dLng = Number(req.body?.destination?.lng);
    const mode = clampString(req.body?.travelMode, 20) || 'DRIVING';

    if (
      !Number.isFinite(oLat) ||
      !Number.isFinite(oLng) ||
      !Number.isFinite(dLat) ||
      !Number.isFinite(dLng)
    ) {
      res.status(400).json({error: 'Valid origin and destination required.'});
      return;
    }

    const profile = mode === 'WALKING' ? 'foot' : 'driving';
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=polyline`;
      const osrmRes = await fetch(osrmUrl, {
        headers: {'User-Agent': 'SafeReach/1.0'},
        signal: AbortSignal.timeout(4500),
      });
      if (osrmRes.ok) {
        const data = (await osrmRes.json()) as {
          code?: string;
          routes?: Array<{
            geometry?: string;
            distance?: number;
            duration?: number;
          }>;
        };
        const primary = data.routes?.[0];
        if (data.code === 'Ok' && primary?.geometry) {
          res.json({
            encodedPolyline: primary.geometry,
            distanceMeters: Math.round(primary.distance || 0),
            durationMins: Math.max(
              1,
              Math.round((primary.duration || 60) / 60)
            ),
          });
          return;
        }
      }
    } catch {
      // Fall back to direct estimate
    }

    res.json({
      encodedPolyline: '',
      distanceMeters: 0,
      durationMins: 0,
    });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true, hmr: false},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SafeReach server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
