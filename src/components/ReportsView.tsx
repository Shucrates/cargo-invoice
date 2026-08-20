'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Calendar,
  Filter,
  FileSpreadsheet,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Receipt,
  Truck,
  RotateCcw,
  Building2,
  TrendingUp,
  ChevronUp,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CargoDocket, Customer } from '@/types/cargo';
import { downloadCSV, exportSummaryPDF } from '@/lib/exportUtils';
import { companyConfig } from '@/lib/companyConfig';

export interface CashPayment {
  id: string;
  docket_id: string;
  docket_no: string;
  amount: number;
  method: string;
  paid_at: string;
  notes: string;
  recorded_by_name: string;
}

interface ReportsViewProps {
  dockets: CargoDocket[];
  cashLog?: CashPayment[];
  customers?: Customer[];
}

export type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_fy'
  | 'all'
  | 'custom';

function getPresetDates(preset: PeriodPreset): { start: string; end: string; label: string } {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];

  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  if (preset === 'this_month') {
    const start = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0];
    const label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { start, end, label: `This Month (${label})` };
  }

  if (preset === 'last_month') {
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
    const lastMonthDate = new Date(Date.UTC(y, m - 1, 1));
    const label = lastMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { start, end, label: `Last Month (${label})` };
  }

  if (preset === 'last_30_days') {
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: past30.toISOString().split('T')[0], end: todayISO, label: 'Last 30 Days' };
  }

  if (preset === 'last_90_days') {
    const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start: past90.toISOString().split('T')[0], end: todayISO, label: 'Last 90 Days (Quarter)' };
  }

  if (preset === 'this_fy') {
    // Indian Financial Year: April 1 to March 31
    const fyStartYear = m >= 3 ? y : y - 1;
    const fyEndYear = fyStartYear + 1;
    const start = `${fyStartYear}-04-01`;
    const end = `${fyEndYear}-03-31`;
    return { start, end, label: `Financial Year ${fyStartYear}-${String(fyEndYear).slice(2)}` };
  }

  if (preset === 'all') {
    return { start: '', end: '', label: 'All Time' };
  }

  return { start: '', end: '', label: 'Custom Date Range' };
}

export default function ReportsView({ dockets, cashLog = [] }: ReportsViewProps) {
  // Statement Filter States
  const [showFilters, setShowFilters] = useState(false);
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const initialDates = getPresetDates('this_month');
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [paymentModeFilter, setPaymentModeFilter] = useState<'all' | 'Paid' | 'To Pay' | 'Credit'>('all');
  const [transportModeFilter, setTransportModeFilter] = useState<'all' | 'Road' | 'Air' | 'Train'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'voided'>('issued');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeReportTab, setActiveReportTab] = useState<'statement' | 'cash'>('statement');

  const handlePresetChange = (newPreset: PeriodPreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const dates = getPresetDates(newPreset);
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
  };

  const handleResetFilters = () => {
    handlePresetChange('this_month');
    setPaymentModeFilter('all');
    setTransportModeFilter('all');
    setStatusFilter('issued');
    setSearchQuery('');
  };

  // Filtered dataset
  const filteredDockets = useMemo(() => {
    return dockets.filter((d) => {
      // Date bounds
      if (startDate && d.booking_date < startDate) return false;
      if (endDate && d.booking_date > endDate) return false;

      // Status
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;

      // Payment Mode
      if (paymentModeFilter !== 'all' && d.payment_mode !== paymentModeFilter) return false;

      // Transport Mode
      if (transportModeFilter !== 'all' && d.transport_mode !== transportModeFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          d.docket_no.toLowerCase().includes(q) ||
          d.consignor_name.toLowerCase().includes(q) ||
          d.consignee_name.toLowerCase().includes(q) ||
          (d.consignor_gstin && d.consignor_gstin.toLowerCase().includes(q)) ||
          (d.consignee_gstin && d.consignee_gstin.toLowerCase().includes(q)) ||
          d.from_city.toLowerCase().includes(q) ||
          d.to_city.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [dockets, startDate, endDate, statusFilter, paymentModeFilter, transportModeFilter, searchQuery]);

  // Financial aggregates for the filtered statement
  const metrics = useMemo(() => {
    const active = filteredDockets.filter((d) => d.status === 'issued');
    const totalGrand = active.reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
    const totalSub = active.reduce((sum, d) => sum + (Number(d.subtotal) || 0), 0);
    const totalTax = active.reduce((sum, d) => sum + (Number(d.gst_amount) || 0), 0);
    const totalWeight = active.reduce((sum, d) => sum + (Number(d.charged_weight_kg) || 0), 0);
    const paidSum = active
      .filter((d) => d.payment_mode === 'Paid')
      .reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
    const pendingSum = active
      .filter((d) => d.payment_mode === 'To Pay' || d.payment_mode === 'Credit')
      .reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);

    return {
      count: filteredDockets.length,
      activeCount: active.length,
      voidedCount: filteredDockets.length - active.length,
      totalGrand,
      totalSub,
      totalTax,
      totalWeight,
      paidSum,
      pendingSum,
    };
  }, [filteredDockets]);

  // Filtered Cash Log
  const filteredCashLog = useMemo(() => {
    return cashLog.filter((c) => {
      const dateStr = c.paid_at.split('T')[0];
      if (startDate && dateStr < startDate) return false;
      if (endDate && dateStr > endDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.docket_no.toLowerCase().includes(q) ||
          (c.notes && c.notes.toLowerCase().includes(q)) ||
          (c.recorded_by_name && c.recorded_by_name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [cashLog, startDate, endDate, searchQuery]);

  const totalCashCollected = useMemo(() => {
    return filteredCashLog.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [filteredCashLog]);

  // Export handlers
  const getFilterLabel = () => {
    if (preset === 'custom') {
      return `Statement_${startDate || 'start'}_to_${endDate || 'end'}`;
    }
    return getPresetDates(preset).label.replace(/[^a-zA-Z0-9]/g, '_');
  };

  const handleExportCSV = () => {
    if (filteredDockets.length === 0) {
      alert('No records matching the selected statement filters.');
      return;
    }
    downloadCSV(
      [
        'Docket No',
        'Booking Date',
        'Status',
        'Transport Mode',
        'Origin City (From)',
        'Destination City (To)',
        'Consignor Name',
        'Consignor GSTIN',
        'Consignee Name',
        'Consignee GSTIN',
        'Charged Weight (kg)',
        'Taxable Subtotal (INR)',
        'GST Rate (%)',
        'GST Amount (INR)',
        'Grand Total (INR)',
        'Payment Mode',
        'Delivery Status',
      ],
      filteredDockets.map((d) => [
        d.docket_no,
        d.booking_date,
        d.status.toUpperCase(),
        d.transport_mode,
        d.from_city,
        d.to_city,
        d.consignor_name,
        d.consignor_gstin || 'N/A',
        d.consignee_name,
        d.consignee_gstin || 'N/A',
        Number(d.charged_weight_kg || 0).toFixed(2),
        Number(d.subtotal || 0).toFixed(2),
        Number(d.gst_percentage ?? 18),
        Number(d.gst_amount || 0).toFixed(2),
        Number(d.grand_total || 0).toFixed(2),
        d.payment_mode,
        d.delivery_status || 'booked',
      ]),
      `Statement_GSTR1_${getFilterLabel()}.csv`
    );
  };

  const handleExportPDF = () => {
    if (filteredDockets.length === 0) {
      alert('No records matching the selected statement filters.');
      return;
    }
    const label =
      preset === 'custom'
        ? `${startDate || 'Start'} to ${endDate || 'Present'}`
        : getPresetDates(preset).label;
    exportSummaryPDF(filteredDockets, label);
  };

  const handleExportCashCSV = () => {
    if (filteredCashLog.length === 0) {
      alert('No cash records matching the selected filters.');
      return;
    }
    downloadCSV(
      ['Docket / LR No', 'Payment Date', 'Amount (INR)', 'Method', 'Recorded By', 'Notes'],
      filteredCashLog.map((c) => [
        c.docket_no,
        c.paid_at.split('T')[0],
        Number(c.amount || 0).toFixed(2),
        c.method,
        c.recorded_by_name || 'Staff',
        c.notes || '',
      ]),
      `Cash_Statement_${getFilterLabel()}.csv`
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financial Reports & Statements</h1>
          <p className="text-xs text-slate-500 mt-1">
            Filter transactions by date period, payment mode, or party, and download customized GST & bank statements.
          </p>
        </div>

        {/* Download Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="gap-2 text-xs font-semibold rounded-xl bg-white border-slate-200 hover:bg-slate-50 shadow-2xs h-10 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Download CSV</span>
          </Button>

          <Button
            onClick={handleExportPDF}
            className="gap-2 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas h-10 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </Button>
        </div>
      </div>

      {/* Collapsible Statement Filter Panel */}
      {showFilters ? (
        <Card className="p-5 space-y-4 border border-slate-200/90 rounded-2xl bg-white shadow-saas animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#0A2030]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Custom Statement Filters</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
              <button
                onClick={() => setShowFilters(false)}
                title="Hide Filters"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 1. Period Presets (Quick Banking Chips) */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
              Statement Period
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'last_30_days', label: 'Last 30 Days' },
                  { id: 'last_90_days', label: 'Last 90 Days' },
                  { id: 'this_fy', label: 'Current FY' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom Range' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePresetChange(item.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    preset === item.id
                      ? 'bg-[#0A2030] text-white shadow-saas'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Custom Date Range Pickers & Filter Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">From Date</label>
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPreset('custom');
                  }}
                  className="text-xs h-9 bg-slate-50/70 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">To Date</label>
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPreset('custom');
                  }}
                  className="text-xs h-9 bg-slate-50/70 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Payment Mode</label>
              <select
                value={paymentModeFilter}
                onChange={(e) => setPaymentModeFilter(e.target.value as any)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0A2030]"
              >
                <option value="all">All Payment Modes</option>
                <option value="Paid">Paid</option>
                <option value="To Pay">To Pay</option>
                <option value="Credit">Credit</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Transport Mode</label>
              <select
                value={transportModeFilter}
                onChange={(e) => setTransportModeFilter(e.target.value as any)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0A2030]"
              >
                <option value="all">All Transport Modes</option>
                <option value="Road">Road</option>
                <option value="Air">Air</option>
                <option value="Train">Train</option>
              </select>
            </div>
          </div>

          {/* 3. Search Bar */}
          <div className="pt-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5 pointer-events-none" />
              <Input
                placeholder="Search by Party Name, GSTIN, Docket Number, or Destination..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-xs h-9 bg-slate-50/50"
              />
            </div>
          </div>
        </Card>
      ) : (
        /* Collapsed Active Filters Pill Strip */
        <div className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-500 font-medium">Applied Statement Filter:</span>
            <span className="px-2.5 py-1 rounded-lg bg-[#0A2030]/10 text-[#0A2030] font-semibold border border-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {getPresetDates(preset).label}
            </span>
            {paymentModeFilter !== 'all' && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                Mode: {paymentModeFilter}
              </span>
            )}
            {transportModeFilter !== 'all' && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold">
                Transport: {transportModeFilter}
              </span>
            )}
            {searchQuery && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                Search: &ldquo;{searchQuery}&rdquo;
              </span>
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFilters(true)}
            className="text-xs text-[#0A2030] hover:text-[#071520] hover:bg-[#0A2030]/10 font-semibold h-7 px-2.5 cursor-pointer"
          >
            Edit Filters
          </Button>
        </div>
      )}

      {/* Real-time Filtered Statement KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gross Billing Revenue</div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono tracking-tight">
            ₹{metrics.totalGrand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">
            {metrics.activeCount} active dockets
          </div>
        </Card>

        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxable Subtotal</div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono tracking-tight">
            ₹{metrics.totalSub.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">Freight & tariff sum</div>
        </Card>

        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GST Output Tax (18%)</div>
          <div className="text-2xl font-bold text-[#0A2030] mt-2 font-mono tracking-tight">
            ₹{metrics.totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">Output tax liability</div>
        </Card>

        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paid Collections</div>
          <div className="text-2xl font-bold text-[#1F8A4C] mt-2 font-mono tracking-tight">
            ₹{metrics.paidSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium flex items-center justify-between gap-1.5 min-w-0">
            <span className="truncate">Due:</span>
            <span className="font-semibold text-[#D14343] font-mono shrink-0">
              ₹{metrics.pendingSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </Card>
      </div>

      {/* View Switcher: Statement Audit vs. Cash Transactions */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveReportTab('statement')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'statement'
              ? 'bg-[#0A2030] text-white shadow-saas'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Statement Dockets ({filteredDockets.length})</span>
        </button>

        <button
          onClick={() => setActiveReportTab('cash')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeReportTab === 'cash'
              ? 'bg-[#0A2030] text-white shadow-saas'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Cash Transactions Log ({filteredCashLog.length})</span>
        </button>

        {activeReportTab === 'cash' && (
          <Button
            size="sm"
            onClick={handleExportCashCSV}
            className="ml-auto text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Cash CSV</span>
          </Button>
        )}
      </div>

      {/* Main Statement Table */}
      {activeReportTab === 'statement' ? (
        <Card className="shadow-saas p-0 overflow-hidden border border-slate-200/90 rounded-2xl bg-white">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Filtered GSTR-1 Statement Preview
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Showing {filteredDockets.length} record{filteredDockets.length === 1 ? '' : 's'} matching current criteria
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-slate-700">
              Total: ₹{metrics.totalGrand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-500 font-semibold tracking-wider text-xs sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="px-5 py-3.5">DOCKET NO</th>
                  <th className="px-5 py-3.5">DATE</th>
                  <th className="px-5 py-3.5">PARTY (CONSIGNOR)</th>
                  <th className="px-5 py-3.5">GSTIN</th>
                  <th className="px-5 py-3.5">ROUTE</th>
                  <th className="px-5 py-3.5 text-right">TAXABLE</th>
                  <th className="px-5 py-3.5 text-right">GST (18%)</th>
                  <th className="px-5 py-3.5 text-right">TOTAL</th>
                  <th className="px-5 py-3.5">MODE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDockets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-xs">
                      <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p>No dockets found matching the selected statement filters.</p>
                    </td>
                  </tr>
                ) : (
                  filteredDockets.map((d) => (
                    <tr key={d.id} className="hover:bg-[#F8FAFC] transition-saas h-12">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">{d.docket_no}</td>
                      <td className="px-5 py-3 text-slate-500 font-medium">{d.booking_date}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900 max-w-[180px] truncate">
                        {d.consignor_name}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500">{d.consignor_gstin || 'N/A'}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {d.from_city} → {d.to_city}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">
                        ₹{Number(d.subtotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[#0A2030]">
                        ₹{Number(d.gst_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                        ₹{Number(d.grand_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={
                            d.payment_mode === 'Paid'
                              ? 'success'
                              : d.payment_mode === 'Credit'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {d.payment_mode}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Cash Transactions Table */
        <Card className="shadow-saas p-0 overflow-hidden border border-slate-200/90 rounded-2xl bg-white">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Filtered Cash Payments Log
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every cash collection recorded in the filtered date period
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-600">
              Total Cash: ₹{totalCashCollected.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-500 font-semibold tracking-wider text-xs sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="px-5 py-3.5">LR NO</th>
                  <th className="px-5 py-3.5">DATE</th>
                  <th className="px-5 py-3.5 text-right">AMOUNT</th>
                  <th className="px-5 py-3.5">RECORDED BY</th>
                  <th className="px-5 py-3.5">NOTES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCashLog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-xs">
                      <IndianRupee className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p>No cash payments recorded for this period.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCashLog.map((c) => (
                    <tr key={c.id} className="hover:bg-[#F8FAFC] transition-saas h-12">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">{c.docket_no}</td>
                      <td className="px-5 py-3 text-slate-500 font-medium">{c.paid_at.split('T')[0]}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600">
                        ₹{Number(c.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-700">{c.recorded_by_name || 'Staff'}</td>
                      <td className="px-5 py-3 text-slate-500 italic">{c.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
