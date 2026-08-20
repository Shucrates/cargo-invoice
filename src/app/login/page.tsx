'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    } catch (err: any) {
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'admin' | 'staff') => {
    setLoading(true);
    setError(null);
    const demoEmail = role === 'admin' ? 'admin@rudracargo.com' : 'test@rudracargo.com';
    const demoPassword = 'password123';
    setEmail(demoEmail);
    setPassword(demoPassword);

    try {
      const res = await signIn('credentials', {
        email: demoEmail,
        password: demoPassword,
        redirect: false,
        redirectTo: '/dashboard',
      });

      if (res?.error) {
        setError(
          res.error === 'CredentialsSignin'
            ? 'Invalid demo credentials.'
            : 'Authentication error. Please try again.'
        );
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: any) {
      setError('Demo login failed.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col justify-between items-center px-4 py-12 font-sans selection:bg-[#0A2030] selection:text-white">
      {/* Top spacer to balance layout */}
      <div className="hidden sm:block flex-1" />

      {/* Centered Content (Logo + Login Card) */}
      <div className="w-full max-w-[420px] my-auto flex flex-col items-center">
        {/* Brand Logo Outside Card */}
        <div className="mb-6 flex justify-center">
          <img
            src="/rudra-logo.png"
            alt="Rudra Cargo Logo"
            className="h-20 sm:h-24 w-auto object-contain"
          />
        </div>

        {/* Main Login Card */}
        <div className="w-full bg-white border border-gray-100/90 shadow-[0_4px_30px_rgba(0,0,0,0.03)] rounded-[32px] p-8 sm:p-12">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Dashboard Login
            </h1>
            <p className="text-sm text-neutral-400 mt-1.5 font-normal">
              Secure access to the Rudra Cargo &amp; Transport NX management platform
            </p>
          </div>

        {/* Error Message */}
        {error && (
          <div className="mb-5 p-3 text-center text-xs text-red-600 bg-red-50/80 border border-red-100 rounded-xl">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full h-13 px-4 bg-white border border-gray-200/90 focus:border-[#0A2030] focus:ring-2 focus:ring-[#0A2030]/10 focus:outline-none rounded-2xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors"
            />
          </div>

          <div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full h-13 px-4 bg-white border border-gray-200/90 focus:border-[#0A2030] focus:ring-2 focus:ring-[#0A2030]/10 focus:outline-none rounded-2xl text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-13 bg-[#0A2030] hover:bg-[#071520] active:scale-[0.99] text-white font-medium text-sm rounded-2xl transition-all duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {/* Temporary Demo Login Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin')}
              disabled={loading}
              className="h-12 bg-neutral-100 hover:bg-neutral-200/80 active:scale-[0.99] text-neutral-800 font-medium text-xs rounded-2xl transition-all duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              Demo Admin
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('staff')}
              disabled={loading}
              className="h-12 bg-neutral-100 hover:bg-neutral-200/80 active:scale-[0.99] text-neutral-800 font-medium text-xs rounded-2xl transition-all duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              Demo Staff
            </button>
          </div>
        </form>
      </div>
      </div>

      {/* Footer */}
      <div className="flex-1 flex items-end justify-center pt-8 pb-4">
        <p className="text-sm text-neutral-400 text-center font-normal">
          &copy; 2026 Rudra Cargo &amp; Transport NX
        </p>
      </div>
    </div>
  );
}
