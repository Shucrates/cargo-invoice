'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import CargoDocketForm from '@/components/CargoDocketForm';
import DocketList from '@/components/DocketList';
import KpiStats from '@/components/KpiStats';
import { CargoDocket } from '@/types/cargo';
import { Plus } from 'lucide-react';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [view, setView] = useState<'overview' | 'create'>('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [dockets, setDockets] = useState<CargoDocket[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  const fetchDockets = async () => {
    try {
      const res = await fetch('/api/dockets');
      if (res.ok) {
        const data = await res.json();
        setDockets(data);
      }
    } catch (err) {
      console.error('Failed to fetch dockets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status === 'authenticated') {
      fetchDockets();
    }
  }, [status, router, refreshKey]);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111111] text-white font-mono">
        Authenticating session & loading terminal UI...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2EDEA] flex flex-col font-sans">
      {/* Top Navigation Header */}
      <header className="bg-[#111111] text-white px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#232323] gap-4 shadow-md">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wide text-white">RUDRA CARGO & TRANSPORT NX</h1>
          <p className="text-xs text-[#60899B] font-medium">Digital LR & GST Tax Invoice Terminal</p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {view === 'overview' ? (
            <button
              onClick={() => setView('create')}
              className="px-4 py-2 bg-[#1C3E4E] hover:bg-[#224D5F] text-white font-bold rounded-lg uppercase tracking-wider transition flex items-center gap-1.5 shadow-md border border-[#285C70]"
            >
              <Plus className="w-4 h-4" />
              <span>Issue New LR Docket</span>
            </button>
          ) : (
            <button
              onClick={() => setView('overview')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg uppercase tracking-wider transition"
            >
              Back to Overview
            </button>
          )}

          <div className="bg-[#193746] border border-[#285C70] px-3 py-2 rounded-lg">
            <span className="text-slate-300">Logged in: </span>
            <span className="font-semibold text-white">{session?.user?.email}</span>
          </div>

          <button
            onClick={handleSignOut}
            className="px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold uppercase transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Terminal View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {view === 'overview' ? (
          <div className="space-y-6">
            {/* Executive KPI Stats Summary */}
            <KpiStats dockets={dockets} />

            {/* Docket Audit History Table & Export Controls */}
            <DocketList refreshKey={refreshKey} />
          </div>
        ) : (
          /* Dedicated Docket Creation Form View */
          <CargoDocketForm
            onBack={() => setView('overview')}
            onCreated={() => {
              setRefreshKey((prev) => prev + 1);
              setView('overview');
            }}
          />
        )}
      </main>
    </div>
  );
}
