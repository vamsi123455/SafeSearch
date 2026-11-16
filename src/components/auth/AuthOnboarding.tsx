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
  mode: 'signin' | 'register';
  defaultName?: string;
  email?: string;
  isSubmitting: boolean;
  error: string | null;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (data: EmailSignupFormData) => Promise<void>;
  onGoogleRegisterWithDetails: (data?: SignupFormData) => Promise<void>;
  onCompleteRegistration: (data: SignupFormData) => Promise<void>;
  onSignOut: () => void;
  onClearError?: () => void;
}

function GoogleLogoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AuthOnboarding({
  mode,
  defaultName = '',
  email = '',
  isSubmitting,
  error,
  onEmailLogin,
  onEmailSignUp,
  onGoogleRegisterWithDetails,
  onCompleteRegistration,
  onSignOut,
  onClearError,
}: AuthOnboardingProps) {
  const [portalView, setPortalView] = useState<'login' | 'signup'>(
    mode === 'register' ? 'signup' : 'login'
  );

  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up / Register fields (no trusted contact or arrival geofence)
  const [displayName, setDisplayName] = useState(defaultName);
  const [accountEmail, setAccountEmail] = useState(email);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rolePreference, setRolePreference] =
    useState<RolePreference>('traveler');
  const [formError, setFormError] = useState<string | null>(null);

  const showSignupForm = mode === 'register' || portalView === 'signup';

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

    const effectiveEmail = (accountEmail.trim() || email || '').slice(
      0,
      SAFE_REACH_LIMITS.EMAIL_MAX
    );

    if (mode === 'register') {
      await onCompleteRegistration({
        displayName: trimmedName,
        email: effectiveEmail || 'user@safereach.app',
        emergencyContactName: '',
        rolePreference,
        defaultGeofenceRadiusMeters: 300,
      });
      return;
    }

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

  const handleGoogleRegisterClick = async () => {
    setFormError(null);
    const trimmedName = displayName
      .trim()
      .slice(0, SAFE_REACH_LIMITS.DISPLAY_NAME_MAX);
    const trimmedEmail = accountEmail
      .trim()
      .slice(0, SAFE_REACH_LIMITS.EMAIL_MAX);

    if (trimmedName) {
      await onGoogleRegisterWithDetails({
        displayName: trimmedName,
        email: trimmedEmail,
        emergencyContactName: '',
        rolePreference,
        defaultGeofenceRadiusMeters: 300,
      });
    } else {
      await onGoogleRegisterWithDetails();
    }
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

          {mode === 'register' && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs font-medium text-stone-600 hover:text-stone-900 min-h-[38px] px-3 rounded-lg hover:bg-stone-200/60 cursor-pointer"
            >
              Switch Account
            </button>
          )}
        </div>

        {/* Focused Login / Sign Up Portal Card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
          {mode === 'signin' && (
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
          )}

          {activeError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed">
              {activeError}
            </div>
          )}

          {!showSignupForm ? (
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
                  required={mode === 'signin'}
                  readOnly={mode === 'register' && Boolean(email)}
                  maxLength={SAFE_REACH_LIMITS.EMAIL_MAX}
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder={email || 'you@example.com'}
                  className={`w-full min-h-[44px] px-3.5 py-2 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700/25 focus:border-teal-700 ${
                    mode === 'register' && email
                      ? 'bg-stone-50 text-stone-600'
                      : 'bg-white'
                  }`}
                />
              </div>

              {mode === 'signin' && (
                <>
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
                        onClick={() =>
                          setShowConfirmPassword((prev) => !prev)
                        }
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
                </>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Signing up...' : 'Sign Up'}
              </button>

              {mode === 'signin' && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-stone-200" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                      or
                    </span>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleGoogleRegisterClick()}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-60 text-stone-900 font-semibold text-sm flex items-center justify-center gap-3 transition-colors shadow-xs cursor-pointer"
                  >
                    <GoogleLogoIcon />
                    <span>Register with Google Account</span>
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
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
