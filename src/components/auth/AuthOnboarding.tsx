import React, {useState} from 'react';
import {Eye, EyeOff, Navigation, ShieldCheck, Users} from 'lucide-react';
import {RolePreference, SAFE_REACH_LIMITS} from '../../types/safereach';

export interface SignupFormData {
  displayName: string;
  email: string;
  emergencyContactName: string;
  rolePreference: RolePreference;
  defaultGeofenceRadiusMeters: number;
}

export interface EmailSignupFormData extends SignupFormData {
  password: string;
}

interface AuthOnboardingProps {
  isSubmitting: boolean;
  error: string | null;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (data: EmailSignupFormData) => Promise<void>;
  onClearError?: () => void;
}

export function AuthOnboarding({
  isSubmitting,
  error,
  onEmailLogin,
  onEmailSignUp,
  onClearError,
}: AuthOnboardingProps) {
  const [portalView, setPortalView] = useState<'login' | 'signup'>('login');

  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up fields
  const [displayName, setDisplayName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rolePreference, setRolePreference] =
    useState<RolePreference>('traveler');
  const [formError, setFormError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedUser = loginUsername.trim();
    if (!trimmedUser) {
      setFormError('Please enter your registered email / username.');
      return;
    }
    if (!trimmedUser.includes('@')) {
      setFormError(
        'Please enter the registered email address you used during Sign Up.'
      );
      return;
    }
    if (!loginPassword) {
      setFormError('Please enter your password.');
      return;
    }
    await onEmailLogin(trimmedUser, loginPassword);
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = displayName
      .trim()
      .slice(0, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX);
    if (!trimmedName) {
      setFormError('Please enter your full name.');
      return;
    }

    const effectiveEmail = accountEmail
      .trim()
      .slice(0, SAFE_REACH_LIMITS.EMAIL_MAX);

    if (!effectiveEmail || !effectiveEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Password and Confirm Password do not match.');
      return;
    }

    await onEmailSignUp({
      displayName: trimmedName,
      email: effectiveEmail,
      password,
      emergencyContactName: '',
      rolePreference,
      defaultGeofenceRadiusMeters: 300,
    });
  };

  const activeError = formError || error;

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Clean Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-stone-900">
              SafeReach
            </span>
          </div>
        </div>

        {/* Focused Login / Sign Up Portal Card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
          <div
            role="tablist"
            aria-label="Login or Sign Up"
            className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={portalView === 'login'}
              onClick={() => {
                setPortalView('login');
                setFormError(null);
                onClearError?.();
              }}
              className={`min-h-[42px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                portalView === 'login'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={portalView === 'signup'}
              onClick={() => {
                setPortalView('signup');
                setFormError(null);
                onClearError?.();
              }}
              className={`min-h-[42px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                portalView === 'signup'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              New User? Sign Up
            </button>
          </div>

          {activeError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed">
              {activeError}
            </div>
          )}

          {portalView === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Username / Email
                </label>
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  maxLength={SAFE_REACH_LIMITS.EMAIL_MAX}
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={
                      showLoginPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Logging in...' : 'Login'}
              </button>

              <div className="text-center pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => {
                    setPortalView('signup');
                    setFormError(null);
                    onClearError?.();
                  }}
                  className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer py-1"
                >
                  New user? Sign up
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              {/* Mode Selection */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-stone-700">
                  How do you want to use SafeReach?
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRolePreference('traveler')}
                    className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      rolePreference === 'traveler'
                        ? 'border-2 border-teal-700 bg-teal-50/70'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
                      <Navigation className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Give Access</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRolePreference('family')}
                    className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      rolePreference === 'family'
                        ? 'border-2 border-teal-700 bg-teal-50/70'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
                      <Users className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span>Track Location</span>
                    </div>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRolePreference('both')}
                  className={`w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    rolePreference === 'both'
                      ? 'border-teal-700 bg-teal-50/70 text-teal-900'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  Allow Both Modes
                </button>
              </div>

              <div>
                <label
                  htmlFor="reg-name"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  maxLength={SAFE_REACH_LIMITS.DISPLAY_NAME_MAX}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  maxLength={SAFE_REACH_LIMITS.EMAIL_MAX}
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password (min 6 characters)"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-confirm-password"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword
                        ? 'Hide confirm password'
                        : 'Show confirm password'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Signing up...' : 'Sign Up'}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPortalView('login');
                    setFormError(null);
                    onClearError?.();
                  }}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer py-1"
                >
                  Already registered? Back to Login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
