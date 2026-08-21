'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
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
  TrendingDown,
  ChevronUp,
  ChevronDown,
  X,
  Wallet,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  BarChart3,
  Loader2,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CargoDocket, Customer, ExpenseLedger, Bill } from '@/types/cargo';
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
  | 'last_6_months'
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
    return { start: past90.toISOString().split('T')[0], end: todayISO, label: 'Last 3 Months (Quarter)' };
  }

  if (preset === 'last_6_months') {
    const past180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    return { start: past180.toISOString().split('T')[0], end: todayISO, label: 'Last 6 Months' };
  }

  if (preset === 'this_fy') {
    // Indian Financial Year: April 1 to March 31
    const fyStartYear = m >= 3 ? y : y - 1;
    const fyEndYear = fyStartYear + 1;
    const start = `${fyStartYear}-04-01`;
    const end = `${fyEndYear}-03-31`;
    return { start, end, label: `FY ${fyStartYear}-${String(fyEndYear).slice(2)}` };
  }

  if (preset === 'all') {
    return { start: '', end: '', label: 'All Time' };
  }

  return { start: '', end: '', label: 'Custom Date Range' };
}

function getBillPaymentInfo(bill: Bill, dockets: CargoDocket[]) {
  const grandTotal = Number(bill.grand_total || 0);
  let received = 0;

  if (bill.docket_ids && bill.docket_ids.length > 0) {
    received = bill.docket_ids.reduce((sum: number, id: string) => {
      const d = dockets.find((item) => item.id === id || item.docket_no === id);
      if (!d) return sum;
      const paid = Number(d.amount_paid ?? (d.payment_mode === 'Paid' ? d.grand_total : 0)) || 0;
      return sum + paid;
    }, 0);
  }

  const finalReceived = Math.min(grandTotal, Math.max(0, received));
  const pending = Math.max(0, grandTotal - finalReceived);

  let status: 'paid' | 'partial' | 'pending' = 'pending';
  if (pending <= 0 && grandTotal > 0) {
    status = 'paid';
  } else if (finalReceived > 0) {
    status = 'partial';
  }

  return {
    grandTotal,
    received: finalReceived,
    pending,
    status,
  };
}

const getPaymentBadgeStyle = (mode: string) => {
  switch (mode) {
    case 'Credit':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    case 'To Pay':
      return 'bg-blue-50 text-blue-800 border border-blue-200';
    case 'Paid':
      return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
};

export default function ReportsView({ dockets, cashLog = [], customers = [] }: ReportsViewProps) {
  // Remote datasets
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenseLedgers, setExpenseLedgers] = useState<ExpenseLedger[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(true);

  // Active Report Tab
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'lrs' | 'bills' | 'expenses' | 'cash'>('overview');

  // Master Period Filter
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const initialDates = getPresetDates('this_month');
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [searchQuery, setSearchQuery] = useState('');

  // Secondary Filter States
  const [lrStatusFilter, setLrStatusFilter] = useState<'all' | 'issued' | 'voided'>('issued');
  const [lrPaymentModeFilter, setLrPaymentModeFilter] = useState<'all' | 'Paid' | 'To Pay' | 'Credit'>('all');
  const [lrTransportModeFilter, setLrTransportModeFilter] = useState<'all' | 'Road' | 'Air' | 'Train'>('all');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | 'paid' | 'partial' | 'pending'>('all');

  // Fetch Bills and Expense Ledgers
  useEffect(() => {
    let isMounted = true;
    setLoadingRemote(true);

    Promise.all([
      fetch('/api/billing?limit=500').then((r) => (r.ok ? r.json() : { bills: [] })),
      fetch('/api/expenses?limit=500').then((r) => (r.ok ? r.json() : { ledgers: [] })),
    ])
      .then(([billsRes, expensesRes]) => {
        if (isMounted) {
          setBills(billsRes.bills || []);
          setExpenseLedgers(expensesRes.ledgers || []);
          setLoadingRemote(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load reports remote data:', err);
        if (isMounted) setLoadingRemote(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
    setSearchQuery('');
    setLrStatusFilter('issued');
    setLrPaymentModeFilter('all');
    setLrTransportModeFilter('all');
    setBillStatusFilter('all');
  };

  // =========================================================
  // FILTERED DATASETS
  // =========================================================

  // 1. Filtered LRs (Dockets)
  const filteredDockets = useMemo(() => {
    return dockets.filter((d) => {
      // Date bounds
      if (startDate && d.booking_date < startDate) return false;
      if (endDate && d.booking_date > endDate) return false;

      // Status
      if (lrStatusFilter !== 'all' && d.status !== lrStatusFilter) return false;

      // Payment Mode
      if (lrPaymentModeFilter !== 'all' && d.payment_mode !== lrPaymentModeFilter) return false;

      // Transport Mode
      if (lrTransportModeFilter !== 'all' && d.transport_mode !== lrTransportModeFilter) return false;

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
  }, [dockets, startDate, endDate, lrStatusFilter, lrPaymentModeFilter, lrTransportModeFilter, searchQuery]);

  // 2. Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Date bounds
      if (startDate && b.invoice_date < startDate) return false;
      if (endDate && b.invoice_date > endDate) return false;

      // Payment status
      if (billStatusFilter !== 'all') {
        const pay = getBillPaymentInfo(b, dockets);
        if (pay.status !== billStatusFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.bill_no.toLowerCase().includes(q) ||
          b.customer_name.toLowerCase().includes(q) ||
          b.invoice_date.includes(q) ||
          (b.customer_gstin && b.customer_gstin.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [bills, startDate, endDate, billStatusFilter, searchQuery, dockets]);

  // 3. Filtered Expense Ledgers
  const filteredExpenses = useMemo(() => {
    return expenseLedgers.filter((l) => {
      // Date bounds based on period_start / period_end
      if (startDate && l.period_end < startDate) return false;
      if (endDate && l.period_start > endDate) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          l.ledger_no.toLowerCase().includes(q) ||
          (l.label && l.label.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          (l.created_by_name && l.created_by_name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [expenseLedgers, startDate, endDate, searchQuery]);

  // 4. Filtered Cash Log
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

  // =========================================================
  // AGGREGATES & EXECUTIVE FINANCIAL METRICS
  // =========================================================

  // LR Aggregates
  const lrMetrics = useMemo(() => {
    const active = filteredDockets.filter((d) => d.status === 'issued');
    const totalGrand = active.reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
    const totalSub = active.reduce((sum, d) => sum + (Number(d.subtotal) || 0), 0);
    const totalTax = active.reduce((sum, d) => sum + (Number(d.gst_amount) || 0), 0);
    const totalWeight = active.reduce((sum, d) => sum + (Number(d.charged_weight_kg) || 0), 0);
    const paidDirect = active
      .filter((d) => d.payment_mode === 'Paid')
      .reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
    const toPaySum = active
      .filter((d) => d.payment_mode === 'To Pay')
      .reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
    const creditSum = active
      .filter((d) => d.payment_mode === 'Credit')
      .reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);

    return {
      totalCount: filteredDockets.length,
      activeCount: active.length,
      voidedCount: filteredDockets.length - active.length,
      totalGrand,
      totalSub,
      totalTax,
      totalWeight,
      paidDirect,
      toPaySum,
      creditSum,
      pendingSum: toPaySum + creditSum,
    };
  }, [filteredDockets]);

  // Bill Aggregates
  const billMetrics = useMemo(() => {
    const totalGrand = filteredBills.reduce((sum, b) => sum + (Number(b.grand_total) || 0), 0);
    const totalSub = filteredBills.reduce((sum, b) => sum + (Number(b.subtotal) || 0), 0);
    const totalTax = filteredBills.reduce((sum, b) => sum + (Number(b.gst_amount) || 0), 0);
    const totalReceived = filteredBills.reduce((sum, b) => sum + getBillPaymentInfo(b, dockets).received, 0);
    const totalPending = filteredBills.reduce((sum, b) => sum + getBillPaymentInfo(b, dockets).pending, 0);

    const paidCount = filteredBills.filter((b) => getBillPaymentInfo(b, dockets).status === 'paid').length;
    const partialCount = filteredBills.filter((b) => getBillPaymentInfo(b, dockets).status === 'partial').length;
    const pendingCount = filteredBills.filter((b) => getBillPaymentInfo(b, dockets).status === 'pending').length;

    return {
      totalCount: filteredBills.length,
      totalGrand,
      totalSub,
      totalTax,
      totalReceived,
      totalPending,
      paidCount,
      partialCount,
      pendingCount,
    };
  }, [filteredBills, dockets]);

  // Expense Aggregates
  const expenseMetrics = useMemo(() => {
    const totalExpenses = filteredExpenses.reduce((sum, l) => sum + (Number(l.total_amount) || 0), 0);
    const totalEntries = filteredExpenses.reduce((sum, l) => sum + (l.entry_count || 0), 0);

    return {
      totalCount: filteredExpenses.length,
      totalExpenses,
      totalEntries,
      avgPerSheet: filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0,
    };
  }, [filteredExpenses]);

  // Cash Aggregates
  const totalCashCollected = useMemo(() => {
    return filteredCashLog.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [filteredCashLog]);

  // Overall Financial P&L
  const totalGrossRevenue = billMetrics.totalGrand > 0 ? billMetrics.totalGrand : lrMetrics.totalGrand;
  const totalOperationalExpenses = expenseMetrics.totalExpenses;
  const netOperatingProfit = totalGrossRevenue - totalOperationalExpenses;
  const profitMargin = totalGrossRevenue > 0 ? (netOperatingProfit / totalGrossRevenue) * 100 : 0;

  // Realized Cash Flow
  const totalInflowRealized = billMetrics.totalReceived > 0 ? billMetrics.totalReceived : lrMetrics.paidDirect;
  const netCashFlow = totalInflowRealized - totalOperationalExpenses;
  const totalOutstandingReceivables = billMetrics.totalPending > 0 ? billMetrics.totalPending : lrMetrics.pendingSum;

  // =========================================================
  // EXPORT HANDLERS
  // =========================================================
  const getFilterLabel = () => {
    if (preset === 'custom') {
      return `Statement_${startDate || 'start'}_to_${endDate || 'end'}`;
    }
    return getPresetDates(preset).label.replace(/[^a-zA-Z0-9]/g, '_');
  };

  // Master Report: Export a clean, unified tabular CSV report for accounting and tax filing
  const handleExportFullReportCSV = () => {
    const headers = [
      'Record Type',
      'Doc / Reference No',
      'Transaction Date',
      'Party / Customer / Entity',
      'GSTIN',
      'Origin / From',
      'Destination / To',
      'Service / Category / Mode',
      'Weight (kg)',
      'Taxable Subtotal (₹)',
      'GST Rate (%)',
      'GST Amount (₹)',
      'Grand Total (₹)',
      'Payment Mode / Method',
      'Status / Delivery',
    ];

    const rows: (string | number)[][] = [];

    // 1. LRs / Dockets
    filteredDockets.forEach((d) => {
      rows.push([
        'LR / Docket',
        d.docket_no,
        d.booking_date,
        d.consignor_name ? `${d.consignor_name} (To: ${d.consignee_name || 'N/A'})` : d.consignee_name || '',
        d.consignor_gstin || d.consignee_gstin || 'N/A',
        d.from_city || '',
        d.to_city || '',
        `${d.transport_mode || 'Road'} (${d.package_count || 1} pkgs)`,
        Number(d.charged_weight_kg || 0).toFixed(2),
        Number(d.subtotal || 0).toFixed(2),
        Number(d.gst_percentage ?? 18),
        Number(d.gst_amount || 0).toFixed(2),
        Number(d.grand_total || 0).toFixed(2),
        d.payment_mode || 'To-Pay',
        d.status === 'voided' ? `VOIDED (${d.void_reason || ''})` : (d.delivery_status || 'booked').toUpperCase(),
      ]);
    });

    // 2. Tax Invoices & Bills
    filteredBills.forEach((b) => {
      const pay = getBillPaymentInfo(b, dockets);
      rows.push([
        'Tax Invoice / Bill',
        b.bill_no,
        b.invoice_date,
        b.customer_name || '',
        b.customer_gstin || 'N/A',
        b.customer_address || '',
        b.category || 'General',
        `${b.doc_type === 'gst_invoice' ? 'GST Invoice' : 'Bill'} (${(b.docket_ids?.length || 0) + (b.items?.length || 0)} items)`,
        '',
        Number(b.subtotal || 0).toFixed(2),
        18,
        Number(b.gst_amount || 0).toFixed(2),
        pay.grandTotal.toFixed(2),
        `Paid: ₹${pay.received.toFixed(2)} | Pending: ₹${pay.pending.toFixed(2)}`,
        pay.status.toUpperCase(),
      ]);
    });

    // 3. Operating Expenses
    filteredExpenses.forEach((l) => {
      rows.push([
        'Operating Expense',
        l.ledger_no,
        l.period_start || l.created_at.split('T')[0],
        l.created_by_name || 'Staff',
        'N/A',
        l.label || '',
        l.notes || '',
        `Expense Sheet (${l.entry_count || 0} entries)`,
        '',
        Number(l.total_amount || 0).toFixed(2),
        0,
        '0.00',
        Number(l.total_amount || 0).toFixed(2),
        'Expense Outflow',
        'RECORDED',
      ]);
    });

    // 4. Cash Collections
    filteredCashLog.forEach((c) => {
      rows.push([
        'Cash Collection',
        c.docket_no,
        c.paid_at ? c.paid_at.split('T')[0] : '',
        c.recorded_by_name || 'Staff',
        'N/A',
        c.notes || '',
        '',
        `Direct Payment (${c.method})`,
        '',
        Number(c.amount || 0).toFixed(2),
        0,
        '0.00',
        Number(c.amount || 0).toFixed(2),
        c.method,
        'COLLECTED',
      ]);
    });

    downloadCSV(headers, rows, `Master_Tax_Report_${getFilterLabel()}.csv`);
  };

  // Export LRs CSV
  const handleExportLRsCSV = () => {
    if (filteredDockets.length === 0) {
      alert('No LR records matching the selected filters.');
      return;
    }
    downloadCSV(
      [
        'Docket No',
        'Booking Date',
        'Status',
        'Transport Mode',
        'Origin (From)',
        'Destination (To)',
        'Consignor Name',
        'Consignor GSTIN',
        'Consignee Name',
        'Consignee GSTIN',
        'Charged Weight (kg)',
        'Taxable Subtotal (₹)',
        'GST Rate (%)',
        'GST Amount (₹)',
        'Grand Total (₹)',
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
      `LR_Report_${getFilterLabel()}.csv`
    );
  };

  // Export LRs PDF
  const handleExportLRsPDF = () => {
    if (filteredDockets.length === 0) {
      alert('No LR records matching the selected filters.');
      return;
    }
    const label =
      preset === 'custom'
        ? `${startDate || 'Start'} to ${endDate || 'Present'}`
        : getPresetDates(preset).label;
    exportSummaryPDF(filteredDockets, label);
  };

  // Export Bills CSV
  const handleExportBillsCSV = () => {
    if (filteredBills.length === 0) {
      alert('No bill records matching the selected filters.');
      return;
    }
    downloadCSV(
      [
        'Bill No',
        'Invoice Date',
        'Customer Name',
        'Customer GSTIN',
        'Customer City / Address',
        'Category',
        'Doc Type',
        'Line Items / LRs',
        'Subtotal (₹)',
        'GST Amount (₹)',
        'Grand Total (₹)',
        'Payment Received (₹)',
        'Payment Pending (₹)',
        'Payment Status',
      ],
      filteredBills.map((b) => {
        const pay = getBillPaymentInfo(b, dockets);
        return [
          b.bill_no,
          b.invoice_date,
          b.customer_name,
          b.customer_gstin || '',
          b.customer_address || '',
          b.category,
          b.doc_type,
          (b.docket_ids?.length || 0) + (b.items?.length || 0),
          Number(b.subtotal || 0).toFixed(2),
          Number(b.gst_amount || 0).toFixed(2),
          pay.grandTotal.toFixed(2),
          pay.received.toFixed(2),
          pay.pending.toFixed(2),
          pay.status.toUpperCase(),
        ];
      }),
      `Bills_Report_${getFilterLabel()}.csv`
    );
  };

  // Export Expenses CSV
  const handleExportExpensesCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('No expense records matching the selected filters.');
      return;
    }
    downloadCSV(
      [
        'Ledger / Sheet No',
        'Period Start',
        'Period End',
        'Label',
        'Entries Count',
        'Total Amount (₹)',
        'Created By',
        'Created At',
        'Notes',
      ],
      filteredExpenses.map((l) => [
        l.ledger_no,
        l.period_start,
        l.period_end,
        l.label || '',
        l.entry_count || 0,
        Number(l.total_amount || 0).toFixed(2),
        l.created_by_name || 'Staff',
        l.created_at,
        l.notes || '',
      ]),
      `Expense_Sheets_Report_${getFilterLabel()}.csv`
    );
  };

  // Export Cash Log CSV
  const handleExportCashCSV = () => {
    if (filteredCashLog.length === 0) {
      alert('No cash records matching the selected filters.');
      return;
    }
    downloadCSV(
      ['Docket / LR No', 'Payment Date', 'Amount (₹)', 'Method', 'Recorded By', 'Notes'],
      filteredCashLog.map((c) => [
        c.docket_no,
        c.paid_at.split('T')[0],
        Number(c.amount || 0).toFixed(2),
        c.method,
        c.recorded_by_name || 'Staff',
        c.notes || '',
      ]),
      `Cash_Collections_${getFilterLabel()}.csv`
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Report Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-normal">
            Detailed statistical summary for tax filing, showing Lorry Receipts (LRs), tax invoices, expense breakdowns, GST totals and cash flow to help prepare accurate returns.
          </p>
        </div>

        {/* Global Action: Quick Export Dropdown / Buttons */}
        <div className="flex items-center gap-2">
          {activeReportTab === 'overview' && (
            <>
              <Button
                variant="outline"
                onClick={handleExportLRsPDF}
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs transition-saas cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Export PDF Statement</span>
              </Button>
              <Button
                onClick={handleExportFullReportCSV}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Full CSV Report</span>
              </Button>
            </>
          )}

          {activeReportTab === 'lrs' && (
            <>
              <Button
                variant="outline"
                onClick={handleExportLRsPDF}
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs transition-saas cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>PDF</span>
              </Button>
              <Button
                onClick={handleExportLRsCSV}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export LRs CSV</span>
              </Button>
            </>
          )}

          {activeReportTab === 'bills' && (
            <Button
              onClick={handleExportBillsCSV}
              className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Bills CSV</span>
            </Button>
          )}

          {activeReportTab === 'expenses' && (
            <Button
              onClick={handleExportExpensesCSV}
              className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Expenses CSV</span>
            </Button>
          )}

          {activeReportTab === 'cash' && (
            <Button
              onClick={handleExportCashCSV}
              className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Cash CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* Persistent Executive Financial Scorecard (Top 4 KPIs Across All Tabs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Gross Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gross Income / Revenue</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                ₹{totalGrossRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5 flex justify-between">
            <span>{billMetrics.totalCount} Bills Issued</span>
            <span>{lrMetrics.activeCount} LRs</span>
          </div>
        </div>

        {/* Card 2: Operating Expenses */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Operating Expenses</p>
              <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                ₹{totalOperationalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#FEE2E2] text-[#D14343] flex items-center justify-center font-bold">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5 flex justify-between">
            <span>{expenseMetrics.totalCount} Expense Sheets</span>
            <span>{expenseMetrics.totalEntries} Entries</span>
          </div>
        </div>

        {/* Card 3: Net Operating Profit */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Operating Profit</p>
              <h3
                className={`text-2xl font-bold font-mono mt-1.5 tracking-tight ${
                  netOperatingProfit >= 0 ? 'text-[#1F8A4C]' : 'text-[#D14343]'
                }`}
              >
                ₹{netOperatingProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                netOperatingProfit >= 0 ? 'bg-[#E8F7EF] text-[#1F8A4C]' : 'bg-[#FEE2E2] text-[#D14343]'
              }`}
            >
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5 flex justify-between">
            <span>Margin: {profitMargin.toFixed(1)}%</span>
            <span className={netOperatingProfit >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {netOperatingProfit >= 0 ? 'Profitable' : 'Deficit'}
            </span>
          </div>
        </div>

        {/* Card 4: Outstanding Receivables */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Receivables</p>
              <h3 className="text-2xl font-bold text-[#D14343] font-mono mt-1.5 tracking-tight">
                ₹{totalOutstandingReceivables.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5 flex justify-between">
            <span>Realized: ₹{totalInflowRealized.toLocaleString('en-IN')}</span>
            <span>Uncollected</span>
          </div>
        </div>
      </div>

      {/* Report Category Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 overflow-x-auto">
        <button
          onClick={() => setActiveReportTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            activeReportTab === 'overview'
              ? 'bg-white text-[#0A2030] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Executive Overview & P&L</span>
        </button>

        <button
          onClick={() => setActiveReportTab('lrs')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            activeReportTab === 'lrs'
              ? 'bg-white text-[#0A2030] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>LRs Created ({filteredDockets.length})</span>
        </button>

        <button
          onClick={() => setActiveReportTab('bills')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            activeReportTab === 'bills'
              ? 'bg-white text-[#0A2030] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Bills Generated ({filteredBills.length})</span>
        </button>

        <button
          onClick={() => setActiveReportTab('expenses')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            activeReportTab === 'expenses'
              ? 'bg-white text-[#0A2030] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Expense Sheets ({filteredExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveReportTab('cash')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
            activeReportTab === 'cash'
              ? 'bg-white text-[#0A2030] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <IndianRupee className="w-3.5 h-3.5" />
          <span>Cash Collections ({filteredCashLog.length})</span>
        </button>
      </div>

      {/* Master Date Range & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across reports..."
              className="w-full h-10 pl-9.5 pr-4 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
            />
          </div>

          {/* Master Date Preset Selector */}
          <select
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_90_days">Last 3 Months (Quarter)</option>
            <option value="last_6_months">Last 6 Months</option>
            <option value="this_fy">This Financial Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>

          {/* Custom Date Pickers */}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
              />
              <span className="text-xs text-slate-400 font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
              />
            </div>
          )}

          {/* Sub-tab contextual filters */}
          {activeReportTab === 'lrs' && (
            <>
              <select
                value={lrStatusFilter}
                onChange={(e) => setLrStatusFilter(e.target.value as any)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030]"
              >
                <option value="all">All LR Statuses</option>
                <option value="issued">Issued Only</option>
                <option value="voided">Voided Only</option>
              </select>

              <select
                value={lrPaymentModeFilter}
                onChange={(e) => setLrPaymentModeFilter(e.target.value as any)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030]"
              >
                <option value="all">All Payment Modes</option>
                <option value="Paid">Paid</option>
                <option value="To Pay">To Pay</option>
                <option value="Credit">Credit</option>
              </select>
            </>
          )}

          {activeReportTab === 'bills' && (
            <select
              value={billStatusFilter}
              onChange={(e) => setBillStatusFilter(e.target.value as any)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030]"
            >
              <option value="all">All Bill Statuses</option>
              <option value="paid">Paid Invoices</option>
              <option value="partial">Partial Payment</option>
              <option value="pending">Pending Payment</option>
            </select>
          )}

          {/* Reset Filters */}
          {(preset !== 'this_month' ||
            searchQuery ||
            lrStatusFilter !== 'issued' ||
            lrPaymentModeFilter !== 'all' ||
            lrTransportModeFilter !== 'all' ||
            billStatusFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Loading Indicator for Remote Data */}
      {loadingRemote && (
        <div className="flex items-center justify-center gap-2 p-6 bg-white border border-slate-200/80 rounded-2xl text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" />
          <span>Synchronizing invoice and expense sheets...</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: EXECUTIVE OVERVIEW & P&L                           */}
      {/* ========================================================= */}
      {activeReportTab === 'overview' && (
        <div className="space-y-6">
          {/* Comparative Section: Operational Breakdown & Cash Flow */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Box 1: Shipment Volume & Metrics */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#0A2030]" />
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Shipment Operations</h3>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{lrMetrics.activeCount} Issued</Badge>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Total Charged Weight:</span>
                  <span className="font-mono font-bold text-slate-900">{lrMetrics.totalWeight.toLocaleString('en-IN')} kg</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Taxable Subtotal:</span>
                  <span className="font-mono font-bold text-slate-900">₹{lrMetrics.totalSub.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>GST Collected on LRs:</span>
                  <span className="font-mono font-bold text-slate-900">₹{lrMetrics.totalTax.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 border-t border-slate-100 pt-2">
                  <span>Voided LRs Count:</span>
                  <span className="font-mono font-semibold text-rose-600">{lrMetrics.voidedCount}</span>
                </div>
              </div>
            </div>

            {/* Box 2: Billing & Invoicing Realization */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#0A2030]" />
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Invoice Realization</h3>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{billMetrics.totalCount} Invoices</Badge>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Gross Invoice Total:</span>
                  <span className="font-mono font-bold text-slate-900">₹{billMetrics.totalGrand.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Payment Collected:</span>
                  <span className="font-mono font-bold text-emerald-600">₹{billMetrics.totalReceived.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Payment Pending:</span>
                  <span className="font-mono font-bold text-rose-600">₹{billMetrics.totalPending.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 border-t border-slate-100 pt-2">
                  <span>Paid / Partial / Pending:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {billMetrics.paidCount} / {billMetrics.partialCount} / {billMetrics.pendingCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 3: Operating Cash Flow */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-saas space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#0A2030]" />
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Operating Cash Flow</h3>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{expenseMetrics.totalCount} Sheets</Badge>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Realized Cash Inflow:</span>
                  <span className="font-mono font-bold text-emerald-600">₹{totalInflowRealized.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Operating Cash Outflow:</span>
                  <span className="font-mono font-bold text-rose-600">₹{totalOperationalExpenses.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 border-t border-slate-100 pt-2">
                  <span>Net Cash Position:</span>
                  <span className={`font-mono font-bold ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ₹{netCashFlow.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-0.5 text-[11px]">
                  <span>Direct Cash Log:</span>
                  <span className="font-mono">₹{totalCashCollected.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: LRS CREATED REPORT                                */}
      {/* ========================================================= */}
      {activeReportTab === 'lrs' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-saas">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">LRs & Consignments ({filteredDockets.length})</div>
              <div className="text-slate-500 font-medium">
                Active Freight Sum: <strong className="text-slate-900 font-mono">₹{lrMetrics.totalGrand.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">LR / Ref</th>
                    <th className="px-4 py-3">Booking Date</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Consignor</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3 text-right">Weight (kg)</th>
                    <th className="px-4 py-3 text-right">Grand Total</th>
                    <th className="px-4 py-3 text-center">Payment Mode</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDockets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        No LRs found for the selected period and filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDockets.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-[#0A2030]">{d.docket_no}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-600">{d.booking_date}</td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {d.from_city} → {d.to_city}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900 max-w-[180px] truncate">
                          {d.consignor_name}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{d.transport_mode}</td>
                        <td className="px-4 py-3.5 text-right font-mono">{Number(d.charged_weight_kg || 0)}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                          ₹{Number(d.grand_total).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${getPaymentBadgeStyle(
                              d.payment_mode
                            )}`}
                          >
                            {d.payment_mode}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {d.status === 'issued' ? (
                            <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                              ISSUED
                            </span>
                          ) : (
                            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                              VOIDED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: BILLS GENERATED REPORT                            */}
      {/* ========================================================= */}
      {activeReportTab === 'bills' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-saas">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">Consolidated Tax Invoices ({filteredBills.length})</div>
              <div className="text-slate-500 font-medium">
                Billed Sum: <strong className="text-slate-900 font-mono">₹{billMetrics.totalGrand.toLocaleString('en-IN')}</strong> · Collected: <strong className="text-emerald-600 font-mono">₹{billMetrics.totalReceived.toLocaleString('en-IN')}</strong> · Pending: <strong className="text-rose-600 font-mono">₹{billMetrics.totalPending.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Bill No</th>
                    <th className="px-4 py-3">Invoice Date</th>
                    <th className="px-4 py-3">Customer Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">LRs / Items</th>
                    <th className="px-4 py-3 text-right">Grand Total</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        No bills generated for the selected period and filters.
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => {
                      const pay = getBillPaymentInfo(b, dockets);
                      const itemCount = (b.docket_ids?.length || 0) + (b.items?.length || 0);

                      return (
                        <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5 font-mono font-bold text-[#0A2030]">{b.bill_no}</td>
                          <td className="px-4 py-3.5 font-mono text-slate-600">{b.invoice_date}</td>
                          <td className="px-4 py-3.5 font-medium text-slate-900 max-w-[200px] truncate">
                            {b.customer_name}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">{b.category} · {b.doc_type}</td>
                          <td className="px-4 py-3.5 font-mono">{itemCount} items</td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                            ₹{Number(b.grand_total).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-600">
                            ₹{pay.received.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold">
                            {pay.pending > 0 ? (
                              <span className="text-rose-600">₹{pay.pending.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-slate-400 font-normal">₹0</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                pay.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : pay.status === 'partial'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                              }`}
                            >
                              {pay.status === 'paid' ? 'Paid' : pay.status === 'partial' ? 'Partial' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: EXPENSE SHEETS REPORT                             */}
      {/* ========================================================= */}
      {activeReportTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-saas">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">Expense Ledgers & Operating Sheets ({filteredExpenses.length})</div>
              <div className="text-slate-500 font-medium">
                Total Expenses: <strong className="text-rose-600 font-mono">₹{expenseMetrics.totalExpenses.toLocaleString('en-IN')}</strong> · Entries: <strong className="text-slate-900 font-mono">{expenseMetrics.totalEntries}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Sheet / Ledger No</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Label / Description</th>
                    <th className="px-4 py-3 font-mono">Entries</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No expense sheets logged for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-[#0A2030]">{l.ledger_no}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-600">
                          {l.period_start} → {l.period_end}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">{l.label || 'Operating Expense'}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-700">{l.entry_count || 0} entries</td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-rose-600">
                          ₹{Number(l.total_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{l.created_by_name || 'Staff'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: CASH & COLLECTIONS LOG                            */}
      {/* ========================================================= */}
      {activeReportTab === 'cash' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-saas">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">Direct Payment & Cash Receipts ({filteredCashLog.length})</div>
              <div className="text-slate-500 font-medium">
                Total Collected: <strong className="text-emerald-600 font-mono">₹{totalCashCollected.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">LR / Ref</th>
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Recorded By</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCashLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No cash transactions recorded for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredCashLog.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-[#0A2030]">{c.docket_no}</td>
                        <td className="px-4 py-3.5 font-mono text-slate-600">{c.paid_at.split('T')[0]}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {c.method}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-600">
                          ₹{Number(c.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{c.recorded_by_name || 'Staff'}</td>
                        <td className="px-4 py-3.5 text-slate-500 italic max-w-[200px] truncate">{c.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
