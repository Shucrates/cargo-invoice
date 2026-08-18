'use client';

import { useState } from 'react';
import { CargoDocket } from '@/types/cargo';
import { IndianRupee, FileText, Weight, TrendingUp, Wallet, Clock } from 'lucide-react';

const WEIGHT_DISCREPANCY_THRESHOLD = 0.15; // 15% discrepancy alert threshold

export default function KpiStats({ dockets }: { dockets: CargoDocket[] }) {
  const [timeScope, setTimeScope] = useState<'today' | 'this_month' | 'all_time'>('this_month');

  // Filter dockets by selected dashboard time-scope
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const scopedDockets = dockets.filter((d) => {
    if (timeScope === 'today') {
      return d.booking_date === todayStr;
    }
    if (timeScope === 'this_month') {
      const dDate = new Date(d.booking_date);
      return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear();
    }
    return true; // all_time
  });

  // Active (issued) and Voided subsets
  const activeDockets = scopedDockets.filter((d) => d.status === 'issued');
  const voidedDockets = scopedDockets.filter((d) => d.status === 'voided');

  // Revenue & Tax
  const totalRevenue = activeDockets.reduce((sum, d) => sum + (d.grand_total || 0), 0);
  const totalSubtotal = activeDockets.reduce((sum, d) => sum + (d.subtotal || 0), 0);
  const totalGST = activeDockets.reduce((sum, d) => sum + (d.gst_amount || 0), 0);

  // Voided Analytics
  const voidedCount = voidedDockets.length;
  const voidedValue = voidedDockets.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  // Freight Weight Analytics
  const totalChargedWeight = activeDockets.reduce((sum, d) => sum + (d.charged_weight_kg || 0), 0);
  const totalActualWeight = activeDockets.reduce((sum, d) => sum + (d.actual_weight_kg || 0), 0);
  
  const weightDiscrepancyRatio = totalChargedWeight > 0 
    ? Math.abs(totalChargedWeight - totalActualWeight) / totalChargedWeight 
    : 0;
  const isHighDiscrepancy = weightDiscrepancyRatio > WEIGHT_DISCREPANCY_THRESHOLD;

  // Yield / Rev per kg
  const avgYieldPerKg = totalChargedWeight > 0 ? totalRevenue / totalChargedWeight : 0;

  // Separated Payment Mode Receivables
  const toPayTotal = activeDockets
    .filter((d) => d.payment_mode === 'To Pay')
    .reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const creditTotal = activeDockets
    .filter((d) => d.payment_mode === 'Credit')
    .reduce((sum, d) => sum + (d.grand_total || 0), 0);

  return (
    <div className="space-y-5">
      {/* Top Dashboard Period Time-Scope Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-slate-200/80 rounded-2xl p-4 shadow-saas gap-3">
        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
          <Clock className="w-4 h-4 text-[#2563EB]" />
          <span>Dashboard Scope:</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F8FAFC] p-1 rounded-xl border border-slate-200/80 text-xs font-medium">
          <button
            onClick={() => setTimeScope('today')}
            className={`px-3.5 py-1.5 rounded-lg transition-saas cursor-pointer ${
              timeScope === 'today'
                ? 'bg-[#2563EB] text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeScope('this_month')}
            className={`px-3.5 py-1.5 rounded-lg transition-saas cursor-pointer ${
              timeScope === 'this_month'
                ? 'bg-[#2563EB] text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setTimeScope('all_time')}
            className={`px-3.5 py-1.5 rounded-lg transition-saas cursor-pointer ${
              timeScope === 'all_time'
                ? 'bg-[#2563EB] text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* 6 Executive KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Total Billed Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Billed Revenue</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-medium flex items-center gap-2 border-t border-slate-100 pt-3">
            <span>Subtotal: ₹{totalSubtotal.toFixed(0)}</span>
            <span>•</span>
            <span>GST: ₹{totalGST.toFixed(0)}</span>
          </div>
        </div>

        {/* Card 2: Total Dockets Issued & Voided Value */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Dockets</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                {activeDockets.length} <span className="text-xs font-medium text-slate-400 font-sans">issued</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-medium border-t border-slate-100 pt-3 flex justify-between">
            <span>Active: {activeDockets.length}</span>
            <span className={voidedCount > 0 ? 'text-[#D14343] font-semibold' : 'text-slate-400 font-medium'}>
              {voidedCount} Voided · ₹{voidedValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Card 3: Charged Freight Volume & Discrepancy Alert */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Charged Freight Volume</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                {totalChargedWeight.toLocaleString()}{' '}
                <span className="text-xs font-medium text-slate-400 font-sans">kg</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FFF6DD] text-[#B7791F] flex items-center justify-center font-bold">
              <Weight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs font-medium border-t border-slate-100 pt-3 flex justify-between">
            <span className={isHighDiscrepancy ? 'text-[#B7791F] font-semibold' : 'text-slate-500'}>
              Actual: {totalActualWeight.toFixed(1)} kg · Charged: {totalChargedWeight.toFixed(1)} kg
            </span>
          </div>
        </div>

        {/* Card 4: Avg Revenue / kg (Yield) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Revenue / kg (Yield)</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                ₹{avgYieldPerKg.toFixed(2)}{' '}
                <span className="text-xs font-medium text-slate-400 font-sans">/ kg</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#E8F7EF] text-[#1F8A4C] flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-medium border-t border-slate-100 pt-3">
            <span>Derived: ₹{totalRevenue.toFixed(0)} / {totalChargedWeight.toFixed(1)} kg</span>
          </div>
        </div>

        {/* Card 5: To Pay Total Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To Pay Total</p>
              <h3 className="text-2xl font-bold text-[#2563EB] font-mono mt-1.5 tracking-tight">
                ₹{toPayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] text-[#2563EB] flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-medium border-t border-slate-100 pt-3">
            <span>Collected on delivery — low risk</span>
          </div>
        </div>

        {/* Card 6: Credit Total Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credit Total</p>
              <h3 className="text-2xl font-bold text-[#B7791F] font-mono mt-1.5 tracking-tight">
                ₹{creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FFF6DD] text-[#B7791F] flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-medium border-t border-slate-100 pt-3">
            <span>Extended terms — outstanding receivables</span>
          </div>
        </div>
      </div>
    </div>
  );
}

