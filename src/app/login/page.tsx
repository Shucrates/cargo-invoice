'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';

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
      });

      if (res?.error) {
        setError('Invalid email or password credentials.');
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: any) {
      if (err?.type === 'CredentialsSignin' || err?.message?.includes('CredentialsSignin')) {
        setError('Invalid email or password credentials.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-gradient-to-b from-[#16303D] via-[#1C3E4E] to-[#255468] font-sans select-none overflow-hidden p-4">
      {/* Dark Ambient Radial Glow */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(96,137,155,0.3), transparent 70%)'
        }}
      />

      {/* Top Spacer */}
      <div className="h-6 md:h-12" />

      {/* Clean Professional Login Card */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center">
        <div className="w-full max-w-[400px] bg-white/95 backdrop-blur-2xl rounded-2xl p-8 md:p-9 shadow-2xl border border-white/60 transition-all duration-300">
          
          {/* Brand Icon Badge */}
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 bg-[#1C3E4E] text-white rounded-xl flex items-center justify-center shadow-md border border-[#285C70]">
              <LogIn className="w-5 h-5" />
            </div>
          </div>

          {/* Clean Professional Heading */}
          <div className="text-center mb-7">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Rudra Cargo
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Sign in to access your docket terminal
            </p>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-[#1C3E4E] rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C3E4E]/20 transition-all"
                  placeholder="admin@rudracargo.com"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-[#1C3E4E] rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1C3E4E]/20 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 bg-[#1C3E4E] hover:bg-[#16303D] text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer Note */}
          <div className="mt-7 text-center border-t border-slate-200 pt-4">
            <p className="text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1C3E4E]" />
              <span>Authorized Personnel Access Only</span>
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="relative z-10 w-full p-6 text-center text-xs text-white/70 font-medium tracking-wide">
        © {new Date().getFullYear()} Rudra Cargo & Transport NX. All rights reserved.
      </footer>
    </div>
  );
}
