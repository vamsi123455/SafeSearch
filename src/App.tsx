import React, {useEffect, useMemo, useRef, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Lock,
  LogOut,
  Navigation,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {AdminPortal} from './components/admin/AdminPortal';
import {TestAccountsPanel} from './components/accounts/TestAccountsPanel';
import {
  AuthOnboarding,
  EmailSignupFormData,
  SignupFormData,
} from './components/auth/AuthOnboarding';
import {TrustedCirclePanel} from './components/circle/TrustedCirclePanel';
import {ErrorBoundary} from './components/ErrorBoundary';
import {FamilyDashboard} from './components/family/FamilyDashboard';
import {LocationHistoryPanel} from './components/history/LocationHistoryPanel';
import {LocationPermissionModal} from './components/modals/LocationPermissionModal';
import {TravelerWorkspace} from './components/traveler/TravelerWorkspace';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  createAccountId,
  deleteMultipleSafeReachAccounts,
  deleteSafeReachAccount,
  registerSafeReachProfile,
} from './lib/safereachApi';
import {
  ADMIN_EMAIL,
  FamilyAlert,
  FamilyLink,
  isAdminEmail,
  isUserProfileActive,
  LiveLocationState,
  LocationHistoryEntry,
  PrivateUserInfo,
  RolePreference,
  Trip,
  UserProfile,
} from './types/safereach';

type ActiveTab = 'give_access' | 'track' | 'accounts' | 'history' | 'admin';

const MAPS_API_KEY: string =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  (typeof process !== 'undefined' && process.env?.GOOGLE_MAPS_API_KEY) ||
  '';

function getSessionAccountKey(authUid: string): string {
  return `safereach_active_account_${authUid}`;
}

function formatFirebaseAuthError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as {code?: unknown}).code || '');
    switch (code) {
      case 'auth/operation-not-allowed':
        return 'Email/Password authentication is not enabled for this project.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Switch to Login and sign in with your email and password.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email/username or password. Please check your credentials or sign up as a new user.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
        return 'Google registration popup was closed before completing.';
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : fallback;
}

function SafeReachAppShell() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const [ownedQueryAccounts, setOwnedQueryAccounts] = useState<UserProfile[]>(
    []
  );
  const [legacyPrimaryAccount, setLegacyPrimaryAccount] =
    useState<UserProfile | null>(null);
  const [allPlatformUsers, setAllPlatformUsers] = useState<UserProfile[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const [privateInfoByUid, setPrivateInfoByUid] = useState<
    Record<string, PrivateUserInfo>
  >({});
  const [liveState, setLiveState] = useState<LiveLocationState | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [history, setHistory] = useState<LocationHistoryEntry[]>([]);
  const [allIncomingLinks, setAllIncomingLinks] = useState<FamilyLink[]>([]);
  const [allOutgoingLinks, setAllOutgoingLinks] = useState<FamilyLink[]>([]);
  const [allAlerts, setAllAlerts] = useState<FamilyAlert[]>([]);

  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('give_access');
  const [hasChosenMode, setHasChosenMode] = useState(false);
  const [copiedGateId, setCopiedGateId] = useState(false);
  const initialTabSetRef = useRef(false);
  const pendingSignupRef = useRef<SignupFormData | null>(null);
  const autoCreatingRef = useRef(false);

  const [hasLocationConsent, setHasLocationConsent] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationPermError, setLocationPermError] = useState<string | null>(
    null
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const isAdminUser = useMemo(
    () =>
      Boolean(
        firebaseUser?.emailVerified && isAdminEmail(firebaseUser?.email)
      ),
    [firebaseUser]
  );

  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions
        .query({name: 'geolocation'})
        .then((res) => {
          if (res.state === 'granted') {
            setHasLocationConsent(true);
          }
        })
        .catch(() => {
          // Permissions API optional across browsers
        });
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setOwnedQueryAccounts([]);
        setLegacyPrimaryAccount(null);
        setAllPlatformUsers([]);
        setActiveAccountId(null);
        setPrivateInfoByUid({});
        setLiveState(null);
        setTrips([]);
        setHistory([]);
        setAllIncomingLinks([]);
        setAllOutgoingLinks([]);
        setAllAlerts([]);
        setAccountsLoading(false);
        setHasChosenMode(false);
        initialTabSetRef.current = false;
      } else {
        setAccountsLoading(true);
      }
    });
    return () => unsub();
  }, []);

  // Load all SafeReach accounts owned by firebaseUser.uid (plus legacy doc if present)
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const uid = firebaseUser.uid;
    let queryReady = false;
    let legacyReady = false;
    const markReady = () => {
      if (queryReady && legacyReady) {
        setAccountsLoading(false);
      }
    };

    const unsubQuery = onSnapshot(
      query(collection(db, 'users'), where('ownerUid', '==', uid)),
      (snap) => {
        setOwnedQueryAccounts(snap.docs.map((d) => d.data() as UserProfile));
        queryReady = true;
        markReady();
      },
      (err) => {
        queryReady = true;
        markReady();
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    );

    const unsubLegacy = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setLegacyPrimaryAccount(snap.data() as UserProfile);
        } else {
          setLegacyPrimaryAccount(null);
        }
        legacyReady = true;
        markReady();
      },
      (err) => {
        legacyReady = true;
        markReady();
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      }
    );

    return () => {
      unsubQuery();
      unsubLegacy();
    };
  }, [authReady, firebaseUser]);

  // Admin-only full user directory subscription for Admin Portal
  useEffect(() => {
    if (!authReady || !firebaseUser || !isAdminUser) {
      setAllPlatformUsers([]);
      return;
    }

    const unsubAdmin = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAllPlatformUsers(snap.docs.map((d) => d.data() as UserProfile));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    );

    return () => unsubAdmin();
  }, [authReady, firebaseUser, isAdminUser]);

  // Deduplicated list of all accounts owned by this signed-in Google user
  const accounts = useMemo(() => {
    const mapById: Record<string, UserProfile> = {};
    if (legacyPrimaryAccount) {
      mapById[legacyPrimaryAccount.uid] = legacyPrimaryAccount;
    }
    for (const acc of ownedQueryAccounts) {
      mapById[acc.uid] = acc;
    }
    return Object.values(mapById).sort((a, b) => {
      const aMs = a.createdAt ? a.createdAt.toMillis() : 0;
      const bMs = b.createdAt ? b.createdAt.toMillis() : 0;
      return aMs - bMs;
    });
  }, [legacyPrimaryAccount, ownedQueryAccounts]);

  // Select active account for this tab (persisted per-tab in sessionStorage)
  useEffect(() => {
    if (!firebaseUser || accounts.length === 0 || autoCreatingRef.current) return;

    const stored = window.sessionStorage.getItem(
      getSessionAccountKey(firebaseUser.uid)
    );
    const chosen =
      (activeAccountId && accounts.find((a) => a.uid === activeAccountId)) ||
      (stored && accounts.find((a) => a.uid === stored)) ||
      accounts[0];

    if (chosen && chosen.uid !== activeAccountId) {
      setActiveAccountId(chosen.uid);
      window.sessionStorage.setItem(
        getSessionAccountKey(firebaseUser.uid),
        chosen.uid
      );
      if (!initialTabSetRef.current) {
        if (isAdminUser) {
          setActiveTab('admin');
          setHasChosenMode(true);
        } else if (chosen.rolePreference === 'family') {
          setActiveTab('track');
          setHasChosenMode(true);
        } else if (chosen.rolePreference === 'traveler') {
          setActiveTab('give_access');
          setHasChosenMode(true);
        } else {
          setActiveTab('give_access');
          setHasChosenMode(false);
        }
        initialTabSetRef.current = true;
      }
    }
  }, [firebaseUser, accounts, activeAccountId, isAdminUser]);

  const profile = useMemo(
    () => accounts.find((a) => a.uid === activeAccountId) || null,
    [accounts, activeAccountId]
  );

  // Listen to private/info for all owned accounts
  const accountIdListKey = accounts.map((a) => a.uid).join('|');
  useEffect(() => {
    if (!authReady || !firebaseUser || accounts.length === 0) return;
    const unsubs: Array<() => void> = [];

    for (const acc of accounts) {
      const unsub = onSnapshot(
        doc(db, 'users', acc.uid, 'private', 'info'),
        (snap) => {
          if (snap.exists()) {
            setPrivateInfoByUid((prev) => ({
              ...prev,
              [acc.uid]: snap.data() as PrivateUserInfo,
            }));
          }
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.GET,
            `users/${acc.uid}/private/info`
          );
        }
      );
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, accountIdListKey]);

  // Listen to liveState, trips, and history for the currently active account
  useEffect(() => {
    if (!authReady || !firebaseUser || !activeAccountId) {
      setLiveState(null);
      setTrips([]);
      setHistory([]);
      return;
    }

    const ownerUid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', activeAccountId, 'live', 'current'),
        (snap) => {
          if (snap.exists()) {
            setLiveState(snap.data() as LiveLocationState);
          } else {
            setLiveState(null);
          }
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.GET,
            `users/${activeAccountId}/live/current`
          );
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'users', activeAccountId, 'trips'),
          where('ownerUid', '==', ownerUid)
        ),
        (snap) => {
          const sorted = snap.docs
            .map((d) => d.data() as Trip)
            .sort((a, b) => {
              const aMs = a.startedAt ? a.startedAt.toMillis() : Date.now();
              const bMs = b.startedAt ? b.startedAt.toMillis() : Date.now();
              return bMs - aMs;
            })
            .slice(0, 25);
          setTrips(sorted);
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `users/${activeAccountId}/trips`
          );
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'users', activeAccountId, 'history'),
          where('ownerUid', '==', ownerUid)
        ),
        (snap) => {
          const sorted = snap.docs
            .map((d) => d.data() as LocationHistoryEntry)
            .sort((a, b) => {
              const aMs = a.recordedAt ? a.recordedAt.toMillis() : Date.now();
              const bMs = b.recordedAt ? b.recordedAt.toMillis() : Date.now();
              return bMs - aMs;
            })
            .slice(0, 50);
          setHistory(sorted);
        },
        (err) => {
          handleFirestoreError(
            err,
            OperationType.LIST,
            `users/${activeAccountId}/history`
          );
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, activeAccountId]);

  // Listen to familyLinks & familyAlerts owned by firebaseUser.uid, filtered per activeAccountId
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'familyLinks'), where('travelerOwnerUid', '==', uid)),
        (snap) => {
          setAllIncomingLinks(snap.docs.map((d) => d.data() as FamilyLink));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'familyLinks');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'familyLinks'), where('familyOwnerUid', '==', uid)),
        (snap) => {
          setAllOutgoingLinks(snap.docs.map((d) => d.data() as FamilyLink));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'familyLinks');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'familyAlerts'),
          where('recipientOwnerUid', '==', uid)
        ),
        (snap) => {
          setAllAlerts(snap.docs.map((d) => d.data() as FamilyAlert));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'familyAlerts');
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, firebaseUser]);

  const incomingLinks = useMemo(
    () =>
      allIncomingLinks.filter((l) => l.travelerUid === activeAccountId),
    [allIncomingLinks, activeAccountId]
  );

  const outgoingLinks = useMemo(
    () => allOutgoingLinks.filter((l) => l.familyUid === activeAccountId),
    [allOutgoingLinks, activeAccountId]
  );

  const alerts = useMemo(
    () =>
      allAlerts
        .filter((a) => a.recipientUid === activeAccountId)
        .sort((a, b) => {
          const aMs = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bMs = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bMs - aMs;
        })
        .slice(0, 25),
    [allAlerts, activeAccountId]
  );

  const applyPostAccountSelection = (
    ownerUid: string,
    accountId: string,
    rolePreference: RolePreference,
    adminUser: boolean,
    isFirstAccount: boolean
  ) => {
    setLiveState(null);
    setTrips([]);
    setHistory([]);
    setActiveAccountId(accountId);
    window.sessionStorage.setItem(getSessionAccountKey(ownerUid), accountId);
    if (adminUser && isFirstAccount) {
      setActiveTab('admin');
      setHasChosenMode(true);
    } else if (rolePreference === 'family') {
      setActiveTab('track');
      setHasChosenMode(true);
    } else if (rolePreference === 'traveler') {
      setActiveTab('give_access');
      setHasChosenMode(true);
    } else {
      setActiveTab('give_access');
      setHasChosenMode(false);
    }
    initialTabSetRef.current = true;
  };

  const handleEmailLogin = async (email: string, password: string) => {
    pendingSignupRef.current = null;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setAuthError(
        formatFirebaseAuthError(err, 'Unable to sign in with email and password.')
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmailSignUp = async (data: EmailSignupFormData) => {
    pendingSignupRef.current = null;
    autoCreatingRef.current = true;
    setAuthSubmitting(true);
    setAuthError(null);
    const trimmedEmail = data.email.trim();

    try {
      let authUser: User;
      let isFirstAccount = true;

      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          data.password
        );
        authUser = cred.user;
        await updateProfile(authUser, {
          displayName: data.displayName,
        }).catch(() => {});
        await sendEmailVerification(authUser).catch(() => {});
      } catch (createErr) {
        const code =
          createErr && typeof createErr === 'object' && 'code' in createErr
            ? String((createErr as {code?: unknown}).code || '')
            : '';
        if (code !== 'auth/email-already-in-use') {
          throw createErr;
        }

        // Duplicate email testing: sign into the existing Auth record with the entered password
        // and create an additional SafeReach profile with its own 10-character Unique ID.
        try {
          const existingCred = await signInWithEmailAndPassword(
            auth,
            trimmedEmail,
            data.password
          );
          authUser = existingCred.user;
          isFirstAccount = false;
        } catch (signInErr) {
          const signInCode =
            signInErr && typeof signInErr === 'object' && 'code' in signInErr
              ? String((signInErr as {code?: unknown}).code || '')
              : '';
          if (
            signInCode === 'auth/invalid-credential' ||
            signInCode === 'auth/wrong-password'
          ) {
            throw new Error(
              'This email is already registered. To create another duplicate-email test account under it, enter the same password used for this email (or sign in and use the Accounts tab).'
            );
          }
          throw signInErr;
        }
      }

      const adminUser = Boolean(
        authUser.emailVerified && isAdminEmail(authUser.email)
      );
      const targetAccountId = isFirstAccount
        ? authUser.uid
        : createAccountId('acct');

      window.sessionStorage.setItem(
        getSessionAccountKey(authUser.uid),
        targetAccountId
      );

      const result = await registerSafeReachProfile({
        accountId: targetAccountId,
        ownerUid: authUser.uid,
        isAdminCaller: adminUser,
        displayName: data.displayName,
        email: trimmedEmail,
        emergencyContactName: '',
        rolePreference: data.rolePreference,
        defaultGeofenceRadiusMeters: 300,
      });

      applyPostAccountSelection(
        authUser.uid,
        result.accountId,
        data.rolePreference,
        adminUser,
        isFirstAccount
      );
    } catch (err) {
      setAuthError(
        formatFirebaseAuthError(err, 'Unable to create your SafeReach account.')
      );
    } finally {
      autoCreatingRef.current = false;
      setAuthSubmitting(false);
    }
  };

  const handleGoogleRegisterWithDetails = async (data?: SignupFormData) => {
    pendingSignupRef.current = data ?? null;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      if (!data) {
        setAuthSubmitting(false);
      }
    } catch (err) {
      pendingSignupRef.current = null;
      setAuthError(
        formatFirebaseAuthError(err, 'Unable to register with Google account.')
      );
      setAuthSubmitting(false);
    }
  };

  const handleCreateAccount = async (
    data: SignupFormData,
    isFirstAccount: boolean
  ) => {
    if (!firebaseUser) return;
    autoCreatingRef.current = true;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const adminUser = Boolean(
        firebaseUser.emailVerified && isAdminEmail(firebaseUser.email)
      );
      const targetAccountId = isFirstAccount
        ? firebaseUser.uid
        : createAccountId('acct');
      window.sessionStorage.setItem(
        getSessionAccountKey(firebaseUser.uid),
        targetAccountId
      );
      const result = await registerSafeReachProfile({
        accountId: targetAccountId,
        ownerUid: firebaseUser.uid,
        isAdminCaller: adminUser,
        ...data,
        email: data.email || firebaseUser.email || 'user@safereach.app',
      });
      applyPostAccountSelection(
        firebaseUser.uid,
        result.accountId,
        data.rolePreference,
        adminUser,
        isFirstAccount
      );
    } catch (err) {
      setAuthError(
        formatFirebaseAuthError(err, 'Failed to create SafeReach account.')
      );
    } finally {
      autoCreatingRef.current = false;
      setAuthSubmitting(false);
    }
  };

  // Auto-complete registration right after Google sign-in if the user filled the Sign Up form first
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      accountsLoading ||
      !pendingSignupRef.current ||
      autoCreatingRef.current
    ) {
      return;
    }

    const pending = pendingSignupRef.current;
    pendingSignupRef.current = null;

    if (accounts.length > 0 && !pending.displayName.trim()) {
      setAuthSubmitting(false);
      return;
    }

    autoCreatingRef.current = true;
    void handleCreateAccount(
      {
        ...pending,
        email: pending.email || firebaseUser.email || 'user@safereach.app',
      },
      accounts.length === 0
    ).finally(() => {
      autoCreatingRef.current = false;
    });
  }, [authReady, firebaseUser, accountsLoading, accounts.length]);

  const handleSelectAccount = (
    accountId: string,
    preferredTab?: 'give_access' | 'track'
  ) => {
    if (!firebaseUser) return;
    if (accountId !== activeAccountId) {
      setLiveState(null);
      setTrips([]);
      setHistory([]);
    }
    setActiveAccountId(accountId);
    window.sessionStorage.setItem(
      getSessionAccountKey(firebaseUser.uid),
      accountId
    );
    if (preferredTab) {
      setActiveTab(preferredTab);
      setHasChosenMode(true);
    }
  };

  const handleSignOut = async () => {
    setVerificationNotice(null);
    await signOut(auth);
  };

  const handleDeleteSingleAccount = async (target: UserProfile) => {
    if (!firebaseUser) return;
    await deleteSafeReachAccount(target, firebaseUser.uid, isAdminUser);
    const remaining = accounts.filter((a) => a.uid !== target.uid);
    if (remaining.length === 0) {
      window.sessionStorage.removeItem(getSessionAccountKey(firebaseUser.uid));
      await handleSignOut();
      return;
    }
    if (target.uid === activeAccountId) {
      const next = remaining[0];
      setActiveAccountId(next.uid);
      window.sessionStorage.setItem(
        getSessionAccountKey(firebaseUser.uid),
        next.uid
      );
    }
  };

  const handleDeleteAllAccounts = async (targetList: UserProfile[]) => {
    if (!firebaseUser) return;
    await deleteMultipleSafeReachAccounts(
      targetList,
      firebaseUser.uid,
      isAdminUser
    );
    window.sessionStorage.removeItem(getSessionAccountKey(firebaseUser.uid));
    await handleSignOut();
  };

  const handleResendAdminVerification = async () => {
    if (!firebaseUser) return;
    try {
      await sendEmailVerification(firebaseUser);
      setVerificationNotice(
        'Verification email sent to ' + (firebaseUser.email || ADMIN_EMAIL)
      );
    } catch (err) {
      setVerificationNotice(
        formatFirebaseAuthError(err, 'Could not send verification email.')
      );
    }
  };

  const handleReloadVerification = async () => {
    if (!firebaseUser) return;
    try {
      await firebaseUser.reload();
      setFirebaseUser(auth.currentUser);
      if (auth.currentUser?.emailVerified) {
        setVerificationNotice(null);
      } else {
        setVerificationNotice(
          'Email is not verified yet. Please click the verification link in your inbox.'
        );
      }
    } catch {
      setVerificationNotice('Unable to refresh verification status.');
    }
  };

  const handleAllowLocation = () => {
    setLocationPermError(null);
    if (!navigator.geolocation) {
      setHasLocationConsent(true);
      setLocationModalOpen(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setHasLocationConsent(true);
        setLocationModalOpen(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPermError(
            'Browser blocked GPS permission. You can allow location in your browser address bar, or continue with simulated journey playback.'
          );
          setHasLocationConsent(true);
        } else {
          setHasLocationConsent(true);
          setLocationModalOpen(false);
        }
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const activeTrip = useMemo(() => {
    if (liveState?.activeTripId) {
      const match = trips.find((t) => t.id === liveState.activeTripId);
      if (match) return match;
    }
    return (
      trips.find(
        (t) =>
          t.status === 'travelling' ||
          t.status === 'route_deviation' ||
          t.status === 'sos_alert'
      ) || null
    );
  }, [trips, liveState?.activeTripId]);

  const pendingIncomingCount = useMemo(
    () => incomingLinks.filter((l) => l.status === 'pending').length,
    [incomingLinks]
  );

  const unreadAlertCount = useMemo(
    () => alerts.filter((a) => !a.isRead).length,
    [alerts]
  );

  const pendingAdminApprovalsCount = useMemo(
    () =>
      allPlatformUsers.filter(
        (u) => !isUserProfileActive(u) && u.subscriptionStatus !== 'revoked'
      ).length,
    [allPlatformUsers]
  );

  const quotaBanner = mapsQuotaExceeded ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  if (!authReady || (firebaseUser && accountsLoading)) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-700 text-white flex items-center justify-center mx-auto">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-stone-600">
            Loading SafeReach...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        {quotaBanner}
        <AuthOnboarding
          mode="signin"
          isSubmitting={authSubmitting}
          error={authError}
          onEmailLogin={handleEmailLogin}
          onEmailSignUp={handleEmailSignUp}
          onGoogleRegisterWithDetails={handleGoogleRegisterWithDetails}
          onCompleteRegistration={(data) => handleCreateAccount(data, true)}
          onSignOut={() => void handleSignOut()}
          onClearError={() => setAuthError(null)}
        />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        {quotaBanner}
        <AuthOnboarding
          mode="register"
          defaultName={firebaseUser.displayName || ''}
          email={firebaseUser.email || ''}
          isSubmitting={authSubmitting}
          error={authError}
          onEmailLogin={handleEmailLogin}
          onEmailSignUp={handleEmailSignUp}
          onGoogleRegisterWithDetails={handleGoogleRegisterWithDetails}
          onCompleteRegistration={(data) =>
            handleCreateAccount(data, accounts.length === 0)
          }
          onSignOut={() => void handleSignOut()}
          onClearError={() => setAuthError(null)}
        />
      </>
    );
  }

  const privateInfo = privateInfoByUid[profile.uid] || null;
  const activeEmail = privateInfo?.email || firebaseUser.email || '';
  const profileHasActiveSubscription = isUserProfileActive(profile);
  const canUseWorkspace = isAdminUser || profileHasActiveSubscription;

  const handleCopyGateId = async () => {
    try {
      await navigator.clipboard.writeText(profile.safeReachId);
      setCopiedGateId(true);
      window.setTimeout(() => setCopiedGateId(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    mobileLabel: string;
    badgeCount?: number;
    Icon: React.ComponentType<{className?: string}>;
  }> = [
    {
      id: 'give_access',
      label:
        pendingIncomingCount > 0
          ? `Give Access (${pendingIncomingCount})`
          : 'Give Access',
      mobileLabel: 'Give Access',
      badgeCount: pendingIncomingCount,
      Icon: Navigation,
    },
    {
      id: 'track',
      label: unreadAlertCount > 0 ? `Track (${unreadAlertCount})` : 'Track',
      mobileLabel: 'Track',
      badgeCount: unreadAlertCount,
      Icon: Users,
    },
    {
      id: 'accounts',
      label: `Accounts (${accounts.length})`,
      mobileLabel: 'Accounts',
      Icon: UserPlus,
    },
    {
      id: 'history',
      label: 'History',
      mobileLabel: 'History',
      Icon: Clock,
    },
    ...(isAdminUser
      ? [
          {
            id: 'admin' as ActiveTab,
            label:
              pendingAdminApprovalsCount > 0
                ? `Admin Portal (${pendingAdminApprovalsCount})`
                : 'Admin Portal',
            mobileLabel: 'Admin',
            badgeCount: pendingAdminApprovalsCount,
            Icon: KeyRound,
          },
        ]
      : []),
  ];

  const isGatedTab =
    !canUseWorkspace &&
    (activeTab === 'give_access' ||
      activeTab === 'track' ||
      activeTab === 'history');

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col pb-20 lg:pb-8">
      {quotaBanner}

      {/* Top Bar Contract: Zone 1 Brand — Zone 2 Concise Links — Zone 3 Sign Out */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(isAdminUser ? 'admin' : 'give_access');
            }}
            className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-5 h-5 text-teal-700" />
            <span>SafeReach</span>
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'give_access' || item.id === 'track') {
                    setHasChosenMode(true);
                  }
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'border-teal-700 text-stone-900'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-xs font-medium text-stone-700 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-6 pt-5 sm:pt-6 space-y-5">
        {/* Two-Way Mode Selector & Account Bar */}
        <div className="max-w-6xl mx-auto bg-white border border-stone-200 rounded-2xl p-4 sm:px-5 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold text-stone-900 truncate">
              {profile.displayName}
            </span>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <span className="font-mono-tabular text-xs font-semibold text-teal-800">
              {profile.safeReachId}
            </span>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <span className="text-xs text-stone-500 truncate">
              {activeEmail}
            </span>
            {isAdminUser && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Admin Portal
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              Switch / Duplicate-Email Test ({accounts.length})
            </button>
          </div>

          <div
            role="group"
            aria-label="Choose SafeReach Behavior"
            className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl self-start md:self-auto"
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('give_access');
                setHasChosenMode(true);
              }}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'give_access'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-teal-700" />
              <span>Give Access to Location</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('track');
                setHasChosenMode(true);
              }}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'track'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-teal-700" />
              <span>Track Location</span>
            </button>
          </div>
        </div>

        {/* Unverified Admin Email Banner (protects Admin Portal from unverified email spoofing) */}
        {isAdminEmail(firebaseUser.email) && !firebaseUser.emailVerified && (
          <div className="max-w-6xl mx-auto p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="font-semibold">
                Admin Email Verification Required ({ADMIN_EMAIL})
              </div>
              <div className="text-amber-800">
                Verify your email via the link sent to your inbox (or register
                with Google) to unlock the Admin Portal.
                {verificationNotice ? ` ${verificationNotice}` : ''}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleResendAdminVerification()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 text-amber-950 font-medium cursor-pointer"
              >
                Resend Verification Email
              </button>
              <button
                type="button"
                onClick={() => void handleReloadVerification()}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 text-white font-medium cursor-pointer"
              >
                I Verified My Email
              </button>
            </div>
          </div>
        )}

        {/* Admin Simulation Notice if viewing a revoked/pending test profile as Admin */}
        {isAdminUser &&
          !profileHasActiveSubscription &&
          activeTab !== 'admin' && (
            <div className="max-w-6xl mx-auto p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>
                Admin Notice: Profile{' '}
                <strong className="font-mono-tabular">
                  {profile.safeReachId}
                </strong>{' '}
                currently has subscription status{' '}
                <strong>{profile.subscriptionStatus || 'pending'}</strong>.
                Non-admin users with this status are blocked by the Subscription
                Gate.
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-amber-900 text-white text-xs font-medium whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                Open Admin Portal
              </button>
            </div>
          )}

        {/* Subscription & Access Gate for Non-Admin Users */}
        {isGatedTab ? (
          <div className="max-w-2xl mx-auto bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-stone-900">
                  {profile.subscriptionStatus === 'revoked'
                    ? 'Subscription Removed by Admin'
                    : 'Admin Subscription Approval Required'}
                </h1>
                <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                  {profile.subscriptionStatus === 'revoked'
                    ? 'Your SafeReach app access was paused or removed by the administrator. Send your Unique ID below to the Admin to restore access.'
                    : 'All SafeReach access and subscriptions are approved by the Admin using your 10-character Unique ID.'}
                </p>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-stone-500">
                  Your 10-Character Unique ID (No Phone Number Stored)
                </div>
                <div className="font-mono-tabular text-2xl font-bold tracking-wider text-stone-900 mt-0.5">
                  {profile.safeReachId}
                </div>
                {profile.subscriptionNote && (
                  <div className="text-xs text-stone-500 mt-1">
                    Status note: {profile.subscriptionNote}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyGateId()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                {copiedGateId ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied Unique ID</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Unique ID</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-xs text-stone-600 leading-relaxed border-t border-stone-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>
                Share this Unique ID with the SafeReach Admin ({ADMIN_EMAIL})
                to activate your subscription.
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('accounts')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium whitespace-nowrap cursor-pointer"
              >
                Manage Accounts
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Explicit Two-Way "Ask" Card when user hasn't picked a behavior yet */}
            {!hasChosenMode &&
              (activeTab === 'give_access' || activeTab === 'track') && (
                <div className="max-w-6xl mx-auto bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
                  <div>
                    <h1 className="font-display text-lg font-bold text-stone-900">
                      How would you like to use SafeReach right now?
                    </h1>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Choose whether you are sharing your own location with
                      family or tracking a loved one&apos;s 10-character Unique
                      ID.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('give_access');
                        setHasChosenMode(true);
                      }}
                      className="text-left p-4 rounded-2xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/40 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                        <Navigation className="w-4 h-4 text-teal-700" />
                        <span>01. Give Access to My Location</span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Share your Unique ID ({profile.safeReachId}), allow
                        device GPS access, approve family requests, and set an
                        automatic safe-arrival geofence.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('track');
                        setHasChosenMode(true);
                      }}
                      className="text-left p-4 rounded-2xl border border-stone-200 hover:border-teal-700 hover:bg-teal-50/40 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                        <Users className="w-4 h-4 text-teal-700" />
                        <span>02. Track a Family Member&apos;s Location</span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Enter someone&apos;s 10-character Unique ID to send a
                        connection request, view their live map, and receive
                        safe-arrival or SOS alerts.
                      </p>
                    </button>
                  </div>
                </div>
              )}

            {activeTab === 'give_access' && (
              <TravelerWorkspace
                key={profile.uid}
                profile={profile}
                authOwnerUid={firebaseUser.uid}
                privateInfo={privateInfo}
                liveState={liveState}
                activeTrip={activeTrip}
                incomingLinks={incomingLinks}
                hasLocationConsent={hasLocationConsent}
                onRequestLocationConsent={() => setLocationModalOpen(true)}
              />
            )}

            {activeTab === 'track' && (
              <FamilyDashboard
                key={profile.uid}
                profile={profile}
                authOwnerUid={firebaseUser.uid}
                outgoingLinks={outgoingLinks}
                alerts={alerts}
              />
            )}

            {activeTab === 'accounts' && (
              <div className="space-y-8">
                <TestAccountsPanel
                  googleEmail={firebaseUser.email || ''}
                  accounts={accounts}
                  activeAccountId={profile.uid}
                  privateInfoByUid={privateInfoByUid}
                  isSubmitting={authSubmitting}
                  error={authError}
                  onSelectAccount={handleSelectAccount}
                  onCreateTestAccount={(data) =>
                    handleCreateAccount(data, false)
                  }
                  onDeleteAccount={handleDeleteSingleAccount}
                  onDeleteAllAccounts={() => handleDeleteAllAccounts(accounts)}
                />
                <TrustedCirclePanel
                  key={profile.uid}
                  profile={profile}
                  authOwnerUid={firebaseUser.uid}
                  authEmail={firebaseUser.email || ''}
                  privateInfo={privateInfo}
                  incomingLinks={incomingLinks}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <LocationHistoryPanel
                key={profile.uid}
                uid={profile.uid}
                trips={trips}
                history={history}
              />
            )}

            {activeTab === 'admin' && isAdminUser && (
              <AdminPortal
                allUsers={allPlatformUsers}
                activeProfileUid={profile.uid}
                onDeleteAccount={handleDeleteSingleAccount}
                onDeleteAllAccounts={() =>
                  handleDeleteAllAccounts(allPlatformUsers)
                }
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200"
      >
        <div
          className={`grid h-15 items-center ${
            isAdminUser ? 'grid-cols-5' : 'grid-cols-4'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.Icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'give_access' || item.id === 'track') {
                    setHasChosenMode(true);
                  }
                }}
                className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isActive ? 'text-teal-700' : 'text-stone-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  {item.mobileLabel}
                </span>
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="absolute top-1.5 right-1/4 font-mono-tabular text-[10px] font-bold text-rose-700">
                    {item.badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <LocationPermissionModal
        isOpen={locationModalOpen}
        permissionError={locationPermError}
        onAllow={handleAllowLocation}
        onDismiss={() => setLocationModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {MAPS_API_KEY ? (
        <APIProvider
          apiKey={MAPS_API_KEY}
          libraries={['places', 'routes', 'marker', 'geometry']}
          language="en"
        >
          <SafeReachAppShell />
        </APIProvider>
      ) : (
        <SafeReachAppShell />
      )}
    </ErrorBoundary>
  );
}
