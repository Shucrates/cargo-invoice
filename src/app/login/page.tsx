'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Box, Check, Lock, Mail, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<'admin' | 'staff'>('admin');
  const [email, setEmail] = useState('admin@rudracargo.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleRoleSelect = (role: 'admin' | 'staff') => {
    setSelectedRole(role);
    if (role === 'admin') {
      setEmail('admin@rudracargo.com');
    } else {
      setEmail('test@rudracargo.com');
    }
  };

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
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col justify-center items-center p-4 text-slate-900 font-sans">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 bg-[#2563EB] text-white rounded-xl flex items-center justify-center shadow-md">
          <Box className="w-5 h-5" />
        </div>
        <span className="font-bold text-xl tracking-tight text-slate-900">Rudra Cargo</span>
      </div>

      {/* Main Sign-In Container (Mockup 1) */}
      <div className="w-full max-w-[440px] bg-white border border-slate-200 shadow-sm rounded-2xl p-7 md:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sign in</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Rudra Cargo & Transport NX</p>
        </div>

        {/* Role Selector Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Admin Role Card */}
          <button
            type="button"
            onClick={() => handleRoleSelect('admin')}
            className={`p-3.5 rounded-xl border text-left transition-all relative ${
              selectedRole === 'admin'
                ? 'border-[#2563EB] bg-blue-50/50 ring-1 ring-[#2563EB]'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-bold ${selectedRole === 'admin' ? 'text-[#2563EB]' : 'text-slate-700'}`}>
                Admin
              </span>
              {selectedRole === 'admin' && (
                <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Full access — revenue, reports, payments, and settings
            </p>
          </button>

          {/* Staff Role Card */}
          <button
            type="button"
            onClick={() => handleRoleSelect('staff')}
            className={`p-3.5 rounded-xl border text-left transition-all relative ${
              selectedRole === 'staff'
                ? 'border-[#2563EB] bg-blue-50/50 ring-1 ring-[#2563EB]'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-bold ${selectedRole === 'staff' ? 'text-[#2563EB]' : 'text-slate-700'}`}>
                Staff
              </span>
              {selectedRole === 'staff' && (
                <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Operational access — shipments and customers only
            </p>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
            {error}
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <div className="relative">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 rounded-xl text-xs text-slate-900 font-medium transition-all"
                placeholder="admin@rudracargo.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 rounded-xl text-xs text-slate-900 font-medium transition-all pr-10"
                placeholder="Enter password"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Primary Electric Blue Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#2563EB] hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            {loading ? 'Signing in...' : `Sign in as ${selectedRole === 'admin' ? 'Admin' : 'Staff'}`}
          </button>
        </form>

        <div className="pt-2 text-center border-t border-slate-100">
          <p className="text-[11px] text-slate-400 font-mono">
            Demo: admin@rudracargo.com / test@rudracargo.com (pass: password123)
          </p>
        </div>
      </div>
    </div>
  );
}
