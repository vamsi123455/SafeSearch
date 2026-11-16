import React from 'react';
import {MapPin, Shield, X} from 'lucide-react';

interface LocationPermissionModalProps {
  isOpen: boolean;
  permissionError: string | null;
  onAllow: () => void;
  onDismiss: () => void;
}

export function LocationPermissionModal({
  isOpen,
  permissionError,
  onAllow,
  onDismiss,
}: LocationPermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-perm-title"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-stone-200 p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close location permission dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-xl -mr-2 -mt-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h2
            id="location-perm-title"
            className="font-display text-xl font-bold text-stone-900"
          >
            Allow SafeReach to access your location?
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            SafeReach needs GPS access to obtain your current coordinates while
            you are sharing a journey. Your location is used strictly to:
          </p>
          <ul className="text-sm text-stone-700 space-y-2 pt-1">
            <li className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <span>
                Share live progress only with family members you have approved.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <span>
                Detect automatically when you enter your destination geofence
                and update your status to Reached Safely.
              </span>
            </li>
          </ul>
          <p className="text-xs text-stone-500 pt-1">
            You can pause or stop location sharing at any moment.
          </p>
        </div>

        {permissionError && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            {permissionError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={onAllow}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Allow Location Access
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors cursor-pointer"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
