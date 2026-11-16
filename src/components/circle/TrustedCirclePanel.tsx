import React, {useEffect, useState} from 'react';
import {
  Check,
  Copy,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  removeFamilyLink,
  respondToFamilyLink,
  updatePrivateSettings,
} from '../../lib/safereachApi';
import {
  FamilyLink,
  PrivateUserInfo,
  SAFE_REACH_LIMITS,
  UserProfile,
} from '../../types/safereach';

interface TrustedCirclePanelProps {
  profile: UserProfile;
  authOwnerUid: string;
  authEmail: string;
  privateInfo: PrivateUserInfo | null;
  incomingLinks: FamilyLink[];
}

export function TrustedCirclePanel({
  profile,
  authOwnerUid,
  authEmail,
  privateInfo,
  incomingLinks,
}: TrustedCirclePanelProps) {
  const [copied, setCopied] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [emergencyName, setEmergencyName] = useState(
    privateInfo?.emergencyContactName || ''
  );
  const [defaultRadius, setDefaultRadius] = useState(
    privateInfo?.defaultGeofenceRadiusMeters || 300
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  useEffect(() => {
    if (privateInfo) {
      setEmergencyName(privateInfo.emergencyContactName || '');
      setDefaultRadius(privateInfo.defaultGeofenceRadiusMeters || 300);
    }
  }, [privateInfo]);

  const pendingRequests = incomingLinks.filter((l) => l.status === 'pending');
  const approvedContacts = incomingLinks.filter((l) => l.status === 'approved');
  const revokedContacts = incomingLinks.filter((l) => l.status === 'revoked');

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.safeReachId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const handleRespond = async (
    link: FamilyLink,
    status: 'approved' | 'revoked'
  ) => {
    setBusyLinkId(link.id);
    try {
      await respondToFamilyLink(link, status);
    } finally {
      setBusyLinkId(null);
    }
  };

  const handleRemove = async (link: FamilyLink) => {
    setBusyLinkId(link.id);
    try {
      await removeFamilyLink(link);
    } finally {
      setBusyLinkId(null);
    }
  };

  const handleSavePrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      await updatePrivateSettings({
        uid: profile.uid,
        ownerUid: profile.ownerUid || authOwnerUid,
        email: privateInfo?.email || authEmail || 'user@safereach.app',
        emergencyContactName: emergencyName,
        defaultGeofenceRadiusMeters: defaultRadius,
      });
      setSettingsMessage('Trusted contact label and geofence preferences saved.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Your 10-Character Unique ID
            </h2>
            <p className="text-sm text-stone-600 mt-0.5">
              Share this case-sensitive Unique ID only with family members you
              trust or with the Admin for subscription access. No phone number
              is needed.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3">
            <div>
              <div className="text-xs text-stone-500">
                Unique Account ID (10 Characters)
              </div>
              <div className="font-mono-tabular text-2xl font-bold tracking-wider text-stone-900 mt-0.5">
                {profile.safeReachId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyId()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Pending Family Requests ({pendingRequests.length})
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Approve only people you recognize. Pending contacts cannot see
              your location.
            </p>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="py-5 text-sm text-stone-500 border-t border-stone-100">
              No pending family connection requests.
            </div>
          ) : (
            <div className="divide-y divide-stone-100 border-t border-stone-100">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-stone-900">
                      {req.familyName}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      Relationship: {req.relationship}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyLinkId === req.id}
                      onClick={() => void handleRespond(req, 'approved')}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyLinkId === req.id}
                      onClick={() => void handleRemove(req)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserX className="w-4 h-4" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-900">
              Authorized Family Members ({approvedContacts.length})
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Revoking access immediately blocks location and trip reads.
            </p>
          </div>

          {approvedContacts.length === 0 ? (
            <div className="py-5 text-sm text-stone-500 border-t border-stone-100">
              No authorized family contacts yet. Share your Unique ID{' '}
              <span className="font-mono-tabular font-semibold text-stone-800">
                {profile.safeReachId}
              </span>{' '}
              with a trusted relative so they can send a link request from Track
              Location mode.
            </div>
          ) : (
            <div className="divide-y divide-stone-100 border-t border-stone-100">
              {approvedContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="py-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-stone-900">
                      {contact.familyName}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1.5">
                      <span>{contact.relationship}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-medium">
                        Authorized
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyLinkId === contact.id}
                    onClick={() => void handleRespond(contact, 'revoked')}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800 text-stone-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Revoke Access
                  </button>
                </div>
              ))}
            </div>
          )}

          {revokedContacts.length > 0 && (
            <div className="pt-3 border-t border-stone-100 space-y-2">
              <div className="text-xs font-medium text-stone-500">
                Revoked Contacts
              </div>
              {revokedContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="py-2 flex items-center justify-between gap-3 text-xs text-stone-500"
                >
                  <span>
                    {contact.familyName} ({contact.relationship})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyLinkId === contact.id}
                      onClick={() => void handleRespond(contact, 'approved')}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium cursor-pointer"
                    >
                      Re-authorize
                    </button>
                    <button
                      type="button"
                      disabled={busyLinkId === contact.id}
                      onClick={() => void handleRemove(contact)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg text-stone-500 hover:text-rose-700 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 space-y-6">
        <form
          onSubmit={handleSavePrivate}
          className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-stone-900">
            <SlidersHorizontal className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-lg font-semibold">
              Privacy &amp; Geofence Preferences
            </h2>
          </div>
          <p className="text-xs text-stone-500 leading-relaxed">
            SafeReach does not ask for or store phone numbers. All safety alerts
            deliver directly inside authorized SafeReach family accounts.
          </p>

          {settingsMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {settingsMessage}
            </div>
          )}

          <div>
            <label
              htmlFor="priv-ec-name"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              Primary Trusted Contact Label
            </label>
            <input
              id="priv-ec-name"
              type="text"
              maxLength={SAFE_REACH_LIMITS.DISPLAY_NAME_MAX}
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="e.g. Mother"
              className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="priv-radius"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              Default Safe-Arrival Geofence Radius
            </label>
            <select
              id="priv-radius"
              value={defaultRadius}
              onChange={(e) => setDefaultRadius(Number(e.target.value))}
              className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
            >
              <option value={150}>150 m (High GPS precision)</option>
              <option value={300}>300 m (Balanced)</option>
              <option value={500}>500 m (Neighborhood)</option>
              <option value={1000}>1,000 m (Large campus / town)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {savingSettings ? 'Saving...' : 'Save Private Settings'}
          </button>
        </form>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-stone-900">
            <Lock className="w-4 h-4 text-teal-700" />
            <h3 className="font-display text-sm font-semibold">
              Privacy Guarantees
            </h3>
          </div>
          <ul className="text-xs text-stone-600 space-y-2 leading-relaxed">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Zero phone numbers are stored—preventing caller-ID or phone
                scraping leaks.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Your 10-character Unique ID cannot be queried in bulk or tracked
                without approval.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <span>
                Stopping location sharing pauses live tracking across all
                linked family dashboards.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
