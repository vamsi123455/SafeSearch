import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
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
  createAccountId,
  deleteMultipleSafeReachAccounts,
  deleteSafeReachAccount,
  fetchWorkspaceSnapshot,
  getStoredSession,
  loginWithEmailPassword,
  registerSafeReachProfile,
  setStoredSession,
  signUpWithEmailPassword,
  subscribeToSafeReachSync,
} from './lib/safereachApi';
import {
  ADMIN_EMAIL,
  AuthSession,
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

function getSessionAccountKey(ownerUid: string): string {
  return `safereach_active_account_${ownerUid}`;
}

function SafeReachAppShell() {
  const [session, setSession] = useState<AuthSession | null>(() =>
    getStoredSession()
  );
  const [accountsLoading, setAccountsLoading] = useState<boolean>(() =>
    Boolean(getStoredSession())
  );

  const [accounts, setAccounts] = useState<UserProfile[]>([]);
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('give_access');
  const [hasChosenMode, setHasChosenMode] = useState(false);
  const [copiedGateId, setCopiedGateId] = useState(false);
  const initialTabSetRef = useRef(false);

  const [hasLocationConsent, setHasLocationConsent] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationPermError, setLocationPermError] = useState<string | null>(
    null
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const isAdminUser = useMemo(
    () => Boolean(session && isAdminEmail(session.email)),
    [session]
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

  const clearClientWorkspace = useCallback(() => {
    setAccounts([]);
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
  }, []);

  const refreshWorkspace = useCallback(
    async (overrideSession?: AuthSession | null, overrideAccountId?: string | null) => {
      const targetSession = overrideSession ?? session;
      if (!targetSession) {
        clearClientWorkspace();
        return;
      }

      const storedAccount = window.sessionStorage.getItem(
        getSessionAccountKey(targetSession.ownerUid)
      );
      const requestedAccountId =
        overrideAccountId !== undefined
          ? overrideAccountId
          : activeAccountId || storedAccount;

      try {
        const snap = await fetchWorkspaceSnapshot(
          targetSession.ownerUid,
          requestedAccountId,
          targetSession.email
        );

        if (snap.accounts.length === 0) {
          window.sessionStorage.removeItem(
            getSessionAccountKey(targetSession.ownerUid)
          );
          setStoredSession(null);
          setSession(null);
          clearClientWorkspace();
          return;
        }

        const resolved =
          (requestedAccountId &&
            snap.accounts.find((a) => a.uid === requestedAccountId)) ||
          snap.accounts[0];

        setAccounts(snap.accounts);
        setPrivateInfoByUid(snap.privateInfoByUid);
        setLiveState(snap.liveState);
        setTrips(snap.trips);
        setHistory(snap.history);
        setAllIncomingLinks(snap.allIncomingLinks);
        setAllOutgoingLinks(snap.allOutgoingLinks);
        setAllAlerts(snap.allAlerts);
        setAllPlatformUsers(snap.allPlatformUsers);

        if (resolved) {
          setActiveAccountId(resolved.uid);
          window.sessionStorage.setItem(
            getSessionAccountKey(targetSession.ownerUid),
            resolved.uid
          );

          if (!initialTabSetRef.current) {
            if (isAdminEmail(targetSession.email)) {
              setActiveTab('admin');
              setHasChosenMode(true);
            } else if (resolved.rolePreference === 'family') {
              setActiveTab('track');
              setHasChosenMode(true);
            } else if (resolved.rolePreference === 'traveler') {
              setActiveTab('give_access');
              setHasChosenMode(true);
            } else {
              setActiveTab('give_access');
              setHasChosenMode(false);
            }
            initialTabSetRef.current = true;
          }
        }
      } catch {
        // Keep current UI state on transient poll failures
      } finally {
        setAccountsLoading(false);
      }
    },
    [session, activeAccountId, clearClientWorkspace]
  );

  // Sync workspace snapshot on session/account changes and SSE/poll events
  useEffect(() => {
    if (!session) {
      clearClientWorkspace();
      return;
    }
    void refreshWorkspace(session, activeAccountId);
    const unsub = subscribeToSafeReachSync(() => {
      void refreshWorkspace(session, activeAccountId);
    });
    return () => unsub();
  }, [session, activeAccountId, refreshWorkspace, clearClientWorkspace]);

  const profile = useMemo(
    () => accounts.find((a) => a.uid === activeAccountId) || null,
    [accounts, activeAccountId]
  );

  const incomingLinks = useMemo(
    () => allIncomingLinks.filter((l) => l.travelerUid === activeAccountId),
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
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await loginWithEmailPassword(email.trim(), password);
      const firstAccount = res.accounts[0];
      if (!firstAccount) {
        throw new Error('No SafeReach account found. Please sign up first.');
      }
      setStoredSession(res.session);
      setAccountsLoading(true);
      setSession(res.session);
      applyPostAccountSelection(
        res.session.ownerUid,
        firstAccount.uid,
        firstAccount.rolePreference,
        isAdminEmail(res.session.email),
        true
      );
      await refreshWorkspace(res.session, firstAccount.uid);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Unable to log in with username/email and password.'
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmailSignUp = async (data: EmailSignupFormData) => {
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res = await signUpWithEmailPassword({
        displayName: data.displayName,
        email: data.email.trim(),
        password: data.password,
        rolePreference: data.rolePreference,
      });
      setStoredSession(res.session);
      setAccountsLoading(true);
      setSession(res.session);
      applyPostAccountSelection(
        res.session.ownerUid,
        res.accountId,
        data.rolePreference,
        isAdminEmail(res.session.email),
        true
      );
      await refreshWorkspace(res.session, res.accountId);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Unable to create your SafeReach account.'
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleCreateTestAccount = async (data: SignupFormData) => {
    if (!session) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const adminUser = isAdminEmail(session.email);
      const targetAccountId = createAccountId('acct');
      const result = await registerSafeReachProfile({
        accountId: targetAccountId,
        ownerUid: session.ownerUid,
        isAdminCaller: adminUser,
        ...data,
        email: data.email || session.email,
      });
      applyPostAccountSelection(
        session.ownerUid,
        result.accountId,
        data.rolePreference,
        adminUser,
        false
      );
      await refreshWorkspace(session, result.accountId);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Failed to create SafeReach account.'
      );
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSelectAccount = (
    accountId: string,
    preferredTab?: 'give_access' | 'track'
  ) => {
    if (!session) return;
    if (accountId !== activeAccountId) {
      setLiveState(null);
      setTrips([]);
      setHistory([]);
    }
    setActiveAccountId(accountId);
    window.sessionStorage.setItem(
      getSessionAccountKey(session.ownerUid),
      accountId
    );
    if (preferredTab) {
      setActiveTab(preferredTab);
      setHasChosenMode(true);
    }
  };

  const handleSignOut = () => {
    if (session) {
      window.sessionStorage.removeItem(getSessionAccountKey(session.ownerUid));
    }
    setStoredSession(null);
    setSession(null);
    clearClientWorkspace();
  };

  const handleDeleteSingleAccount = async (target: UserProfile) => {
    if (!session) return;
    await deleteSafeReachAccount(target, session.ownerUid, isAdminUser);
    const remaining = accounts.filter((a) => a.uid !== target.uid);
    if (remaining.length === 0 && target.ownerUid === session.ownerUid) {
      handleSignOut();
      return;
    }
    if (target.uid === activeAccountId && remaining.length > 0) {
      const next = remaining[0];
      setActiveAccountId(next.uid);
      window.sessionStorage.setItem(
        getSessionAccountKey(session.ownerUid),
        next.uid
      );
      await refreshWorkspace(session, next.uid);
    } else {
      await refreshWorkspace(session, activeAccountId);
    }
  };

  const handleDeleteAllAccounts = async (targetList: UserProfile[]) => {
    if (!session) return;
    await deleteMultipleSafeReachAccounts(
      targetList,
      session.ownerUid,
      isAdminUser
    );
    handleSignOut();
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

  if (session && accountsLoading) {
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

  if (!session || !profile) {
    return (
      <>
        {quotaBanner}
        <AuthOnboarding
          isSubmitting={authSubmitting}
          error={authError}
          onEmailLogin={handleEmailLogin}
          onEmailSignUp={handleEmailSignUp}
          onClearError={() => setAuthError(null)}
        />
      </>
    );
  }

  const privateInfo = privateInfoByUid[profile.uid] || null;
  const activeEmail = privateInfo?.email || session.email || '';
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
              onClick={handleSignOut}
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
                authOwnerUid={session.ownerUid}
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
                authOwnerUid={session.ownerUid}
                outgoingLinks={outgoingLinks}
                alerts={alerts}
              />
            )}

            {activeTab === 'accounts' && (
              <div className="space-y-8">
                <TestAccountsPanel
                  googleEmail={session.email}
                  accounts={accounts}
                  activeAccountId={profile.uid}
                  privateInfoByUid={privateInfoByUid}
                  isSubmitting={authSubmitting}
                  error={authError}
                  onSelectAccount={handleSelectAccount}
                  onCreateTestAccount={handleCreateTestAccount}
                  onDeleteAccount={handleDeleteSingleAccount}
                  onDeleteAllAccounts={() => handleDeleteAllAccounts(accounts)}
                />
                <TrustedCirclePanel
                  key={profile.uid}
                  profile={profile}
                  authOwnerUid={session.ownerUid}
                  authEmail={session.email}
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
