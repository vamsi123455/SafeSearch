import React, {useState} from 'react';
import {Clock, Lock, MapPin, Navigation, Trash2} from 'lucide-react';
import {deleteHistoryEntry} from '../../lib/safereachApi';
import {formatTimeShort} from '../../lib/geofence';
import {LocationHistoryEntry, Trip} from '../../types/safereach';
import {StatusIndicator} from '../StatusIndicator';

interface LocationHistoryPanelProps {
  uid: string;
  trips: Trip[];
  history: LocationHistoryEntry[];
}

export function LocationHistoryPanel({
  uid,
  trips,
  history,
}: LocationHistoryPanelProps) {
  const [tab, setTab] = useState<'trips' | 'breadcrumbs'>('trips');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await deleteHistoryEntry(uid, entryId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-stone-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-stone-900">
            <Lock className="w-4 h-4 text-teal-700" />
            <h2 className="font-display text-lg font-semibold">
              Protected Location History
            </h2>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Private to your account only. Family members can only see your live
            journey while sharing is enabled.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTab('trips')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'trips'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Past Journeys ({trips.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('breadcrumbs')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'breadcrumbs'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Location Log ({history.length})
          </button>
        </div>
      </div>

      {tab === 'trips' ? (
        <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {trips.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-500">
              No journeys recorded yet. Start a journey in Traveler mode to
              track automatic safe arrival.
            </div>
          ) : (
            trips.map((trip) => {
              const startedDate = trip.startedAt
                ? trip.startedAt.toDate()
                : null;
              const arrivedDate =
                trip.arrivedAtMs > 0 ? new Date(trip.arrivedAtMs) : null;
              return (
                <div
                  key={trip.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                      <Navigation className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="truncate">
                        {trip.originName} to {trip.destinationName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span>
                        Started{' '}
                        {startedDate
                          ? `${startedDate.toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })} at ${formatTimeShort(startedDate)}`
                          : 'Recently'}
                      </span>
                      {arrivedDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Arrived {formatTimeShort(arrivedDate)}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        Geofence {trip.geofenceRadiusMeters}m
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusIndicator
                      status={
                        trip.status === 'cancelled' ? 'idle' : trip.status
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-500">
              No location log entries recorded yet.
            </div>
          ) : (
            history.map((entry) => {
              const recordedDate = entry.recordedAt
                ? entry.recordedAt.toDate()
                : null;
              return (
                <div
                  key={entry.id}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-stone-900 truncate">
                        {entry.locationLabel || 'Recorded GPS Checkpoint'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {recordedDate
                            ? `${recordedDate.toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })} · ${formatTimeShort(recordedDate)}`
                            : 'Just now'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <StatusIndicator status={entry.status} compact />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={deletingId === entry.id}
                    onClick={() => void handleDelete(entry.id)}
                    aria-label="Delete location entry"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-rose-700 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
