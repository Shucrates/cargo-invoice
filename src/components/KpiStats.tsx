'use client';

import { CargoDocket } from '@/types/cargo';
import { IndianRupee, FileText, Weight, Wallet } from 'lucide-react';

export default function KpiStats({ dockets }: { dockets: CargoDocket[] }) {
  // Calculate metrics
  const activeDockets = dockets.filter(d => d.status === 'issued');
  const voidedCount = dockets.filter(d => d.status === 'voided').length;

  const totalRevenue = activeDockets.reduce((sum, d) => sum + (d.grand_total || 0), 0);
  const totalSubtotal = activeDockets.reduce((sum, d) => sum + (d.subtotal || 0), 0);
  const totalGST = activeDockets.reduce((sum, d) => sum + (d.gst_amount || 0), 0);
  const totalWeight = activeDockets.reduce((sum, d) => sum + (d.charged_weight_kg || 0), 0);

  const pendingCollection = activeDockets
    .filter(d => d.payment_mode === 'To Pay' || d.payment_mode === 'Credit')
    .reduce((sum, d) => sum + (d.grand_total || 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Revenue Card */}
      <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Billed Revenue</p>
            <h3 className="text-2xl font-extrabold text-[#1C3E4E] font-mono mt-1">
              ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#1C3E4E]/10 text-[#1C3E4E] flex items-center justify-center font-bold">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 font-medium flex items-center gap-2 border-t border-[#E2DDDA] pt-2">
          <span>Subtotal: ₹{totalSubtotal.toFixed(0)}</span>
          <span>•</span>
          <span>GST: ₹{totalGST.toFixed(0)}</span>
        </div>
      </div>

      {/* 2. Total Dockets Issued Card */}
      <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Dockets</p>
            <h3 className="text-2xl font-extrabold text-[#111111] font-mono mt-1">
              {activeDockets.length} <span className="text-xs font-semibold text-slate-400">issued</span>
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1C3E4E] flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2 flex justify-between">
          <span>Active Records: {activeDockets.length}</span>
          {voidedCount > 0 && <span className="text-red-600 font-semibold">{voidedCount} Voided</span>}
        </div>
      </div>

      {/* 3. Total Freight Volume Card */}
      <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Charged Freight Volume</p>
            <h3 className="text-2xl font-extrabold text-[#111111] font-mono mt-1">
              {totalWeight.toLocaleString()} <span className="text-xs font-semibold text-slate-500">kg</span>
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
            <Weight className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2">
          <span>Avg Wt: {(activeDockets.length ? (totalWeight / activeDockets.length) : 0).toFixed(1)} kg / docket</span>
        </div>
      </div>

      {/* 4. Pending To-Pay Collection Card */}
      <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">To-Pay / Credit Total</p>
            <h3 className="text-2xl font-extrabold text-[#60899B] font-mono mt-1">
              ₹{pendingCollection.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-[#60899B] flex items-center justify-center font-bold">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2">
          <span>Collection pending on delivery</span>
        </div>
      </div>
    </div>
  );
}
