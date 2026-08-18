'use client';

import { useState, useEffect, use } from 'react';
import { Box, Truck, MapPin, CheckCircle2, Clock, XCircle, ArrowLeft, ChevronLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { ShipmentStepper } from '@/components/ShipmentStepper';

export default function PublicTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dockets/${encodeURIComponent(id)}/tracking`)
      .then((res) => {
        if (!res.ok) throw new Error('Shipment tracking record not found');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex flex-col justify-center items-center text-xs font-mono text-slate-400">
        Fetching live shipment tracking checkpoints...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex flex-col justify-center items-center p-4 font-sans text-slate-900">
        <div className="max-w-md bg-white border border-slate-200/90 shadow-saas rounded-3xl p-8 text-center space-y-4">
          <XCircle className="w-12 h-12 text-[#D14343] mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Shipment Not Found</h1>
          <p className="text-xs text-slate-500 font-medium">
            We couldn't locate any shipment matching reference LR/Waybill "{id}". Please verify your number.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              href="/tracking"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-xl shadow-saas"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Tracking Search</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isDelivered = data.status === 'Delivered';
  const isVoided = data.status === 'Voided';

  return (
    <div className="min-h-screen bg-[#F6F8FB] font-sans text-slate-900 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/tracking"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200/80 px-3.5 py-2 rounded-xl shadow-xs transition-saas"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
            <span>Search Another Package</span>
          </Link>

          <Link href="/login" className="text-xs font-semibold text-[#2563EB] hover:underline">
            Staff Sign In
          </Link>
        </div>

        {/* Unified Tracking Card */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-saas space-y-6">
          {/* Docket header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-[#EEF4FF] rounded-2xl flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-[#2563EB]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base text-slate-900 leading-tight">Docket #{data.docket_no}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                      isDelivered
                        ? 'bg-[#E8F7EF] text-[#1F8A4C] border border-emerald-200/60'
                        : isVoided
                        ? 'bg-[#FDECEC] text-[#D14343] border border-red-200/60'
                        : 'bg-[#EEF4FF] text-[#2563EB] border border-blue-200/60'
                    }`}
                  >
                    {isDelivered && <CheckCircle2 className="w-3 h-3" />}
                    {isVoided && <XCircle className="w-3 h-3" />}
                    {!isDelivered && !isVoided && <Truck className="w-3 h-3" />}
                    <span>{data.status}</span>
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {data.from_city} <ArrowLeft className="w-3 h-3 inline rotate-180 -mt-0.5" /> {data.to_city}
                  {' · '}{data.transport_mode} Freight
                </span>
              </div>
            </div>
            <img src="/rudra-logo.png" alt="Rudra Cargo" className="w-9 h-9 object-contain rounded-xl border border-slate-200/80 p-1 shrink-0" />
          </div>

          {/* Pictorial Progress Stepper */}
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-3">Delivery Progress</h2>
            <ShipmentStepper status={data.status} checkpoints={data.checkpoints || []} />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/80 rounded-2xl p-4">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Booking Date</span>
              <span className="text-xs font-bold text-slate-900">
                {new Date(data.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Courier</span>
              <span className="text-xs font-bold text-slate-900">{data.courier_partner}</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Waybill No.</span>
              <span className="text-xs font-bold text-slate-900">{data.tracking_no}</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Consignee</span>
              <span className="text-xs font-bold text-slate-900">{data.consignee_name}</span>
            </div>
          </div>

          {/* Shipment Summary */}
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-3">Shipment Summary</h2>
            <div className="bg-slate-50/80 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Origin</span>
                <span className="font-bold text-slate-900">{data.from_city} · {data.consignor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Destination</span>
                <span className="font-bold text-slate-900">{data.to_city} · {data.consignee_name}</span>
              </div>
              <div className="border-t border-slate-200/80 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Packages</span>
                <span className="font-bold text-slate-900">{data.package_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Charged Weight</span>
                <span className="font-bold text-slate-900">{data.charged_weight_kg} kg</span>
              </div>
            </div>
          </div>

          {/* Consignment Info */}
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-3">Consignment Info</h2>
            <div className="flex items-center justify-between gap-3 bg-slate-50/80 rounded-2xl p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-white border border-slate-200/80 rounded-xl flex items-center justify-center shrink-0">
                  <Box className="w-5 h-5 text-slate-400" />
                </div>
                <span className="text-xs font-bold text-slate-900 truncate">{data.goods_description}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">Qty: {data.package_count}</span>
            </div>
          </div>
        </div>

        {/* Tracking Timeline */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Shipment Progress Timeline</h2>

          {data.checkpoints && data.checkpoints.length > 0 ? (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {data.checkpoints.map((cp: any, idx: number) => {
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
    </div>
  );
}
