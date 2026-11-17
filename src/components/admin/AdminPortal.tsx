import React, {useMemo, useState} from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  KeyRound,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  adminLookupUserByUniqueId,
  adminUpdateUserAccessAndProfile,
} from '../../lib/safereachApi';
import {
  isUserProfileActive,
  RolePreference,
  SAFE_REACH_LIMITS,
  SubscriptionStatus,
  UserProfile,
} from '../../types/safereach';

interface AdminPortalProps {
  allUsers: UserProfile[];
  activeProfileUid: string | null;
  allowAllUsers: boolean;
  onToggleGlobalAccess: (enabled: boolean) => Promise<void>;
  onDeleteAccount: (user: UserProfile) => Promise<void>;
  onDeleteAllAccounts: () => Promise<void>;
}

type StatusFilter = 'all' | 'pending' | 'active' | 'revoked';

export function AdminPortal({
  allUsers,
  activeProfileUid,
  allowAllUsers,
  onToggleGlobalAccess,
  onDeleteAccount,
  onDeleteAllAccounts,
}: AdminPortalProps) {
  const [uniqueIdInput, setUniqueIdInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Editable form fields when managing/modifying a user
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<RolePreference>('both');
  const [editSubStatus, setEditSubStatus] =
    useState<SubscriptionStatus>('active');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [listSearch, setListSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rowBusyUid, setRowBusyUid] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [togglingGlobalAccess, setTogglingGlobalAccess] = useState(false);

  const loadIntoEditor = (user: UserProfile) => {
    setSelectedUser(user);
    setEditName(user.displayName);
    setEditRole(user.rolePreference || 'both');
    setEditSubStatus(
      user.subscriptionStatus ||
        (user.accessGranted ? 'active' : 'pending')
    );
    setEditNote(user.subscriptionNote || '');
    setLookupError(null);
    setActionBanner(null);
  };

  const handleLookupByUniqueId = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setActionBanner(null);
    setLookupBusy(true);
    try {
      const result = await adminLookupUserByUniqueId(uniqueIdInput);
      if (!result) {
        setLookupError(
          `No user found with Unique ID "${uniqueIdInput.trim()}". Unique IDs are 10 characters and case-sensitive.`
        );
        return;
      }
      loadIntoEditor(result.profile);
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : 'Unable to look up Unique ID.'
      );
    } finally {
      setLookupBusy(false);
    }
  };

  const handleQuickSubscriptionDecision = async (
    target: UserProfile,
    grant: boolean
  ) => {
    setRowBusyUid(target.uid);
    setActionBanner(null);
    const nextStatus: SubscriptionStatus = grant ? 'active' : 'revoked';
    const nextNote = grant
      ? 'Access active — granted by Admin'
      : 'Access removed by Admin';

    try {
      await adminUpdateUserAccessAndProfile({
        targetProfile: target,
        displayName: target.displayName,
        rolePreference: target.rolePreference,
        subscriptionStatus: nextStatus,
        accessGranted: grant,
        subscriptionNote: nextNote,
      });

      const updated: UserProfile = {
        ...target,
        subscriptionStatus: nextStatus,
        accessGranted: grant,
        subscriptionNote: nextNote,
        isSharingEnabled: grant ? target.isSharingEnabled : false,
        status: grant ? target.status : 'idle',
      };
      if (selectedUser?.uid === target.uid) {
        loadIntoEditor(updated);
      }
      setActionBanner({
        type: 'success',
        text: grant
          ? `Access granted for ${target.displayName} (${target.safeReachId}).`
          : `Access removed for ${target.displayName} (${target.safeReachId}). App access blocked.`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to update access status.',
      });
    } finally {
      setRowBusyUid(null);
    }
  };

  const handleSaveModifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSavingEdit(true);
    setActionBanner(null);

    const grant = editSubStatus === 'active';
    const fallbackNote = grant
      ? 'Access active — granted by Admin'
      : editSubStatus === 'revoked'
      ? 'Access removed by Admin'
      : 'Awaiting admin approval';

    try {
      await adminUpdateUserAccessAndProfile({
        targetProfile: selectedUser,
        displayName: editName,
        rolePreference: editRole,
        subscriptionStatus: editSubStatus,
        accessGranted: grant,
        subscriptionNote: editNote.trim() || fallbackNote,
      });

      const updated: UserProfile = {
        ...selectedUser,
        displayName: editName.trim() || selectedUser.displayName,
        rolePreference: editRole,
        subscriptionStatus: editSubStatus,
        accessGranted: grant,
        subscriptionNote: editNote.trim() || fallbackNote,
      };
      loadIntoEditor(updated);
      setActionBanner({
        type: 'success',
        text: `Saved modifications & access (${editSubStatus}) for ${updated.safeReachId}.`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to save admin modifications.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Ignore clipboard error
    }
  };

  const stats = useMemo(() => {
    let active = 0;
    let pending = 0;
    let revoked = 0;
    for (const u of allUsers) {
      if (isUserProfileActive(u)) {
        active++;
      } else if (u.subscriptionStatus === 'revoked') {
        revoked++;
      } else {
        pending++;
      }
    }
    return {total: allUsers.length, active, pending, revoked};
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const q = listSearch.trim();
    const qLower = q.toLowerCase();
    return allUsers
      .filter((u) => {
        if (statusFilter === 'active') return isUserProfileActive(u);
        if (statusFilter === 'revoked')
          return u.subscriptionStatus === 'revoked';
        if (statusFilter === 'pending')
          return !isUserProfileActive(u) && u.subscriptionStatus !== 'revoked';
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        return (
          u.safeReachId.includes(q) ||
          u.displayName.toLowerCase().includes(qLower)
        );
      })
      .sort((a, b) => {
        const aMs = a.createdAt ? a.createdAt.toMillis() : 0;
        const bMs = b.createdAt ? b.createdAt.toMillis() : 0;
        return bMs - aMs;
      });
  }, [allUsers, listSearch, statusFilter]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Admin Header & Summary Stats */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-stone-900">
              <ShieldCheck className="w-5 h-5 text-teal-700" />
              <h1 className="font-display text-xl font-bold tracking-tight">
                SafeReach Admin Portal
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {allUsers.length > 0 &&
              (!confirmDeleteAll ? (
                <button
                  type="button"
                  disabled={deletingAll}
                  onClick={() => setConfirmDeleteAll(true)}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-700 flex items-center gap-1.5 cursor-pointer"
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
                      setActionBanner(null);
                      try {
                        await onDeleteAllAccounts();
                      } catch (err) {
                        setActionBanner({
                          type: 'error',
                          text:
                            err instanceof Error
                              ? err.message
                              : 'Failed to remove accounts.',
                        });
                      } finally {
                        setDeletingAll(false);
                        setConfirmDeleteAll(false);
                      }
                    }}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {deletingAll ? 'Removing All...' : 'Confirm Remove All'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={() => setConfirmDeleteAll(false)}
                    className="min-h-[38px] px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-xs font-medium text-stone-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50">
              <div className="text-left">
                <div className="text-xs font-semibold text-stone-900">
                  All Users Access
                </div>
                <div className="text-[11px] text-stone-500">
                  {allowAllUsers ? 'All users enabled' : 'Allowed users only'}
                </div>
              </div>
              <div
                role="group"
                aria-label="All Users Access Control"
                className="inline-flex items-center p-0.5 rounded-lg bg-stone-200/80"
              >
                <button
                  type="button"
                  disabled={togglingGlobalAccess}
                  onClick={async () => {
                    if (allowAllUsers) return;
                    setTogglingGlobalAccess(true);
                    setActionBanner(null);
                    try {
                      await onToggleGlobalAccess(true);
                      setActionBanner({
                        type: 'success',
                        text: 'All Users Access is ON. All registered users now have access to SafeReach.',
                      });
                    } catch (err) {
                      setActionBanner({
                        type: 'error',
                        text:
                          err instanceof Error
                            ? err.message
                            : 'Unable to turn ON access for all users.',
                      });
                    } finally {
                      setTogglingGlobalAccess(false);
                    }
                  }}
                  className={`min-h-[30px] px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    allowAllUsers
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  disabled={togglingGlobalAccess}
                  onClick={async () => {
                    if (!allowAllUsers) return;
                    setTogglingGlobalAccess(true);
                    setActionBanner(null);
                    try {
                      await onToggleGlobalAccess(false);
                      setActionBanner({
                        type: 'success',
                        text: 'All Users Access is OFF. Access stopped for non-approved users — only allowed users can access SafeReach.',
                      });
                    } catch (err) {
                      setActionBanner({
                        type: 'error',
                        text:
                          err instanceof Error
                            ? err.message
                            : 'Unable to turn OFF global access.',
                      });
                    } finally {
                      setTogglingGlobalAccess(false);
                    }
                  }}
                  className={`min-h-[30px] px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    !allowAllUsers
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-stone-100">
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
            <div className="text-xs text-stone-500">Total Accounts</div>
            <div className="font-mono-tabular text-2xl font-bold text-stone-900 mt-0.5">
              {stats.total}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-xs text-emerald-800">Allowed Users</div>
            <div className="font-mono-tabular text-2xl font-bold text-emerald-900 mt-0.5">
              {stats.active}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-xs text-amber-800">Pending Access</div>
            <div className="font-mono-tabular text-2xl font-bold text-amber-900 mt-0.5">
              {stats.pending}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
            <div className="text-xs text-rose-800">Removed / Blocked</div>
            <div className="font-mono-tabular text-2xl font-bold text-rose-900 mt-0.5">
              {stats.revoked}
            </div>
          </div>
        </div>
      </div>

      {actionBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium flex items-center gap-2.5 ${
            actionBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionBanner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
          )}
          <span>{actionBanner.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Unique ID Lookup & Admin Modification Console */}
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleLookupByUniqueId}
            className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3.5"
          >
            <div className="flex items-center gap-2 text-stone-900">
              <KeyRound className="w-4 h-4 text-teal-700" />
              <h2 className="font-display text-base font-semibold">
                Grant or Modify by Unique ID
              </h2>
            </div>

            {lookupError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {lookupError}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={10}
                value={uniqueIdInput}
                onChange={(e) => setUniqueIdInput(e.target.value)}
                placeholder="Enter 10-char Unique ID"
                aria-label="Lookup 10-Character Unique ID"
                className="flex-1 min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm font-mono-tabular text-stone-900 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
              />
              <button
                type="submit"
                disabled={lookupBusy || !uniqueIdInput.trim()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                {lookupBusy ? 'Finding...' : 'Find ID'}
              </button>
            </div>
          </form>

          {selectedUser && (
            <form
              onSubmit={handleSaveModifications}
              className="bg-white border-2 border-teal-700 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-stone-500">Selected User</div>
                  <div className="font-display text-lg font-bold text-stone-900">
                    {selectedUser.displayName}
                  </div>
                  <div className="font-mono-tabular text-xs font-semibold text-teal-800 mt-0.5">
                    Unique ID: {selectedUser.safeReachId}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                    isUserProfileActive(selectedUser)
                      ? 'bg-emerald-100 text-emerald-900'
                      : selectedUser.subscriptionStatus === 'revoked'
                      ? 'bg-rose-100 text-rose-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {isUserProfileActive(selectedUser)
                    ? 'Active'
                    : selectedUser.subscriptionStatus === 'revoked'
                    ? 'Removed'
                    : 'Pending'}
                </span>
              </div>

              {/* Instant One-Click Access Actions */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={rowBusyUid === selectedUser.uid}
                  onClick={() =>
                    void handleQuickSubscriptionDecision(selectedUser, true)
                  }
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Grant Access</span>
                </button>
                <button
                  type="button"
                  disabled={rowBusyUid === selectedUser.uid}
                  onClick={() =>
                    void handleQuickSubscriptionDecision(selectedUser, false)
                  }
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserX className="w-4 h-4" />
                  <span>Remove Access</span>
                </button>
              </div>

              {/* Full Profile & Access Modification Controls */}
              <div className="space-y-3 border-t border-stone-100 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800">
                  <Edit3 className="w-3.5 h-3.5 text-teal-700" />
                  <span>Modify Profile &amp; App Access</span>
                </div>

                <div>
                  <label
                    htmlFor="admin-edit-name"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Display Name
                  </label>
                  <input
                    id="admin-edit-name"
                    type="text"
                    required
                    maxLength={SAFE_REACH_LIMITS.DISPLAY_NAME_MAX}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="admin-edit-role"
                      className="block text-xs font-medium text-stone-700 mb-1"
                    >
                      Allowed Mode
                    </label>
                    <select
                      id="admin-edit-role"
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value as RolePreference)
                      }
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-medium text-stone-900"
                    >
                      <option value="traveler">Give Access Only</option>
                      <option value="family">Track Location Only</option>
                      <option value="both">Both Modes</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-edit-sub"
                      className="block text-xs font-medium text-stone-700 mb-1"
                    >
                      Access Decision
                    </label>
                    <select
                      id="admin-edit-sub"
                      value={editSubStatus}
                      onChange={(e) =>
                        setEditSubStatus(e.target.value as SubscriptionStatus)
                      }
                      className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-medium text-stone-900"
                    >
                      <option value="active">Active (Access Granted)</option>
                      <option value="pending">Pending Approval</option>
                      <option value="revoked">Removed (Access Blocked)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-edit-note"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Admin Access Note
                  </label>
                  <input
                    id="admin-edit-note"
                    type="text"
                    maxLength={SAFE_REACH_LIMITS.SUBSCRIPTION_NOTE_MAX}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="e.g. Verified family member"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingEdit ? 'Saving Modifications...' : 'Save Admin Changes'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Live All-Users Queue & Access Control List */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-stone-900">
                Registered Accounts &amp; Access ({filteredUsers.length})
              </h2>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Filter by Name or ID..."
                className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
              />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap gap-1.5 border-b border-stone-100 pb-3">
            {(
              [
                {id: 'all', label: `All (${stats.total})`},
                {id: 'pending', label: `Pending (${stats.pending})`},
                {id: 'active', label: `Active (${stats.active})`},
                {id: 'revoked', label: `Removed (${stats.revoked})`},
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500">
              No matching SafeReach accounts found.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredUsers.map((u) => {
                const active = isUserProfileActive(u);
                const isRevoked = u.subscriptionStatus === 'revoked';
                const isCurrentTabProfile = u.uid === activeProfileUid;
                const busy = rowBusyUid === u.uid;

                return (
                  <div
                    key={u.uid}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 truncate">
                          {u.displayName}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            active
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : isRevoked
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {active
                            ? 'Allowed'
                            : isRevoked
                            ? 'Removed'
                            : 'Pending Approval'}
                        </span>
                        {isCurrentTabProfile && (
                          <span className="text-[11px] text-teal-700 font-medium">
                            · Current Tab
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <button
                          type="button"
                          onClick={() => void handleCopy(u.safeReachId)}
                          className="font-mono-tabular font-semibold text-stone-800 hover:text-teal-700 inline-flex items-center gap-1 cursor-pointer"
                          title="Copy 10-character Unique ID"
                        >
                          <span>{u.safeReachId}</span>
                          {copiedId === u.safeReachId ? (
                            <Check className="w-3 h-3 text-emerald-700" />
                          ) : (
                            <Copy className="w-3 h-3 text-stone-400" />
                          )}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span>
                          {u.rolePreference === 'family'
                            ? 'Track Location'
                            : u.rolePreference === 'traveler'
                            ? 'Give Access'
                            : 'Both Modes'}
                        </span>
                        {u.subscriptionNote && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{u.subscriptionNote}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {!active && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handleQuickSubscriptionDecision(u, true)
                          }
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium cursor-pointer"
                        >
                          Give Access
                        </button>
                      )}
                      {active && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handleQuickSubscriptionDecision(u, false)
                          }
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-medium cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => loadIntoEditor(u)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium cursor-pointer"
                      >
                        Modify
                      </button>
                      <button
                        type="button"
                        disabled={busy || deletingAll}
                        onClick={async () => {
                          setRowBusyUid(u.uid);
                          setActionBanner(null);
                          try {
                            await onDeleteAccount(u);
                            if (selectedUser?.uid === u.uid) {
                              setSelectedUser(null);
                            }
                            setActionBanner({
                              type: 'success',
                              text: `Removed account ${u.displayName} (${u.safeReachId}).`,
                            });
                          } catch (err) {
                            setActionBanner({
                              type: 'error',
                              text:
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to delete account.',
                            });
                          } finally {
                            setRowBusyUid(null);
                          }
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 disabled:opacity-60 text-rose-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{busy ? '...' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
