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
    <div className="space-y-4">
      {/* Top Dashboard Period Time-Scope Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-[#CECAC8] rounded-xl px-5 py-3 shadow-sm gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
          <Clock className="w-4 h-4 text-[#1C3E4E]" />
          <span>Dashboard Period:</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setTimeScope('today')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              timeScope === 'today'
                ? 'bg-[#1C3E4E] text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeScope('this_month')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              timeScope === 'this_month'
                ? 'bg-[#1C3E4E] text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setTimeScope('all_time')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              timeScope === 'all_time'
                ? 'bg-[#1C3E4E] text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* 6 Executive KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Total Billed Revenue */}
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

        {/* Card 2: Total Dockets Issued & Voided Value */}
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
            <span>Active: {activeDockets.length}</span>
            <span className={voidedCount > 0 ? 'text-red-600 font-bold' : 'text-slate-400 font-semibold'}>
              {voidedCount} Voided · ₹{voidedValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Card 3: Charged Freight Volume & Discrepancy Alert */}
        <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Charged Freight Volume</p>
              <h3 className="text-2xl font-extrabold text-[#111111] font-mono mt-1">
                {totalChargedWeight.toLocaleString()}{' '}
                <span className="text-xs font-semibold text-slate-500">kg</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
              <Weight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-medium border-t border-[#E2DDDA] pt-2 flex justify-between">
            <span className={isHighDiscrepancy ? 'text-amber-600 font-bold' : 'text-slate-500'}>
              Actual: {totalActualWeight.toFixed(1)} kg · Charged: {totalChargedWeight.toFixed(1)} kg
            </span>
          </div>
        </div>

        {/* Card 4: Avg Revenue / kg (Yield) */}
        <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Revenue / kg (Yield)</p>
              <h3 className="text-2xl font-extrabold text-[#1C3E4E] font-mono mt-1">
                ₹{avgYieldPerKg.toFixed(2)}{' '}
                <span className="text-xs font-semibold text-slate-500">/ kg</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2">
            <span>Derived: ₹{totalRevenue.toFixed(0)} / {totalChargedWeight.toFixed(1)} kg</span>
          </div>
        </div>

        {/* Card 5: To Pay Total Card */}
        <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">To Pay Total</p>
              <h3 className="text-2xl font-extrabold text-[#2563EB] font-mono mt-1">
                ₹{toPayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2">
            <span>Collected on delivery — low risk</span>
          </div>
        </div>

        {/* Card 6: Credit Total Card */}
        <div className="bg-white border border-[#CECAC8] rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-[#1C3E4E] transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Credit Total</p>
              <h3 className="text-2xl font-extrabold text-[#D97706] font-mono mt-1">
                ₹{creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-medium border-t border-[#E2DDDA] pt-2">
            <span>Extended terms — outstanding receivables</span>
          </div>
        </div>
      </div>
    </div>
  );
}
