import React, {useState} from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Navigation,
  Plus,
  Users,
  UserCheck,
  ShieldCheck,
  Lock,
  Trash2,
} from 'lucide-react';
import {
  isUserProfileActive,
  PrivateUserInfo,
  RolePreference,
  SAFE_REACH_LIMITS,
  UserProfile,
} from '../../types/safereach';

interface TestAccountsPanelProps {
  googleEmail: string;
  accounts: UserProfile[];
  activeAccountId: string | null;
  privateInfoByUid: Record<string, PrivateUserInfo>;
  isSubmitting: boolean;
  error: string | null;
  onSelectAccount: (
    accountId: string,
    preferredTab?: 'give_access' | 'track'
  ) => void;
  onCreateTestAccount: (data: {
    displayName: string;
    email: string;
    emergencyContactName: string;
    rolePreference: RolePreference;
    defaultGeofenceRadiusMeters: number;
  }) => Promise<void>;
  onDeleteAccount: (account: UserProfile) => Promise<void>;
  onDeleteAllAccounts: () => Promise<void>;
}

export function TestAccountsPanel({
  googleEmail,
  accounts,
  activeAccountId,
  privateInfoByUid,
  isSubmitting,
  error,
  onSelectAccount,
  onCreateTestAccount,
  onDeleteAccount,
  onDeleteAllAccounts,
}: TestAccountsPanelProps) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(googleEmail || '');
  const [behavior, setBehavior] = useState<'traveler' | 'family'>('family');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleCopy = async (srId: string) => {
    try {
      await navigator.clipboard.writeText(srId);
      setCopiedId(srId);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !email.trim()) return;
    await onCreateTestAccount({
      displayName: displayName
        .trim()
        .slice(0, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX),
      email: email.trim().slice(0, SAFE_REACH_LIMITS.EMAIL_MAX),
      emergencyContactName: emergencyContactName
        .trim()
        .slice(0, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX),
      rolePreference: behavior,
      defaultGeofenceRadiusMeters: 300,
    });
    setDisplayName('');
    setEmergencyContactName('');
  };

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Existing Accounts Under This Session (Duplicate Email Supported) */}
      <div className="lg:col-span-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Your SafeReach Accounts ({accounts.length})
            </h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Switch between accounts in this tab, or remove currently signed-in
              accounts to start fresh.
            </p>
          </div>

          {accounts.length > 0 && (
            <div className="shrink-0">
              {!confirmRemoveAll ? (
                <button
                  type="button"
                  disabled={deletingAll || isSubmitting}
                  onClick={() => setConfirmRemoveAll(true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-xs font-medium text-rose-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove All Accounts</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={async () => {
                      setDeletingAll(true);
                      try {
                        await onDeleteAllAccounts();
                      } finally {
                        setDeletingAll(false);
                        setConfirmRemoveAll(false);
                      }
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                  >
                    {deletingAll ? 'Removing...' : 'Confirm Remove All'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={() => setConfirmRemoveAll(false)}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-xs font-medium text-stone-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="divide-y divide-stone-100 border-t border-stone-100">
          {accounts.map((acc) => {
            const isActive = acc.uid === activeAccountId;
            const accEmail = privateInfoByUid[acc.uid]?.email || googleEmail;
            const roleText =
              acc.rolePreference === 'family'
                ? 'Track Location'
                : acc.rolePreference === 'traveler'
                ? 'Give Access to Location'
                : 'Both Modes';
            const subscribed = isUserProfileActive(acc);

            return (
              <div
                key={acc.uid}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900 truncate">
                      {acc.displayName}
                    </span>
                    {isActive && (
                      <span className="text-xs font-medium text-teal-700 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active in this tab
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-medium flex items-center gap-1 shrink-0 ${
                        subscribed
                          ? 'text-emerald-700'
                          : acc.subscriptionStatus === 'revoked'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {subscribed ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                      {subscribed
                        ? 'Subscription Active'
                        : acc.subscriptionStatus === 'revoked'
                        ? 'Access Removed'
                        : 'Pending Admin'}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono-tabular font-semibold text-stone-800">
                      {acc.safeReachId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{roleText}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{accEmail}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopy(acc.safeReachId)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-xs font-medium text-stone-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === acc.safeReachId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy ID</span>
                      </>
                    )}
                  </button>

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectAccount(
                          acc.uid,
                          acc.rolePreference === 'family'
                            ? 'track'
                            : 'give_access'
                        )
                      }
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Use Account</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={deletingUid === acc.uid || deletingAll}
                    onClick={async () => {
                      setDeletingUid(acc.uid);
                      try {
                        await onDeleteAccount(acc);
                      } finally {
                        setDeletingUid(null);
                      }
                    }}
                    aria-label={`Remove ${acc.displayName}`}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 disabled:opacity-60 text-rose-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingUid === acc.uid ? '...' : 'Remove'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Create & Sign In Second / Duplicate-Email Account */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-6 bg-white border border-stone-200 rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-stone-900">
          <Plus className="w-4 h-4 text-teal-700" />
          <h2 className="font-display text-lg font-semibold">
            Sign In / Add Duplicate-Email Account for Testing
          </h2>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Create another SafeReach profile using the same email address (
          <span className="font-medium text-stone-800">{googleEmail}</span>) or
          any test email. It generates a 10-character Unique ID (capitals,
          lowercase, numbers, and special symbols) without collecting any phone
          numbers.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div>
          <span className="block text-xs font-medium text-stone-700 mb-2">
            How should this account behave?
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setBehavior('traveler')}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                behavior === 'traveler'
                  ? 'border-teal-700 bg-teal-50/70'
                  : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Navigation className="w-4 h-4 text-teal-700" />
                <span>Give Access to Location</span>
              </div>
              <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                Traveler sharing live GPS, approving family, and reaching
                destinations.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setBehavior('family')}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                behavior === 'family'
                  ? 'border-teal-700 bg-teal-50/70'
                  : 'border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Users className="w-4 h-4 text-teal-700" />
                <span>Track Location</span>
              </div>
              <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                Family member entering a Unique ID and monitoring live maps.
              </p>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="test-acc-name"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              Account Name
            </label>
            <input
              id="test-acc-name"
              type="text"
              required
              maxLength={SAFE_REACH_LIMITS.DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                behavior === 'traveler'
                  ? 'e.g. Priya (Traveler)'
                  : 'e.g. Mom (Tracker)'
              }
              className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="test-acc-email"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              Email (Duplicate Allowed)
            </label>
            <input
              id="test-acc-email"
              type="email"
              required
              maxLength={SAFE_REACH_LIMITS.EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={googleEmail || 'tester@example.com'}
              className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="test-acc-ec-name"
            className="block text-xs font-medium text-stone-700 mb-1"
          >
            Trusted Contact Label (Optional, No Phone Required)
          </label>
          <input
            id="test-acc-ec-name"
            type="text"
            maxLength={SAFE_REACH_LIMITS.DISPLAY_NAME_MAX}
            value={emergencyContactName}
            onChange={(e) => setEmergencyContactName(e.target.value)}
            placeholder="e.g. Father"
            className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !displayName.trim() || !email.trim()}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          {isSubmitting
            ? 'Generating 10-Char Unique ID...'
            : 'Create & Sign In to Account'}
        </button>
      </form>
    </div>
  );
}
