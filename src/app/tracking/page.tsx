'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Truck,
  Check,
  XCircle,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  X,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/companyConfig';

interface Checkpoint {
  status: string;
  location?: string;
  datetime: string;
  description?: string;
}

interface TrackingData {
  docket_no: string;
  status: string;
  is_live_feed: boolean;
  booking_date: string;
  estimated_delivery?: string;
  transport_mode: string;
  courier_partner: string;
  tracking_no: string;
  from_city: string;
  to_city: string;
  consignor_name: string;
  consignee_name: string;
  package_count: number;
  charged_weight_kg: number;
  goods_description: string;
  payment_mode: string;
  checkpoints: Checkpoint[];
}

const STAGES = ['Booked', 'In Transit', 'Out for Delivery', 'Delivered'] as const;

/** Map a free-text checkpoint status (manual or carrier) onto STAGES. */
function stageOf(status: string): number {
  if (/out for delivery/i.test(status)) return 2;
  if (/delivered|completed/i.test(status)) return 3;
  if (/transit|hub|picked|dispatch|depart|arrived/i.test(status)) return 1;
  return 0;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || 'N/A';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TrackingContent() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<TrackingData | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  // Syncing the URL after a search re-fires the searchParams effect; this
  // stops it from fetching the same reference twice.
  const lastFetchedRef = useRef<string | null>(null);

  const fetchTracking = async (trackingId: string) => {
    const clean = trackingId.trim().replace(/^#+\s*/, '').trim();
    if (!clean) return;

    lastFetchedRef.current = clean;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dockets/${encodeURIComponent(clean)}/tracking`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            `No shipment found for "${clean}". Check the LR number printed on your Lorry Receipt.`
          );
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to retrieve shipment status. Please try again.');
      }
      const data: TrackingData = await res.json();
      setTrackingResult(data);
      window.history.replaceState(null, '', `/tracking?id=${encodeURIComponent(clean)}`);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Unable to retrieve shipment status. Please try again.');
      setTrackingResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let id = searchParams.get('id') || '';
    if (!id && typeof window !== 'undefined' && window.location.hash) {
      id = window.location.hash.replace(/^#+\s*/, '');
    }
    const cleanId = id.trim().replace(/^#+\s*/, '');
    if (cleanId && cleanId !== lastFetchedRef.current) {
      setQuery(cleanId);
      fetchTracking(cleanId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!showContactModal) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowContactModal(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showContactModal]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(query);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900 font-sans flex flex-col">
      {/* Hero with search */}
      <section className="relative w-full min-h-[560px] h-[78svh] max-h-[760px] flex flex-col overflow-hidden">
        <img
          src="/images/tracking-hero.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-[76%_100%] sm:object-[60%_100%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/10 to-transparent" />

        <header className="relative z-10 w-full px-4 sm:px-10 py-5 sm:py-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="bg-white rounded-xl p-1.5 shadow-sm shrink-0">
                <img src="/rudra-logo.png" alt="Rudra Cargo" className="h-8 sm:h-9 w-auto object-contain" />
              </span>
              <span className="text-white text-sm sm:text-lg font-semibold tracking-tight truncate">
                Rudra Cargo<span className="hidden sm:inline"> &amp; Transport Nx</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="shrink-0 text-white text-sm font-medium underline underline-offset-4 hover:text-white/80 transition-colors cursor-pointer"
            >
              Contact Us
            </button>
          </div>
        </header>

        <div className="relative z-10 w-full max-w-2xl mx-auto px-4 pt-10 sm:pt-16 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight drop-shadow-sm">
            Moving Businesses Forward.
          </h1>
          <p className="mt-3 text-sm sm:text-lg text-white/90">
            Track your consignment with the LR number or waybill number.
          </p>

          <form onSubmit={handleSearch} className="mt-7 sm:mt-8">
            <label htmlFor="tracking-query" className="sr-only">
              LR or waybill number
            </label>
            <div className="flex items-center gap-2 bg-white rounded-2xl p-2 shadow-xl shadow-slate-900/15">
              <Search className="ml-2 w-5 h-5 text-slate-400 shrink-0" />
              <input
                id="tracking-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. LR-2026-01070"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 h-11 bg-transparent text-base text-slate-900 font-mono placeholder:text-slate-400 placeholder:font-sans focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="h-11 px-5 sm:px-6 bg-[#0A2030] hover:bg-[#071520] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shrink-0"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 sm:hidden" />}
                <span className="hidden sm:inline">{loading ? 'Tracking' : 'Track'}</span>
              </button>
            </div>
          </form>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-white border border-red-200 rounded-xl text-sm text-[#D14343] flex items-start gap-2 text-left shadow-sm"
            >
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>

      <main className="flex-1 w-full px-4 sm:px-6 py-10 sm:py-14 space-y-14 sm:space-y-20">
        {trackingResult && (
          <div ref={resultsRef} className="max-w-3xl mx-auto scroll-mt-6">
            <ShipmentResult data={trackingResult} />
          </div>
        )}

        <section
          aria-labelledby="about-title"
          className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0A2030]/60">About us</p>
            <h2
              id="about-title"
              className="mt-5 text-3xl sm:text-[40px] font-medium tracking-tight text-slate-900 leading-[1.15]"
            >
              Dependable cargo transport from Mumbai to across India
            </h2>
            <p className="mt-5 text-[15px] text-slate-600 leading-relaxed">
              Rudra Cargo &amp; Transport Nx moves consignments for businesses by road, rail and air — matched to
              the size of the load and the deadline it has to meet.
            </p>
            <p className="mt-4 text-[15px] text-slate-600 leading-relaxed">
              Every shipment is booked against a Lorry Receipt, so you can follow it right here from booking to
              delivery.
            </p>
            <a
              href={`tel:${DEFAULT_COMPANY_SETTINGS.phone1.replace(/\s/g, '')}`}
              className="mt-8 h-11 px-5 inline-flex items-center bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Call us
            </a>
          </div>

          <div className="grid grid-cols-[3fr_2fr] grid-rows-2 gap-3 h-[340px] sm:h-[460px]">
            <img
              src="/images/about-road.jpg"
              alt="Cargo truck on an open highway"
              className="row-span-2 w-full h-full object-cover rounded-2xl"
            />
            <img
              src="/images/about-warehouse.jpg"
              alt="Freight truck outside a warehouse"
              className="w-full h-full object-cover object-[30%_center] rounded-2xl"
            />
            <div className="rounded-2xl bg-[#0A2030] text-white p-4 sm:p-5 flex flex-col justify-between">
              <MapPin className="w-5 h-5 text-white/60" />
              <div>
                <p className="text-lg sm:text-xl font-semibold leading-tight">Pan-India</p>
                <p className="mt-1 text-xs text-white/60">Road · Rail · Air from Dadar, Mumbai</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-10 py-6 flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Rudra Cargo &amp; Transport Nx</span>
          <span>{DEFAULT_COMPANY_SETTINGS.address}</span>
        </div>
      </footer>

      {showContactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setShowContactModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 id="contact-title" className="text-lg font-bold text-slate-900">
                Contact Rudra Cargo
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-700">
              <ContactRow icon={<Phone className="w-4 h-4" />} label="Phone">
                {[DEFAULT_COMPANY_SETTINGS.phone1, DEFAULT_COMPANY_SETTINGS.phone2].map((p) => (
                  <a key={p} href={`tel:${p.replace(/\s/g, '')}`} className="text-[#0A2030] hover:underline block">
                    {p}
                  </a>
                ))}
              </ContactRow>
              <ContactRow icon={<Mail className="w-4 h-4" />} label="Email">
                <a href={`mailto:${DEFAULT_COMPANY_SETTINGS.email}`} className="text-[#0A2030] hover:underline break-all">
                  {DEFAULT_COMPANY_SETTINGS.email}
                </a>
              </ContactRow>
              <ContactRow icon={<MapPin className="w-4 h-4" />} label="Head Office">
                <p className="text-slate-600 leading-relaxed">{DEFAULT_COMPANY_SETTINGS.address}</p>
              </ContactRow>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShipmentResult({ data }: { data: TrackingData }) {
  const isVoided = data.status === 'Voided';
  const hasIssue = /delay|exception|fail/i.test(data.status);
  // Shipments only move forward, so the furthest checkpoint reached is the
  // current stage even if a later "Delayed" update has no stage of its own.
  const stage = Math.max(0, ...data.checkpoints.map((cp) => stageOf(cp.status)));
  const isDelivered = stage === 3;

  const headline = isVoided ? 'Voided' : hasIssue ? data.status : STAGES[stage];
  const headlineColor = isVoided || hasIssue ? 'text-[#D14343]' : isDelivered ? 'text-[#1F8A4C]' : 'text-slate-900';

  return (
    <div className="bg-white border border-[#EEF1F4] rounded-2xl shadow-saas overflow-hidden">
      {/* Status headline */}
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              LR No. <span className="font-mono text-slate-700">{data.docket_no}</span>
            </p>
            <h2 className={`mt-1 text-2xl sm:text-3xl font-bold tracking-tight ${headlineColor}`}>{headline}</h2>
          </div>
          {!isVoided && !isDelivered && data.estimated_delivery && (
            <div className="sm:text-right">
              <p className="text-xs font-medium text-slate-500">Estimated delivery</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{data.estimated_delivery}</p>
            </div>
          )}
        </div>

        {(isVoided || hasIssue) && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm bg-[#FDECEC] text-[#D14343]">
            {isVoided ? <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>
              {isVoided
                ? 'This LR has been cancelled. Contact us if you were expecting this shipment.'
                : 'Your shipment has been held up. Our operations team is on it — call us for details.'}
            </span>
          </div>
        )}

        {/* Route */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">From</p>
            <p className="text-base sm:text-lg font-semibold text-slate-900 truncate">{data.from_city}</p>
            <p className="text-xs text-slate-500 truncate">{data.consignor_name}</p>
          </div>
          <div className="flex-1 flex items-center gap-2 text-slate-300 min-w-[48px]">
            <span className="flex-1 border-t-2 border-dashed border-slate-200" />
            <Truck className="w-5 h-5 text-[#0A2030] shrink-0" />
            <span className="flex-1 border-t-2 border-dashed border-slate-200" />
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-500">To</p>
            <p className="text-base sm:text-lg font-semibold text-slate-900 truncate">{data.to_city}</p>
            <p className="text-xs text-slate-500 truncate">{data.consignee_name}</p>
          </div>
        </div>

        {/* Progress */}
        {!isVoided && (
          <ol className="grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Shipment progress">
            {STAGES.map((label, idx) => {
              const reached = idx <= stage;
              return (
                <li key={label} className="space-y-2">
                  <div className={`h-1.5 rounded-full ${reached ? (isDelivered ? 'bg-[#1F8A4C]' : 'bg-[#0A2030]') : 'bg-slate-200'}`} />
                  <p className={`text-[11px] sm:text-xs leading-tight ${idx === stage ? 'font-semibold text-slate-900' : reached ? 'text-slate-600' : 'text-slate-400'}`}>
                    {label}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Timeline */}
      <div className="border-t border-[#EEF1F4] p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-slate-900">Shipment updates</h3>
        <ol className="mt-5">
          {data.checkpoints.map((cp, idx) => {
            const isLatest = idx === 0;
            const isLast = idx === data.checkpoints.length - 1;
            return (
              <li key={idx} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" />}
                <span
                  className={`relative z-10 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isLatest ? 'bg-[#0A2030] text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isLatest ? <span className="w-2 h-2 rounded-full bg-white" /> : <Check className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                    <p className={`text-sm ${isLatest ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                      {cp.status}
                    </p>
                    <time dateTime={cp.datetime} className="text-xs text-slate-500 shrink-0">
                      {formatDateTime(cp.datetime)}
                    </time>
                  </div>
                  {cp.location && <p className="text-xs text-slate-500 mt-0.5">{cp.location}</p>}
                  {cp.description && cp.description !== cp.status && (
                    <p className="text-xs text-slate-400 mt-0.5">{cp.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {!data.is_live_feed && !isVoided && (
          <p className="mt-6 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
            New updates will appear here as your shipment moves through our network.
          </p>
        )}
      </div>

      {/* Details */}
      <dl className="border-t border-[#EEF1F4] bg-[#F8FAFC] p-6 sm:px-8 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
        <Detail label="Booked on" value={formatDate(data.booking_date)} />
        <Detail label="Mode" value={data.transport_mode} />
        <Detail label="Packages" value={`${data.package_count}`} />
        <Detail label="Charged weight" value={`${data.charged_weight_kg} kg`} />
        <Detail label="Contents" value={data.goods_description} />
        <Detail label="Payment" value={data.payment_mode.replace(/_/g, ' ')} />
        {data.tracking_no !== 'N/A' && (
          <>
            <Detail label="Courier partner" value={data.courier_partner} />
            <Detail label="Waybill no." value={data.tracking_no} mono />
          </>
        )}
      </dl>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium text-slate-900 break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function ContactRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="font-semibold block text-slate-900">{label}</span>
        {children}
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <TrackingContent />
    </Suspense>
  );
}
