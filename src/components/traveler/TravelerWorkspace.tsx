import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Navigation,
  Pause,
  Play,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  decodePolyline,
  distanceToPolylineMeters,
  encodePolyline,
  formatDistance,
  formatRelativeAge,
  formatTimeShort,
  haversineDistanceMeters,
} from '../../lib/geofence';
import {
  dispatchFamilyAlerts,
  removeFamilyLink,
  respondToFamilyLink,
  startJourney,
  stopLocationSharing,
  triggerSosAlert,
  updateLiveTelemetry,
} from '../../lib/safereachApi';
import {
  FamilyLink,
  JourneyStatus,
  LatLngPoint,
  LiveLocationState,
  PrivateUserInfo,
  TravelModeType,
  Trip,
  UserProfile,
} from '../../types/safereach';
import {
  DestinationAutocomplete,
  SelectedPlaceResult,
} from '../maps/DestinationAutocomplete';
import {SafeReachMap} from '../maps/SafeReachMap';
import {StatusIndicator} from '../StatusIndicator';

interface TravelerWorkspaceProps {
  profile: UserProfile;
  authOwnerUid: string;
  privateInfo: PrivateUserInfo | null;
  liveState: LiveLocationState | null;
  activeTrip: Trip | null;
  incomingLinks: FamilyLink[];
  hasLocationConsent: boolean;
  onRequestLocationConsent: () => void;
}

const DEFAULT_ORIGIN: LatLngPoint = {lat: 13.6288, lng: 79.4192};

function isQuotaMessage(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429')
  );
}

export function TravelerWorkspace({
  profile,
  authOwnerUid,
  privateInfo,
  liveState,
  activeTrip,
  incomingLinks,
  hasLocationConsent,
  onRequestLocationConsent,
}: TravelerWorkspaceProps) {
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const effectiveOwnerUid = profile.ownerUid || authOwnerUid;

  const [currentPoint, setCurrentPoint] = useState<LatLngPoint>(() =>
    liveState && (liveState.lat !== 0 || liveState.lng !== 0)
      ? {lat: liveState.lat, lng: liveState.lng}
      : DEFAULT_ORIGIN
  );
  const [currentLabel, setCurrentLabel] = useState<string>(
    liveState?.locationLabel || 'Tirupati, Andhra Pradesh'
  );
  const [accuracyMeters, setAccuracyMeters] = useState<number>(
    liveState?.accuracyMeters || 18
  );

  // Destination planner state
  const [destInput, setDestInput] = useState<string>(
    activeTrip?.destinationName || ''
  );
  const [destPoint, setDestPoint] = useState<LatLngPoint | null>(() =>
    activeTrip
      ? {lat: activeTrip.destinationLat, lng: activeTrip.destinationLng}
      : null
  );
  const [destName, setDestName] = useState<string>(
    activeTrip?.destinationName || ''
  );
  const [geofenceRadius, setGeofenceRadius] = useState<number>(
    activeTrip?.geofenceRadiusMeters ||
      privateInfo?.defaultGeofenceRadiusMeters ||
      300
  );
  const [travelMode, setTravelMode] = useState<TravelModeType>(
    activeTrip?.travelMode || 'DRIVING'
  );
  const [expectedPolyline, setExpectedPolyline] = useState<string>(
    activeTrip?.expectedEncodedPolyline || ''
  );
  const [routeEstimate, setRouteEstimate] = useState<{
    distanceMeters: number;
    durationMins: number;
  } | null>(null);

  const [isStartingTrip, setIsStartingTrip] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [isTriggeringSos, setIsTriggeringSos] = useState(false);
  const [simAutoPlaying, setSimAutoPlaying] = useState(false);
  const [simStepIndex, setSimStepIndex] = useState(0);
  const [showSimulator, setShowSimulator] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [copiedId, setCopiedId] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const trailRef = useRef<LatLngPoint[]>(
    activeTrip?.actualEncodedPolyline
      ? decodePolyline(activeTrip.actualEncodedPolyline)
      : []
  );
  const lastGeocodePointRef = useRef<LatLngPoint | null>(null);
  const lastGeocodeTimeRef = useRef<number>(0);
  const lastDbSyncTimeRef = useRef<number>(0);
  const arrivalDispatchedForTripRef = useRef<string | null>(null);
  const deviationDispatchedForTripRef = useRef<string | null>(null);
  const hasLiveFixRef = useRef<boolean>(
    Boolean(liveState && (liveState.lat !== 0 || liveState.lng !== 0))
  );

  const pendingLinks = useMemo(
    () => incomingLinks.filter((l) => l.status === 'pending'),
    [incomingLinks]
  );
  const approvedFamilyLinks = useMemo(
    () => incomingLinks.filter((l) => l.status === 'approved'),
    [incomingLinks]
  );

  // Reset per-account location ref when switching active profile
  useEffect(() => {
    hasLiveFixRef.current = Boolean(
      liveState && (liveState.lat !== 0 || liveState.lng !== 0)
    );
    if (liveState && (liveState.lat !== 0 || liveState.lng !== 0)) {
      setCurrentPoint({lat: liveState.lat, lng: liveState.lng});
      setCurrentLabel(liveState.locationLabel || 'Tirupati, Andhra Pradesh');
      setAccuracyMeters(liveState.accuracyMeters || 18);
    } else {
      setCurrentPoint(DEFAULT_ORIGIN);
      setCurrentLabel('Tirupati, Andhra Pradesh');
    }
  }, [profile.uid]);

  useEffect(() => {
    if (
      !hasLiveFixRef.current &&
      liveState &&
      (liveState.lat !== 0 || liveState.lng !== 0)
    ) {
      hasLiveFixRef.current = true;
      setCurrentPoint({lat: liveState.lat, lng: liveState.lng});
      if (liveState.locationLabel) {
        setCurrentLabel(liveState.locationLabel);
      }
      if (liveState.accuracyMeters) {
        setAccuracyMeters(liveState.accuracyMeters);
      }
    }
  }, [liveState]);

  // Sync local state when Firestore activeTrip updates
  useEffect(() => {
    if (activeTrip) {
      setDestName(activeTrip.destinationName);
      setDestInput(activeTrip.destinationName);
      setDestPoint({
        lat: activeTrip.destinationLat,
        lng: activeTrip.destinationLng,
      });
      setGeofenceRadius(activeTrip.geofenceRadiusMeters);
      setExpectedPolyline(activeTrip.expectedEncodedPolyline);
      trailRef.current = activeTrip.actualEncodedPolyline
        ? decodePolyline(activeTrip.actualEncodedPolyline)
        : [];
    }
  }, [activeTrip?.id, activeTrip?.status]);

  // Reverse-lookup human-readable landmark label via Places API (New) SearchNearby (throttled)
  const resolveNearbyLabel = useCallback(
    async (pt: LatLngPoint): Promise<string> => {
      if (!placesLib) {
        return `Near ${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`;
      }
      const now = Date.now();
      if (
        lastGeocodePointRef.current &&
        haversineDistanceMeters(lastGeocodePointRef.current, pt) < 150 &&
        now - lastGeocodeTimeRef.current < 25000
      ) {
        return currentLabel;
      }

      try {
        lastGeocodePointRef.current = pt;
        lastGeocodeTimeRef.current = now;
        const {Place, SearchNearbyRankPreference} = placesLib;
        const {places} = await Place.searchNearby({
          fields: ['displayName', 'formattedAddress'],
          locationRestriction: {center: pt, radius: 350},
          maxResultCount: 1,
          rankPreference: SearchNearbyRankPreference.DISTANCE,
        });
        if (places && places.length > 0 && places[0].displayName) {
          return `Near ${places[0].displayName}`;
        }
      } catch (err) {
        if (isQuotaMessage(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
      return `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`;
    },
    [placesLib, currentLabel]
  );

  // Compute expected route whenever origin/destination/mode changes while planning
  useEffect(() => {
    if (!routesLib || !destPoint || activeTrip?.status === 'travelling') return;

    let cancelled = false;
    const computePreviewRoute = async () => {
      try {
        const sdkMode =
          routesLib.TravelMode[
            travelMode as keyof typeof routesLib.TravelMode
          ] || routesLib.TravelMode.DRIVING;
        const response = await routesLib.Route.computeRoutes({
          origin: currentPoint,
          destination: destPoint,
          travelMode: sdkMode,
          fields: ['path', 'distanceMeters', 'durationMillis'],
        });

        if (cancelled) return;
        const primary = response?.routes?.[0];
        if (!primary) return;

        const pts: LatLngPoint[] = (primary.path || []).map((p) => ({
          lat: p.lat,
          lng: p.lng,
        }));
        if (pts.length >= 2) {
          setExpectedPolyline(encodePolyline(pts));
        } else {
          setExpectedPolyline(encodePolyline([currentPoint, destPoint]));
        }

        setRouteEstimate({
          distanceMeters:
            primary.distanceMeters ??
            haversineDistanceMeters(currentPoint, destPoint),
          durationMins: Math.max(
            1,
            Math.round((primary.durationMillis ?? 300000) / 60000)
          ),
        });
      } catch (err) {
        if (isQuotaMessage(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) {
          setExpectedPolyline(encodePolyline([currentPoint, destPoint]));
          setRouteEstimate({
            distanceMeters: haversineDistanceMeters(currentPoint, destPoint),
            durationMins: Math.max(
              1,
              Math.round(haversineDistanceMeters(currentPoint, destPoint) / 400)
            ),
          });
        }
      }
    };

    void computePreviewRoute();
    return () => {
      cancelled = true;
    };
  }, [
    routesLib,
    destPoint?.lat,
    destPoint?.lng,
    travelMode,
    activeTrip?.status,
  ]);

  // Core telemetry processor: updates distance, checks geofence safe arrival & route deviation
  const processLocationUpdate = useCallback(
    async (
      pt: LatLngPoint,
      accuracy: number,
      forceSync = false,
      overrideLabel?: string
    ) => {
      hasLiveFixRef.current = true;
      setCurrentPoint(pt);
      setAccuracyMeters(accuracy);

      const now = Date.now();
      if (!forceSync && now - lastDbSyncTimeRef.current < 4000) {
        return;
      }
      lastDbSyncTimeRef.current = now;

      const label = overrideLabel || (await resolveNearbyLabel(pt));
      setCurrentLabel(label);

      const hasActiveTrip =
        activeTrip &&
        (activeTrip.status === 'travelling' ||
          activeTrip.status === 'route_deviation' ||
          activeTrip.status === 'sos_alert');

      if (!profile.isSharingEnabled && !hasActiveTrip) {
        return;
      }

      let nextStatus: JourneyStatus = liveState?.status || 'travelling';
      let nextTripStatus = activeTrip?.status;
      let distToDest = 0;
      let deviationMeters = 0;
      let arrivedAtMs = activeTrip?.arrivedAtMs || 0;

      if (hasActiveTrip && activeTrip) {
        const dest: LatLngPoint = {
          lat: activeTrip.destinationLat,
          lng: activeTrip.destinationLng,
        };
        distToDest = haversineDistanceMeters(pt, dest);

        const lastTrail = trailRef.current[trailRef.current.length - 1];
        if (!lastTrail || haversineDistanceMeters(lastTrail, pt) >= 15) {
          trailRef.current = [...trailRef.current.slice(-120), pt];
        }

        const plannedPath = decodePolyline(activeTrip.expectedEncodedPolyline);
        if (plannedPath.length >= 2) {
          deviationMeters = distanceToPolylineMeters(pt, plannedPath);
        }

        // Automatic Geofenced Safe Arrival
        if (distToDest <= activeTrip.geofenceRadiusMeters) {
          nextStatus = 'reached_safely';
          nextTripStatus = 'reached_safely';
          arrivedAtMs = Date.now();
          setSimAutoPlaying(false);

          if (arrivalDispatchedForTripRef.current !== activeTrip.id) {
            arrivalDispatchedForTripRef.current = activeTrip.id;
            await dispatchFamilyAlerts({
              travelerUid: profile.uid,
              travelerOwnerUid: effectiveOwnerUid,
              travelerName: profile.displayName,
              approvedFamilyLinks,
              type: 'reached_safely',
              message: `${profile.displayName} reached ${activeTrip.destinationName} safely.`,
              locationLabel: label,
              lat: pt.lat,
              lng: pt.lng,
            });
          }
        } else if (deviationMeters > 350 && nextStatus !== 'sos_alert') {
          nextStatus = 'route_deviation';
          nextTripStatus = 'route_deviation';
          if (deviationDispatchedForTripRef.current !== activeTrip.id) {
            deviationDispatchedForTripRef.current = activeTrip.id;
            await dispatchFamilyAlerts({
              travelerUid: profile.uid,
              travelerOwnerUid: effectiveOwnerUid,
              travelerName: profile.displayName,
              approvedFamilyLinks,
              type: 'route_deviation',
              message: `Route deviation detected for ${
                profile.displayName
              } (${Math.round(deviationMeters)}m off expected path to ${
                activeTrip.destinationName
              }).`,
              locationLabel: label,
              lat: pt.lat,
              lng: pt.lng,
            });
          }
        } else if (nextStatus !== 'sos_alert') {
          nextStatus = 'travelling';
          nextTripStatus = 'travelling';
        }

        await updateLiveTelemetry({
          uid: profile.uid,
          ownerUid: effectiveOwnerUid,
          point: pt,
          accuracyMeters: accuracy,
          locationLabel: label,
          status: nextStatus,
          isSharingEnabled: true,
          activeTripId: activeTrip.id,
          destinationName: activeTrip.destinationName,
          destinationPoint: dest,
          geofenceRadiusMeters: activeTrip.geofenceRadiusMeters,
          distanceToDestinationMeters: distToDest,
          routeDeviationMeters: deviationMeters,
          actualEncodedPolyline: encodePolyline(trailRef.current),
          tripStatus: nextTripStatus,
          maxDeviationMeters: Math.max(
            activeTrip.maxDeviationMeters || 0,
            deviationMeters
          ),
          arrivedAtMs,
          recordHistory:
            nextStatus === 'reached_safely' ||
            nextStatus === 'route_deviation' ||
            forceSync,
        });
      } else if (profile.isSharingEnabled) {
        await updateLiveTelemetry({
          uid: profile.uid,
          ownerUid: effectiveOwnerUid,
          point: pt,
          accuracyMeters: accuracy,
          locationLabel: label,
          status: nextStatus === 'sos_alert' ? 'sos_alert' : 'travelling',
          isSharingEnabled: true,
          activeTripId: '',
          destinationName: '',
          destinationPoint: {lat: 0, lng: 0},
          geofenceRadiusMeters: geofenceRadius,
          distanceToDestinationMeters: 0,
          routeDeviationMeters: 0,
          recordHistory: forceSync,
        });
      }
    },
    [
      activeTrip,
      approvedFamilyLinks,
      effectiveOwnerUid,
      geofenceRadius,
      liveState?.status,
      profile.displayName,
      profile.isSharingEnabled,
      profile.uid,
      resolveNearbyLabel,
    ]
  );

  // Watch device GPS when location consent is granted
  useEffect(() => {
    if (!hasLocationConsent || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsWarning(null);
        const pt = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        if (!simAutoPlaying) {
          void processLocationUpdate(pt, pos.coords.accuracy || 20, false);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsWarning(
            'Browser location access was blocked. Allow location in browser settings or use the Journey Test Simulator below.'
          );
        } else {
          setGpsWarning(
            'Live GPS signal is temporarily unavailable on this device. You can still test routes with the Journey Simulator.'
          );
        }
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 15000}
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [hasLocationConsent, simAutoPlaying, processLocationUpdate]);

  // Journey Simulator playback timer
  const simPathPoints = useMemo(() => {
    if (!activeTrip) return [];
    const decoded = decodePolyline(activeTrip.expectedEncodedPolyline);
    if (decoded.length >= 2) return decoded;
    return [
      {lat: activeTrip.originLat, lng: activeTrip.originLng},
      {lat: activeTrip.destinationLat, lng: activeTrip.destinationLng},
    ];
  }, [activeTrip]);

  useEffect(() => {
    if (!simAutoPlaying || simPathPoints.length === 0 || !activeTrip) return;
    if (activeTrip.status === 'reached_safely') {
      setSimAutoPlaying(false);
      return;
    }

    const interval = window.setInterval(() => {
      setSimStepIndex((prev) => {
        const stride = Math.max(1, Math.floor(simPathPoints.length / 8));
        const nextIdx = Math.min(simPathPoints.length - 1, prev + stride);
        const pt = simPathPoints[nextIdx];
        const isLast = nextIdx >= simPathPoints.length - 1;
        void processLocationUpdate(
          pt,
          12,
          true,
          isLast ? activeTrip.destinationName : undefined
        );
        if (isLast) {
          setSimAutoPlaying(false);
        }
        return nextIdx;
      });
    }, 1800);

    return () => window.clearInterval(interval);
  }, [simAutoPlaying, simPathPoints, activeTrip, processLocationUpdate]);

  const handleCopySafeReachId = async () => {
    try {
      await navigator.clipboard.writeText(profile.safeReachId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleRespondLink = async (
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

  const handleDeclineLink = async (link: FamilyLink) => {
    setBusyLinkId(link.id);
    try {
      await removeFamilyLink(link);
    } finally {
      setBusyLinkId(null);
    }
  };

  const handlePlaceSelect = (place: SelectedPlaceResult) => {
    setDestName(place.name);
    setDestInput(place.name);
    setDestPoint(place.location);
    setFocusTrigger((n) => n + 1);
  };

  const handleMapPickDestination = async (pt: LatLngPoint) => {
    if (activeTrip?.status === 'travelling') return;
    setDestPoint(pt);
    const label = await resolveNearbyLabel(pt);
    const cleaned = label.replace(/^Near\s+/, '');
    setDestName(cleaned || 'Pinned Destination');
    setDestInput(cleaned || 'Pinned Destination');
  };

  const handleQuickPreset = (
    label: string,
    latOffset: number,
    lngOffset: number
  ) => {
    const pt = {
      lat: Number((currentPoint.lat + latOffset).toFixed(6)),
      lng: Number((currentPoint.lng + lngOffset).toFixed(6)),
    };
    setDestName(label);
    setDestInput(label);
    setDestPoint(pt);
    setFocusTrigger((n) => n + 1);
  };

  const handleStartJourney = async () => {
    if (!hasLocationConsent) {
      onRequestLocationConsent();
      return;
    }
    if (!destPoint || !destName) return;

    setIsStartingTrip(true);
    try {
      trailRef.current = [currentPoint];
      arrivalDispatchedForTripRef.current = null;
      deviationDispatchedForTripRef.current = null;
      setSimStepIndex(0);

      const dist = haversineDistanceMeters(currentPoint, destPoint);
      await startJourney({
        uid: profile.uid,
        ownerUid: effectiveOwnerUid,
        travelerName: profile.displayName,
        approvedFamilyLinks,
        originName: currentLabel || 'Starting Point',
        originPoint: currentPoint,
        destinationName: destName,
        destinationPoint: destPoint,
        geofenceRadiusMeters: geofenceRadius,
        travelMode,
        expectedEncodedPolyline:
          expectedPolyline || encodePolyline([currentPoint, destPoint]),
        distanceToDestinationMeters: dist,
      });
      setFocusTrigger((n) => n + 1);
    } finally {
      setIsStartingTrip(false);
    }
  };

  const handleShareLocationOnly = async () => {
    if (!hasLocationConsent) {
      onRequestLocationConsent();
      return;
    }
    await updateLiveTelemetry({
      uid: profile.uid,
      ownerUid: effectiveOwnerUid,
      point: currentPoint,
      accuracyMeters,
      locationLabel: currentLabel || 'Live Location',
      status: 'travelling',
      isSharingEnabled: true,
      activeTripId: '',
      destinationName: '',
      destinationPoint: {lat: 0, lng: 0},
      geofenceRadiusMeters: geofenceRadius,
      distanceToDestinationMeters: 0,
      routeDeviationMeters: 0,
      recordHistory: true,
    });
  };

  const handleStopSharing = async () => {
    setIsStopping(true);
    setSimAutoPlaying(false);
    try {
      await stopLocationSharing({
        uid: profile.uid,
        ownerUid: effectiveOwnerUid,
        activeTripId:
          activeTrip?.status === 'travelling' ||
          activeTrip?.status === 'route_deviation' ||
          activeTrip?.status === 'sos_alert'
            ? activeTrip.id
            : '',
        currentPoint,
        locationLabel: 'Location sharing paused',
      });
    } finally {
      setIsStopping(false);
    }
  };

  const handleSimulateDetour = async () => {
    if (!activeTrip) return;
    setSimAutoPlaying(false);
    const offRoutePoint: LatLngPoint = {
      lat: currentPoint.lat + 0.0055,
      lng: currentPoint.lng + 0.0045,
    };
    await processLocationUpdate(
      offRoutePoint,
      15,
      true,
      'Unplanned side road detour'
    );
  };

  const handleConfirmSos = async () => {
    setIsTriggeringSos(true);
    try {
      await triggerSosAlert({
        uid: profile.uid,
        ownerUid: effectiveOwnerUid,
        travelerName: profile.displayName,
        approvedFamilyLinks,
        point: currentPoint,
        locationLabel: currentLabel || 'Current GPS Coordinates',
        activeTripId:
          activeTrip?.status === 'travelling' ||
          activeTrip?.status === 'route_deviation'
            ? activeTrip.id
            : '',
        destinationName: activeTrip?.destinationName || destName || '',
        destinationPoint: activeTrip
          ? {lat: activeTrip.destinationLat, lng: activeTrip.destinationLng}
          : destPoint || {lat: 0, lng: 0},
        geofenceRadiusMeters: geofenceRadius,
        distanceToDestinationMeters: destPoint
          ? haversineDistanceMeters(currentPoint, destPoint)
          : 0,
        actualEncodedPolyline: encodePolyline(trailRef.current),
      });
      setSosModalOpen(false);
    } finally {
      setIsTriggeringSos(false);
    }
  };

  const currentStatus: JourneyStatus =
    liveState?.status || profile.status || 'idle';
  const isActivelyTravelling =
    profile.isSharingEnabled &&
    (currentStatus === 'travelling' ||
      currentStatus === 'route_deviation' ||
      currentStatus === 'sos_alert');
  const updatedAtDate = liveState?.updatedAt ? liveState.updatedAt.toDate() : null;

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left / Top Control Column */}
      <div className="lg:col-span-5 space-y-5">
        {/* Location Permission Ask Prompt (when not yet allowed) */}
        {!hasLocationConsent && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-sm font-bold text-stone-900">
                  Allow SafeReach to access your location?
                </h2>
                <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                  Location access lets SafeReach read your live GPS coordinates,
                  share your route with approved family members, and
                  automatically confirm when you safely enter your destination.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRequestLocationConsent}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Allow Location Access
            </button>
          </div>
        )}

        {/* Give Access: Your SafeReach ID + Inline Pending Family Requests */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-stone-500">
                Give Access ID (Share with Family)
              </div>
              <div className="font-mono-tabular text-xl font-bold tracking-wider text-stone-900 mt-0.5">
                {profile.safeReachId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopySafeReachId()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {copiedId ? (
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
          </div>

          {pendingLinks.length > 0 && (
            <div className="border-t border-stone-100 pt-3 space-y-2.5">
              <div className="text-xs font-semibold text-stone-900">
                Pending Access Requests ({pendingLinks.length})
              </div>
              {pendingLinks.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-stone-900 truncate">
                      {req.familyName} wants to track your location
                    </div>
                    <div className="text-[11px] text-stone-500">
                      Relationship: {req.relationship}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyLinkId === req.id}
                      onClick={() => void handleRespondLink(req, 'approved')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyLinkId === req.id}
                      onClick={() => void handleDeclineLink(req)}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-stone-100 pt-3 flex items-center justify-between gap-2 text-xs text-stone-600">
            <span>
              {approvedFamilyLinks.length === 0
                ? 'No family members have location access yet.'
                : `${approvedFamilyLinks.length} authorized ${
                    approvedFamilyLinks.length === 1 ? 'viewer' : 'viewers'
                  }: ${approvedFamilyLinks
                    .map((l) => l.familyName)
                    .join(', ')}`}
            </span>
          </div>
        </div>

        {/* Status & Safety Action Card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-stone-500 font-mono-tabular">
                {profile.displayName} · {profile.safeReachId}
              </div>
              <div className="mt-1.5">
                <StatusIndicator status={currentStatus} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSosModalOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>SOS Alert</span>
            </button>
          </div>

          {currentStatus === 'reached_safely' && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  Automatic arrival confirmed.
                </span>{' '}
                You entered the{' '}
                {activeTrip?.geofenceRadiusMeters || geofenceRadius}m geofence
                around {activeTrip?.destinationName || destName}. Your
                authorized family members have been notified.
              </div>
            </div>
          )}

          {currentStatus === 'route_deviation' && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Route deviation detected.</span>{' '}
                You are {formatDistance(liveState?.routeDeviationMeters || 0)}{' '}
                off the planned route. Approved family members have received a
                safety heads-up.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-stone-100">
            <div>
              <div className="text-xs text-stone-500">Current Location</div>
              <div className="text-sm font-medium text-stone-900 mt-0.5 truncate">
                {currentLabel}
              </div>
              <div className="font-mono-tabular text-[11px] text-stone-500 mt-0.5">
                {currentPoint.lat.toFixed(5)}, {currentPoint.lng.toFixed(5)}
              </div>
            </div>
            <div>
              <div className="text-xs text-stone-500">
                {destPoint ? 'Distance to Destination' : 'Last Synced'}
              </div>
              <div className="text-sm font-medium text-stone-900 mt-0.5 font-mono-tabular">
                {destPoint
                  ? formatDistance(
                      haversineDistanceMeters(currentPoint, destPoint)
                    )
                  : updatedAtDate
                  ? formatTimeShort(updatedAtDate)
                  : 'Ready'}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                {updatedAtDate
                  ? `Updated ${formatRelativeAge(updatedAtDate)}`
                  : 'Waiting to start'}
              </div>
            </div>
          </div>

          {gpsWarning && (
            <div className="p-3 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-700 leading-relaxed">
              {gpsWarning}
            </div>
          )}

          {profile.isSharingEnabled && (
            <button
              type="button"
              disabled={isStopping}
              onClick={() => void handleStopSharing()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-100 text-stone-800 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4 text-stone-600" />
              <span>
                {isStopping ? 'Stopping Sharing...' : 'Stop Location Sharing'}
              </span>
            </button>
          )}
        </div>

        {/* Destination & Geofence Planner */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900">
              {isActivelyTravelling
                ? 'Active Journey Details'
                : 'Plan Destination & Safe-Arrival Geofence'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {isActivelyTravelling
                ? `Monitoring arrival within ${geofenceRadius}m of ${destName}.`
                : 'Search a place, tap on the map, or choose a nearby preset.'}
            </p>
          </div>

          {!isActivelyTravelling && (
            <>
              <DestinationAutocomplete
                value={destInput}
                onSelect={handlePlaceSelect}
                biasCenter={currentPoint}
              />

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickPreset('Home', 0.012, 0.011)}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium cursor-pointer"
                >
                  Nearby Home (~1.8 km)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickPreset('Campus Main Gate', -0.009, 0.008)
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium cursor-pointer"
                >
                  Campus (~1.3 km)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickPreset('Central Bus Stand', 0.004, -0.006)
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium cursor-pointer"
                >
                  Bus Stand (~0.8 km)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="travel-mode"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Travel Mode
                  </label>
                  <select
                    id="travel-mode"
                    value={travelMode}
                    onChange={(e) =>
                      setTravelMode(e.target.value as TravelModeType)
                    }
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  >
                    <option value="DRIVING">Car / Cab</option>
                    <option value="WALKING">Walking</option>
                    <option value="TWO_WHEELER">Two-Wheeler</option>
                    <option value="TRANSIT">Public Transit</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="geofence-radius"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Arrival Geofence
                  </label>
                  <select
                    id="geofence-radius"
                    value={geofenceRadius}
                    onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  >
                    <option value={150}>150 m radius</option>
                    <option value={300}>300 m radius</option>
                    <option value={500}>500 m radius</option>
                    <option value={1000}>1,000 m radius</option>
                    <option value={2000}>2,000 m radius</option>
                  </select>
                </div>
              </div>

              {routeEstimate && destPoint && (
                <div className="flex items-center justify-between text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5">
                  <span>
                    Route to{' '}
                    <strong className="text-stone-900">{destName}</strong>
                  </span>
                  <span className="font-mono-tabular">
                    {formatDistance(routeEstimate.distanceMeters)} · ~
                    {routeEstimate.durationMins} min
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!destPoint || isStartingTrip}
                  onClick={() => void handleStartJourney()}
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>
                    {isStartingTrip
                      ? 'Starting Journey...'
                      : 'Start Tracked Journey'}
                  </span>
                </button>
                {!profile.isSharingEnabled && (
                  <button
                    type="button"
                    onClick={() => void handleShareLocationOnly()}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Share Live Only
                  </button>
                )}
              </div>
            </>
          )}

          {isActivelyTravelling && activeTrip && (
            <div className="space-y-3">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">From</span>
                  <span className="font-medium text-stone-900 truncate">
                    {activeTrip.originName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">Destination</span>
                  <span className="font-medium text-stone-900 truncate">
                    {activeTrip.destinationName}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">Arrival Geofence</span>
                  <span className="font-mono-tabular font-medium text-stone-900">
                    {activeTrip.geofenceRadiusMeters} m radius
                  </span>
                </div>
              </div>

              {/* Journey Test Simulator */}
              <div className="border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSimulator((v) => !v)}
                  className="w-full min-h-[38px] flex items-center justify-between text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Journey Test Simulator (for stationary testing)
                  </span>
                  <span>{showSimulator ? 'Hide' : 'Open'}</span>
                </button>

                {showSimulator && (
                  <div className="mt-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Test automatic geofence arrival and route deviation from
                      your desk without physically travelling.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSimAutoPlaying((p) => !p)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        {simAutoPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pause Route Playback</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Auto-Play Safe Arrival</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSimulateDetour()}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-medium cursor-pointer"
                      >
                        Simulate Off-Route Detour
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Google Map Column */}
      <div className="lg:col-span-7 h-[420px] lg:h-[640px]">
        <SafeReachMap
          center={currentPoint}
          travelerPosition={currentPoint}
          travelerLabel={`${profile.displayName} (${profile.safeReachId})`}
          travelerStatus={currentStatus}
          travelerUpdatedLabel={
            updatedAtDate ? formatTimeShort(updatedAtDate) : 'Live'
          }
          destinationPosition={destPoint}
          destinationLabel={destName}
          geofenceRadiusMeters={geofenceRadius}
          expectedEncodedPolyline={expectedPolyline}
          actualEncodedPolyline={
            activeTrip?.actualEncodedPolyline ||
            (trailRef.current.length > 1
              ? encodePolyline(trailRef.current)
              : '')
          }
          allowTapToPickDestination={!isActivelyTravelling}
          onMapPickDestination={(pt) => void handleMapPickDestination(pt)}
          focusTrigger={focusTrigger}
        />
      </div>

      {/* SOS Confirmation Modal */}
      {sosModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-stone-200 p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-stone-900">
                  Send Urgent SOS Alert?
                </h3>
                <p className="text-xs text-stone-500">
                  Notifies {approvedFamilyLinks.length} authorized family{' '}
                  {approvedFamilyLinks.length === 1 ? 'member' : 'members'} with
                  your exact GPS coordinates.
                </p>
              </div>
            </div>

            {privateInfo?.emergencyContactName && (
              <div className="w-full px-4 py-2.5 rounded-xl bg-stone-100 text-stone-800 text-xs font-medium">
                Trusted Contact Label: {privateInfo.emergencyContactName} (alerted
                in-app without sharing phone numbers)
              </div>
            )}

            <p className="text-xs text-stone-500 leading-relaxed">
              SafeReach does not replace local emergency services (e.g., 112 /
              911). Call local emergency services directly if you are in
              immediate physical danger.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                disabled={isTriggeringSos}
                onClick={() => void handleConfirmSos()}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {isTriggeringSos ? 'Sending SOS...' : 'Confirm & Send SOS'}
              </button>
              <button
                type="button"
                onClick={() => setSosModalOpen(false)}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
