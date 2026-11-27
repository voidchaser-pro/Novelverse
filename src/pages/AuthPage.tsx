import { useState, useEffect } from 'react';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, Loader2, AlertCircle, BookOpenText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { NOVELVERSE_LOGO } from '@/components/Logo';

type Mode = 'signin' | 'signup';

export function AuthPage() {
  const { navigate, refreshAuthUser } = useApp();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured. Please check your environment setup.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          await refreshAuthUser();
          navigate('dashboard');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        if (data.user) {
          await refreshAuthUser();
          navigate('dashboard');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 animate-fade-in-up">
          <NOVELVERSE_LOGO className="w-14 h-14 mb-3" />
          <h1 className="font-display font-extrabold text-2xl gradient-text">NOVELVERSE</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'signin' ? 'Welcome back — sign in to continue' : 'Create your account to start reading'}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 animate-fade-in-up">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 mb-6">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signin'
                  ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50 mb-4 animate-scale-in">
              <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="your_username"
                    className="input-field !pl-12"
                    minLength={3}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="input-field !pl-12"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="input-field !pl-12"
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3 mt-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'signin' ? (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200/60 dark:border-slate-800/60">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-primary-600 dark:text-primary-400 font-semibold hover:underline"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Guest browsing */}
        <div className="text-center mt-4">
          <button
            onClick={() => navigate('dashboard')}
            className="text-sm text-slate-400 dark:text-slate-500 hover:text-primary-500 transition-colors flex items-center gap-1.5 mx-auto"
          >
            <BookOpenText className="w-4 h-4" />
            Continue browsing as guest
          </button>
        </div>
      </div>
    </div>
  );
}
