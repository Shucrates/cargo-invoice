'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, ArrowRight, Truck, MapPin, CheckCircle2, Clock, XCircle, ChevronRight, RefreshCw, Box } from 'lucide-react';
import Link from 'next/link';
import { ShipmentStepper } from '@/components/ShipmentStepper';

export default function PublicTrackingSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<any | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    setLoading(true);
    setError(null);
    setTrackingResult(null);

    try {
      const res = await fetch(`/api/dockets/${encodeURIComponent(clean)}/tracking`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'No shipment found for this LR or tracking number.');
      }
      const data = await res.json();
      setTrackingResult(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load shipment status.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const isDelivered = status === 'Delivered';
    const isVoided = status === 'Voided';
    const isInTransit = ['In Transit', 'Out for Delivery'].includes(status);

    if (isDelivered) {
      return (
        <span className="px-3 py-1 bg-[#E8F7EF] text-[#1F8A4C] border border-emerald-200/60 rounded-full text-xs font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{status}</span>
        </span>
      );
    }
    if (isVoided) {
      return (
        <span className="px-3 py-1 bg-[#FDECEC] text-[#D14343] border border-red-200/60 rounded-full text-xs font-semibold flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          <span>{status}</span>
        </span>
      );
    }
    if (isInTransit) {
      return (
        <span className="px-3 py-1 bg-[#EEF4FF] text-[#2563EB] border border-blue-200/60 rounded-full text-xs font-semibold flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" />
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span>{status}</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900 font-sans flex flex-col justify-between">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-center shadow-saas overflow-hidden p-0.5">
              <img src="/rudra-logo.png" alt="Rudra Cargo Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 block leading-none">Rudra Cargo</span>
              <span className="text-xs text-slate-500 font-medium mt-0.5 block">Public Shipment Tracking</span>
            </div>
          </div>

          <Link
            href="/login"
            className="text-xs font-semibold text-[#2563EB] hover:text-blue-700 bg-[#EEF4FF] hover:bg-blue-100 px-3.5 py-2 rounded-xl transition-saas flex items-center gap-1"
          >
            <span>Staff Login</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Main Search Hero Section */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Track Your Shipment</h1>
          <p className="text-xs text-slate-500 font-medium">
            Enter your LR docket number or courier waybill number to see the latest status.
          </p>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
          <div className="relative flex items-center bg-white border border-slate-200/90 rounded-2xl p-2 shadow-saas focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/10 transition-saas">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. DOC-90812 or 77481920"
              className="w-full pl-11 pr-20 sm:pr-32 py-3 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none font-medium"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              aria-label={loading ? 'Tracking...' : 'Track Status'}
              className="absolute right-2 top-2 bottom-2 px-3 sm:px-5 bg-[#2563EB] hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-saas transition-saas flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Tracking...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Track Status</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto p-4 bg-[#FDECEC] border border-red-200/60 rounded-2xl text-xs text-[#D14343] font-semibold text-center shadow-xs">
            {error}
          </div>
        )}

        {/* Tracking Results Card */}
        {trackingResult && (
          <div className="max-w-2xl mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 md:p-8 shadow-saas space-y-6 animate-in fade-in duration-200">
            {/* Top Status Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-mono text-slate-400 block uppercase tracking-wider">Docket Number</span>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">#{trackingResult.docket_no}</h2>
              </div>
              <div>{getStatusBadge(trackingResult.status)}</div>
            </div>

            {/* Route Summary Box */}
            <div className="p-5 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Origin</span>
                  <span className="text-sm font-bold text-slate-900">{trackingResult.from_city}</span>
                  <span className="text-xs text-slate-500 font-medium block mt-0.5">{trackingResult.consignor_name}</span>
                </div>

                <div className="flex flex-col items-center">
                  <Truck className="w-5 h-5 text-[#2563EB]" />
                  <span className="text-[10px] font-medium text-slate-500 mt-1 uppercase font-mono">{trackingResult.transport_mode}</span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Destination</span>
                  <span className="text-sm font-bold text-slate-900">{trackingResult.to_city}</span>
                  <span className="text-xs text-slate-500 font-medium block mt-0.5">{trackingResult.consignee_name}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-3 border-t border-slate-200/60 text-slate-600">
                <div>Courier: <strong className="text-slate-900">{trackingResult.courier_partner}</strong></div>
                <div>Waybill: <strong className="text-slate-900">{trackingResult.tracking_no}</strong></div>
                <div>Packages: <strong className="text-slate-900">{trackingResult.package_count} pcs</strong></div>
              </div>
            </div>

            {/* Pictorial Progress Stepper */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3">Delivery Progress</h3>
              <ShipmentStepper status={trackingResult.status} checkpoints={trackingResult.checkpoints || []} />
            </div>

            {/* Consignment Info */}
            <div className="flex items-center justify-between gap-3 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-white border border-slate-200/80 rounded-xl flex items-center justify-center shrink-0">
                  <Box className="w-5 h-5 text-slate-400" />
                </div>
                <span className="text-xs font-bold text-slate-900 truncate">{trackingResult.goods_description}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">Qty: {trackingResult.package_count}</span>
            </div>

            {/* Checkpoints Timeline */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Shipment Timeline Checkpoints</h3>

              {trackingResult.checkpoints && trackingResult.checkpoints.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {trackingResult.checkpoints.map((cp: any, idx: number) => {
                    const isLatest = idx === 0;
                    return (
                      <div key={idx} className="relative">
                        <div
                          className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                            isLatest ? 'border-[#2563EB] ring-4 ring-blue-100' : 'border-slate-300'
                          }`}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isLatest ? 'text-[#2563EB]' : 'text-slate-800'}`}>
                              {cp.status}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(cp.datetime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">{cp.description}</p>
                          {cp.location && (
                            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {cp.location}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-mono">
                  No checkpoint updates recorded yet.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 text-center text-xs text-slate-500 font-medium">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Rudra Cargo & Transport NX. All rights reserved.</span>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <span>Ph: +91 9821541984</span>
            <span>·</span>
            <span>Dadar, Mumbai</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
