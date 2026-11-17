import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {Request, Response} from 'express';

const ADMIN_EMAIL = 'udayphanindravamsikoyya@gmail.com';
const PORT = Number(process.env.PORT || 3000);
const STORE_PATH = path.resolve(process.cwd(), '.safereach-store.json');

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

interface SafeReachStore {
  credentials: StoredCredential[];
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
    credentials: [],
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

function loadStore(): SafeReachStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SafeReachStore>;
      return {
        credentials: Array.isArray(parsed.credentials)
          ? parsed.credentials
          : [],
        users: parsed.users || {},
        privateInfo: parsed.privateInfo || {},
        directory: parsed.directory || {},
        familyLinks: parsed.familyLinks || {},
        live: parsed.live || {},
        trips: parsed.trips || {},
        history: parsed.history || {},
        familyAlerts: parsed.familyAlerts || {},
      };
    }
  } catch {
    // Fall back to fresh empty store
  }
  return emptyStore();
}

const store: SafeReachStore = loadStore();
let storeVersion = 1;
const sseClients = new Set<Response>();

function saveStore(): void {
  storeVersion += 1;
  try {
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch {
    // Keep in-memory state active even if filesystem write fails
  }
  const payload = `event: sync\ndata: ${JSON.stringify({version: storeVersion})}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
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

  // Auth: Sign Up (supports duplicate email for testing + immediate 10-char Unique ID)
  app.post('/api/auth/signup', (req: Request, res: Response) => {
    const displayName = clampString(req.body?.displayName, 80);
    const email = clampString(req.body?.email, 160).toLowerCase();
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';
    const rolePreference = req.body?.rolePreference || 'traveler';

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

    // Duplicate email testing:
    // - If same email + matching password already exists, attach under same ownerUid
    //   (unless all profiles under that ownerUid were deleted, in which case reuse ownerUid).
    // - If same email + different password, create a separate ownerUid so both logins work!
    const matchingCred = store.credentials.find(
      (c) => c.email === email && verifyPassword(password, c.passwordHash)
    );

    let ownerUid: string;
    if (matchingCred) {
      ownerUid = matchingCred.ownerUid;
    } else {
      ownerUid = makeId('owner');
      store.credentials.push({
        id: makeId('cred'),
        ownerUid,
        email,
        passwordHash: hashPassword(password),
        createdAtMs: Date.now(),
      });
    }

    const created = createProfileRecord({
      ownerUid,
      email,
      displayName,
      rolePreference,
      emergencyContactName: '',
      defaultGeofenceRadiusMeters: 300,
    });
    saveStore();

    res.json({
      session: {
        ownerUid,
        email,
        displayName: created.profile.displayName,
        isAdmin: isAdminEmail(email),
      },
      accountId: created.accountId,
      safeReachId: created.safeReachId,
      profile: created.profile,
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
        error: 'Active Admin subscription approval is required to send requests.',
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
        error: 'Active Admin subscription approval is required to approve links.',
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
        error: 'Active Admin subscription approval is required to share location.',
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
        error: 'Active Admin subscription approval is required to share location.',
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
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SafeReach server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
