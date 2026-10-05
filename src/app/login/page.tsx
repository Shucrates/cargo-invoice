'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Headset, ChevronRight, Loader2 } from 'lucide-react';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/companyConfig';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
        redirectTo: '/dashboard',
      });

      if (res?.error) {
        setError(
          res.error === 'CredentialsSignin'
            ? 'Invalid email or password.'
            : 'Authentication error. Please try again.'
        );
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh w-full bg-[#F6F8FB] text-slate-900 font-sans flex selection:bg-[#0A2030] selection:text-white">
      {/* Brand panel (desktop only) */}
      <aside className="hidden lg:flex relative w-1/2 m-4 rounded-3xl overflow-hidden flex-col justify-between p-12 text-white">
        <img
          src="/images/tracking-hero.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-[78%_100%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A2030]/70 via-[#0A2030]/10 to-[#0A2030]/80" />

        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Rudra Cargo &amp; Transport Nx
          </p>
          <h2 className="mt-4 text-3xl xl:text-4xl font-semibold tracking-tight leading-tight text-balance">
            Every LR, bill and payment in one place.
          </h2>
        </div>

        <p className="relative max-w-md text-sm text-white/80 leading-relaxed">
          Book consignments, update tracking for customers, raise bills and keep the cash book
          straight, from Dadar to anywhere in India.
        </p>
      </aside>

      {/* Sign-in column */}
      <main className="flex-1 flex flex-col px-6 sm:px-10 py-8">
        <header className="flex justify-center lg:justify-start">
          <div className="flex items-center gap-3">
            <img src="/rudra-logo.png" alt="" className="h-10 w-auto object-contain" />
            <span className="text-base font-semibold tracking-tight text-[#0A2030]">Rudra Cargo</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-[400px]">
            <div className="text-center">
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-slate-500">Sign in to the operations dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="mt-10 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="p-3 text-sm text-[#D14343] bg-[#FDECEC] border border-[#D14343]/15 rounded-xl"
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@rudracargo.com"
                  className="w-full h-12 px-4 bg-white border border-[#E5EAF0] focus:border-[#0A2030] focus:ring-4 focus:ring-[#0A2030]/10 focus:outline-none rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-12 pl-4 pr-12 bg-white border border-[#E5EAF0] focus:border-[#0A2030] focus:ring-4 focus:ring-[#0A2030]/10 focus:outline-none rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 mt-2 bg-[#0A2030] hover:bg-[#13304A] active:scale-[0.99] text-white font-medium text-sm rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="text-center text-[13px] text-slate-500">
                Forgot your password? Ask an admin to reset it.
              </p>
            </form>
          </div>
        </div>

        <footer className="flex flex-col-reverse sm:flex-row gap-3 sm:items-center justify-between text-[13px] text-slate-500">
          <span>&copy; {new Date().getFullYear()} Rudra Cargo &amp; Transport Nx</span>
          <a
            href={`tel:${DEFAULT_COMPANY_SETTINGS.phone1.replace(/\s/g, '')}`}
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-[#0A2030] transition-colors"
          >
            <Headset className="w-4 h-4" />
            Need help? Call the office
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </footer>
      </main>
    </div>
  );
}
