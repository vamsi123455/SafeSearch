import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  MapPin,
  Navigation,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import {
  formatDistance,
  formatRelativeAge,
  formatTimeShort,
  formatTimeWithSeconds,
} from '../../lib/geofence';
import {
  fetchApprovedTravelerLive,
  lookupDirectoryBySafeReachId,
  markAlertRead,
  removeFamilyLink,
  sendFamilyLinkRequest,
  subscribeToSafeReachSync,
} from '../../lib/safereachApi';
import {
  FamilyAlert,
  FamilyLink,
  JourneyStatus,
  LatLngPoint,
  LiveLocationState,
  SAFE_REACH_LIMITS,
  Trip,
  UserProfile,
} from '../../types/safereach';
import {SafeReachMap} from '../maps/SafeReachMap';
import {StatusIndicator} from '../StatusIndicator';

interface FamilyDashboardProps {
  profile: UserProfile;
  authOwnerUid: string;
  outgoingLinks: FamilyLink[];
  alerts: FamilyAlert[];
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function FamilyDashboard({
  profile,
  authOwnerUid,
  outgoingLinks,
  alerts,
}: FamilyDashboardProps) {
  const [safeReachIdInput, setSafeReachIdInput] = useState('');
  const [relationshipInput, setRelationshipInput] = useState('Mother');
  const [linkStatusMsg, setLinkStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const [liveMapByUid, setLiveMapByUid] = useState<
    Record<string, LiveLocationState>
  >({});
  const [tripByUid, setTripByUid] = useState<Record<string, Trip | null>>({});
  const [selectedTravelerUid, setSelectedTravelerUid] = useState<string | null>(
    null
  );
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const approvedLinks = useMemo(
    () => outgoingLinks.filter((l) => l.status === 'approved'),
    [outgoingLinks]
  );

  // Periodic 1-second tick to keep live relative timestamps accurate second-to-second
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-select first approved family member
  useEffect(() => {
    if (
      approvedLinks.length > 0 &&
      (!selectedTravelerUid ||
        !approvedLinks.some((l) => l.travelerUid === selectedTravelerUid))
    ) {
      setSelectedTravelerUid(approvedLinks[0].travelerUid);
    } else if (approvedLinks.length === 0) {
      setSelectedTravelerUid(null);
    }
  }, [approvedLinks, selectedTravelerUid]);

  const refreshInFlightRef = React.useRef(false);

  const refreshApprovedTravelers = useCallback(async () => {
    if (approvedLinks.length === 0) {
      setLiveMapByUid({});
      setTripByUid({});
      return;
    }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const entries = await Promise.all(
        approvedLinks.map(async (link) => {
          try {
            const res = await fetchApprovedTravelerLive(
              link.travelerUid,
              profile.uid
            );
            return [link.travelerUid, res] as const;
          } catch {
            return [link.travelerUid, null] as const;
          }
        })
      );

      setLiveMapByUid((prev) => {
        const next: Record<string, LiveLocationState> = {};
        for (const [uid, res] of entries) {
          if (res?.live) {
            next[uid] = res.live;
          } else if (prev[uid]) {
            next[uid] = prev[uid];
          }
        }
        return next;
      });

      setTripByUid(() => {
        const next: Record<string, Trip | null> = {};
        for (const [uid, res] of entries) {
          next[uid] = res?.activeTrip ?? null;
        }
        return next;
      });
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [approvedLinks, profile.uid]);

  useEffect(() => {
    void refreshApprovedTravelers();
    const unsub = subscribeToSafeReachSync(() => {
      void refreshApprovedTravelers();
    }, 1000);
    const liveTickId = window.setInterval(() => {
      if (approvedLinks.length > 0) {
        void refreshApprovedTravelers();
      }
    }, 1000);
    return () => {
      unsub();
      window.clearInterval(liveTickId);
    };
  }, [refreshApprovedTravelers, approvedLinks.length]);

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkStatusMsg(null);
    setIsLinking(true);

    try {
      const entry = await lookupDirectoryBySafeReachId(safeReachIdInput);
      if (!entry) {
        setLinkStatusMsg({
          type: 'error',
          text: `No SafeReach account found for Unique ID "${safeReachIdInput.trim()}". Note that 10-character Unique IDs are case-sensitive.`,
        });
        return;
      }

      await sendFamilyLinkRequest({
        traveler: entry,
        familyUid: profile.uid,
        familyOwnerUid: profile.ownerUid || authOwnerUid,
        familyName: profile.displayName,
        relationship: relationshipInput,
      });

      setSafeReachIdInput('');
      setLinkStatusMsg({
        type: 'success',
        text: `Request sent to ${entry.displayName}. Location will appear only after they approve your request.`,
      });
    } catch (err) {
      setLinkStatusMsg({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Could not send family link request.',
      });
    } finally {
      setIsLinking(false);
    }
  };

  const getEffectiveStatus = (
    live: LiveLocationState | undefined
  ): JourneyStatus => {
    if (!live || !live.isSharingEnabled) return 'idle';
    if (
      live.status === 'travelling' &&
      live.updatedAt &&
      nowMs - live.updatedAt.toMillis() > STALE_THRESHOLD_MS
    ) {
      return 'signal_stale';
    }
    return live.status;
  };

  const selectedLive = selectedTravelerUid
    ? liveMapByUid[selectedTravelerUid]
    : undefined;
  const selectedTrip = selectedTravelerUid
    ? tripByUid[selectedTravelerUid]
    : undefined;
  const selectedLink = approvedLinks.find(
    (l) => l.travelerUid === selectedTravelerUid
  );
  const selectedEffectiveStatus = getEffectiveStatus(selectedLive);

  const selectedPosition: LatLngPoint | null =
    selectedLive && (selectedLive.lat !== 0 || selectedLive.lng !== 0)
      ? {lat: selectedLive.lat, lng: selectedLive.lng}
      : null;
  const selectedDestPosition: LatLngPoint | null =
    selectedLive &&
    selectedLive.destinationName &&
    (selectedLive.destinationLat !== 0 || selectedLive.destinationLng !== 0)
      ? {lat: selectedLive.destinationLat, lng: selectedLive.destinationLng}
      : null;

  const unreadAlerts = alerts.filter((a) => !a.isRead);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Alerts Banner if urgent or unread notifications exist */}
      {unreadAlerts.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-stone-900">
            <Bell className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-sm font-semibold">
              Recent Family Safety Updates ({unreadAlerts.length})
            </h2>
          </div>
          <div className="divide-y divide-stone-100">
            {unreadAlerts.slice(0, 5).map((alert) => {
              const created = alert.createdAt ? alert.createdAt.toDate() : null;
              return (
                <div
                  key={alert.id}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {alert.type === 'sos_alert' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : alert.type === 'route_deviation' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Navigation className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-900">
                        {alert.message}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {alert.locationLabel} ·{' '}
                        {created ? formatTimeShort(created) : 'Just now'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markAlertRead(alert.id)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium self-start sm:self-auto whitespace-nowrap flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Acknowledge</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Family Cards + Link by ID */}
        <div className="lg:col-span-5 space-y-5">
          {/* Add Family Member Form */}
          <form
            onSubmit={handleRequestLink}
            className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3.5"
          >
            <div className="flex items-center gap-2 text-stone-900">
              <UserPlus className="w-4 h-4 text-teal-700" />
              <h2 className="font-display text-base font-semibold">
                Track a Family Member by SafeReach ID
              </h2>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Enter their 10-character case-sensitive Unique ID (e.g.
              aB9$kP2@mQ). They must approve your request in Give Access mode
              before their location becomes visible.
            </p>

            {linkStatusMsg && (
              <div
                className={`p-3 rounded-xl text-xs leading-relaxed border ${
                  linkStatusMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {linkStatusMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                maxLength={10}
                value={safeReachIdInput}
                onChange={(e) => setSafeReachIdInput(e.target.value)}
                placeholder="10-char Unique ID"
                aria-label="SafeReach 10-Character Unique ID"
                className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm font-mono-tabular text-stone-900 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
              />
              <input
                type="text"
                required
                maxLength={SAFE_REACH_LIMITS.RELATIONSHIP_MAX}
                value={relationshipInput}
                onChange={(e) => setRelationshipInput(e.target.value)}
                placeholder="Your role (e.g. Mother)"
                aria-label="Your relationship"
                className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
              />
            </div>

            <button
              type="submit"
              disabled={isLinking || !safeReachIdInput.trim()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {isLinking ? 'Sending Request...' : 'Request Location Access'}
            </button>
          </form>

          {/* Authorized Family Member Cards */}
          <div className="space-y-3">
            {outgoingLinks.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-2">
                <MapPin className="w-7 h-7 text-stone-300 mx-auto" />
                <div className="text-sm font-medium text-stone-800">
                  No family connections yet
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Ask your family member for their SafeReach ID from their Give
                  Access screen and send a tracking request above.
                </p>
              </div>
            ) : (
              outgoingLinks.map((link) => {
                if (link.status !== 'approved') {
                  return (
                    <div
                      key={link.id}
                      className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-stone-900">
                          {link.travelerName}
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          <span className="font-mono-tabular">
                            {link.travelerSafeReachId}
                          </span>{' '}
                          ·{' '}
                          {link.status === 'pending'
                            ? 'Awaiting traveler approval'
                            : 'Access revoked by traveler'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeFamilyLink(link)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  );
                }

                const live = liveMapByUid[link.travelerUid];
                const effectiveStatus = getEffectiveStatus(live);
                const updatedDate = live?.updatedAt
                  ? live.updatedAt.toDate()
                  : null;
                const isSelected = selectedTravelerUid === link.travelerUid;

                return (
                  <div
                    key={link.id}
                    className={`bg-white rounded-2xl p-5 space-y-4 transition-colors ${
                      isSelected
                        ? 'border-2 border-teal-700 shadow-sm'
                        : 'border border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-stone-500">
                          Family Member ·{' '}
                          <span className="font-mono-tabular">
                            {link.travelerSafeReachId}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-stone-900 mt-0.5">
                          {link.travelerName}
                        </h3>
                      </div>
                      <StatusIndicator status={effectiveStatus} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-stone-100 pt-3">
                      <div>
                        <div className="text-stone-500">Current Location</div>
                        <div className="text-sm font-medium text-stone-900 mt-0.5">
                          {live?.isSharingEnabled
                            ? live.locationLabel || 'Location active'
                            : 'Location sharing paused'}
                        </div>
                        {live?.isSharingEnabled && (
                          <div className="font-mono-tabular text-[11px] text-stone-500 mt-0.5">
                            {live.lat.toFixed(5)}, {live.lng.toFixed(5)}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-stone-500">Destination</div>
                        <div className="text-sm font-medium text-stone-900 mt-0.5">
                          {live?.destinationName || 'No active destination'}
                        </div>
                        {live?.destinationName && (
                          <div className="font-mono-tabular text-[11px] text-stone-500 mt-0.5">
                            {effectiveStatus === 'reached_safely'
                              ? 'Inside arrival geofence'
                              : `${formatDistance(
                                  live.distanceToDestinationMeters
                                )} remaining`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
                      <div className="flex items-center gap-1.5 text-xs text-stone-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          Last Updated:{' '}
                          {updatedDate
                            ? `${formatTimeWithSeconds(
                                updatedDate
                              )} (${formatRelativeAge(updatedDate, nowMs)})`
                            : 'Waiting'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTravelerUid(link.travelerUid);
                          setFocusTrigger((n) => n + 1);
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
                      >
                        {effectiveStatus === 'travelling'
                          ? 'View Live Location'
                          : 'View on Map'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Live Family Map (Satellite Form + 1-Second Live Tracking) */}
        <div className="lg:col-span-7 h-[420px] lg:h-[640px]">
          {selectedLink && selectedPosition ? (
            <SafeReachMap
              center={selectedPosition}
              travelerPosition={selectedPosition}
              travelerLabel={`${selectedLink.travelerName} (${selectedLink.travelerSafeReachId})`}
              travelerStatus={selectedEffectiveStatus}
              travelerUpdatedLabel={
                selectedLive?.updatedAt
                  ? formatTimeWithSeconds(selectedLive.updatedAt.toDate())
                  : undefined
              }
              destinationPosition={selectedDestPosition}
              destinationLabel={selectedLive?.destinationName}
              geofenceRadiusMeters={selectedLive?.geofenceRadiusMeters || 300}
              expectedEncodedPolyline={
                selectedTrip?.expectedEncodedPolyline || ''
              }
              actualEncodedPolyline={selectedTrip?.actualEncodedPolyline || ''}
              allowTapToPickDestination={false}
              focusTrigger={focusTrigger}
              followTraveler={true}
              defaultMapType="hybrid"
            />
          ) : (
            <div className="w-full h-full min-h-[340px] bg-white border border-stone-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
              <MapPin className="w-9 h-9 text-stone-300 mb-3" />
              <h3 className="font-display text-base font-semibold text-stone-800">
                Select an authorized family member
              </h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm leading-relaxed">
                Once a family member approves your request and gives access to
                their location, their live pin, expected route, and destination
                geofence appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
