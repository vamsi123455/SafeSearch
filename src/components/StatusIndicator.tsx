import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Navigation,
  PauseCircle,
  ShieldAlert,
} from 'lucide-react';
import {JourneyStatus} from '../types/safereach';

interface StatusIndicatorProps {
  status: JourneyStatus;
  compact?: boolean;
}

const STATUS_META: Record<
  JourneyStatus,
  {
    label: string;
    textColor: string;
    iconColor: string;
    Icon: React.ComponentType<{className?: string}>;
  }
> = {
  reached_safely: {
    label: 'Reached Safely',
    textColor: 'text-emerald-800',
    iconColor: 'text-emerald-600',
    Icon: CheckCircle2,
  },
  travelling: {
    label: 'Travelling',
    textColor: 'text-sky-800',
    iconColor: 'text-sky-600',
    Icon: Navigation,
  },
  route_deviation: {
    label: 'Route Deviation Detected',
    textColor: 'text-amber-800',
    iconColor: 'text-amber-600',
    Icon: AlertTriangle,
  },
  sos_alert: {
    label: 'SOS Emergency Alert',
    textColor: 'text-rose-800',
    iconColor: 'text-rose-600',
    Icon: ShieldAlert,
  },
  signal_stale: {
    label: 'No Recent Update',
    textColor: 'text-amber-800',
    iconColor: 'text-amber-600',
    Icon: Clock,
  },
  idle: {
    label: 'Sharing Paused',
    textColor: 'text-stone-600',
    iconColor: 'text-stone-400',
    Icon: PauseCircle,
  },
};

export function StatusIndicator({status, compact = false}: StatusIndicatorProps) {
  const meta = STATUS_META[status] || STATUS_META.idle;
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium ${meta.textColor} ${
        compact ? 'text-xs' : 'text-sm'
      }`}
    >
      <Icon className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} shrink-0 ${meta.iconColor}`} />
      <span>{meta.label}</span>
    </span>
  );
}
