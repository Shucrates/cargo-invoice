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
  MapPin,
  Scale,
  Route,
  ArrowUpDown,
  ChevronRight,
  Package,
  Plus,
  ExternalLink,
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
  onNavigateToBilling?: () => void;
  onNavigateToShipments?: () => void;
  onNavigateToExpenses?: () => void;
}

export type PeriodPreset =
  | 'today'
  | 'this_week'
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

  if (preset === 'today') {
    return { start: todayISO, end: todayISO, label: 'Today' };
  }

  if (preset === 'this_week') {
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const start = monday.toISOString().split('T')[0];
    return { start, end: todayISO, label: 'This Week' };
  }

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
      return 'bg-amber-50 text-amber-800';
    case 'To Pay':
      return 'bg-blue-50 text-blue-800';
    case 'Paid':
      return 'bg-emerald-50 text-emerald-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

// Module-level in-memory cache to make tab switches and remounts 0ms instant
let cachedReportsBills: Bill[] | null = null;
let cachedReportsExpenses: ExpenseLedger[] | null = null;
let cachedReportsTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

export function invalidateReportsCache(type?: 'bills' | 'expenses') {
  if (!type || type === 'bills') cachedReportsBills = null;
  if (!type || type === 'expenses') cachedReportsExpenses = null;
  cachedReportsTimestamp = 0;
}

export default function ReportsView({
  dockets,
  cashLog = [],
  customers = [],
  onNavigateToBilling,
  onNavigateToShipments,
  onNavigateToExpenses,
}: ReportsViewProps) {
  // Remote datasets initialized from cache if available (0ms instant render)
  const [bills, setBills] = useState<Bill[]>(() => cachedReportsBills ?? []);
  const [expenseLedgers, setExpenseLedgers] = useState<ExpenseLedger[]>(() => cachedReportsExpenses ?? []);
  const [loadingRemote, setLoadingRemote] = useState(() => !cachedReportsBills || !cachedReportsExpenses);

  // Active Report Tab: Overview, Shipments, Billing, Expenses, Cash Flow
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'shipments' | 'billing' | 'expenses' | 'cash'>('overview');
  const [shipmentsSubTab, setShipmentsSubTab] = useState<'lrs' | 'locations'>('lrs');
  const [isExportOpen, setIsExportOpen] = useState(false);

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

  // Location & Weight Analysis States
  const [locationGrouping, setLocationGrouping] = useState<'destination' | 'origin' | 'route'>('destination');
  const [locationSort, setLocationSort] = useState<'weight_desc' | 'weight_asc' | 'count_desc' | 'revenue_desc' | 'name_asc'>('weight_desc');
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);

  // Fetch Bills and Expense Ledgers with non-blocking revalidation
  useEffect(() => {
    let isMounted = true;
    const isCacheStale = Date.now() - cachedReportsTimestamp > CACHE_TTL_MS;

    // If we have cached data and it's fresh, don't show loading indicator
    if (cachedReportsBills && cachedReportsExpenses && !isCacheStale) {
      setLoadingRemote(false);
      return;
    }

    // Only show full loading indicator if we don't have any cached data to display
    if (!cachedReportsBills || !cachedReportsExpenses) {
      setLoadingRemote(true);
    }

    Promise.all([
      fetch('/api/billing?limit=300').then((r) => (r.ok ? r.json() : { bills: [] })),
      fetch('/api/expenses?limit=300').then((r) => (r.ok ? r.json() : { ledgers: [] })),
    ])
      .then(([billsRes, expensesRes]) => {
        if (isMounted) {
          const loadedBills = billsRes.bills || [];
          const loadedExpenses = expensesRes.ledgers || [];
          cachedReportsBills = loadedBills;
          cachedReportsExpenses = loadedExpenses;
          cachedReportsTimestamp = Date.now();
          setBills(loadedBills);
          setExpenseLedgers(loadedExpenses);
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
    setLocationGrouping('destination');
    setLocationSort('weight_desc');
    setExpandedLocation(null);
    setShipmentsSubTab('lrs');
    setIsExportOpen(false);
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

  // Location & Weight Aggregates
  const locationData = useMemo(() => {
    const docketsToAggregate = filteredDockets.filter((d) => lrStatusFilter === 'all' || d.status === lrStatusFilter);
    const groupMap = new Map<string, CargoDocket[]>();

    docketsToAggregate.forEach((d) => {
      let key = '';
      if (locationGrouping === 'destination') {
        key = (d.to_city && d.to_city.trim()) ? d.to_city.trim() : 'Unspecified';
      } else if (locationGrouping === 'origin') {
        key = (d.from_city && d.from_city.trim()) ? d.from_city.trim() : 'Unspecified';
      } else {
        const from = (d.from_city && d.from_city.trim()) ? d.from_city.trim() : 'Origin';
        const to = (d.to_city && d.to_city.trim()) ? d.to_city.trim() : 'Destination';
        key = `${from} → ${to}`;
      }
      const existing = groupMap.get(key) || [];
      existing.push(d);
      groupMap.set(key, existing);
    });

    const totalChargedWeightAll = docketsToAggregate.reduce(
      (sum, d) => sum + (Number(d.charged_weight_kg) || 0),
      0
    );
    const totalActualWeightAll = docketsToAggregate.reduce(
      (sum, d) => sum + (Number(d.actual_weight_kg) || 0),
      0
    );
    const totalPackagesAll = docketsToAggregate.reduce(
      (sum, d) => sum + (Number(d.package_count) || 0),
      0
    );
    const totalGrandAll = docketsToAggregate.reduce(
      (sum, d) => sum + (Number(d.grand_total) || 0),
      0
    );
    const totalShipmentsAll = docketsToAggregate.length;

    const items = Array.from(groupMap.entries()).map(([name, dList]) => {
      const chargedWeight = dList.reduce((sum, d) => sum + (Number(d.charged_weight_kg) || 0), 0);
      const actualWeight = dList.reduce((sum, d) => sum + (Number(d.actual_weight_kg) || 0), 0);
      const packageCount = dList.reduce((sum, d) => sum + (Number(d.package_count) || 0), 0);
      const totalGrand = dList.reduce((sum, d) => sum + (Number(d.grand_total) || 0), 0);
      const totalSub = dList.reduce((sum, d) => sum + (Number(d.subtotal) || 0), 0);
      const totalTax = dList.reduce((sum, d) => sum + (Number(d.gst_amount) || 0), 0);
      const shipmentCount = dList.length;
      const avgWeight = shipmentCount > 0 ? chargedWeight / shipmentCount : 0;
      const sharePct = totalChargedWeightAll > 0 ? (chargedWeight / totalChargedWeightAll) * 100 : 0;

      let roadCount = 0;
      let airCount = 0;
      let trainCount = 0;
      let roadWeight = 0;
      let airWeight = 0;
      let trainWeight = 0;

      const consigneeCounts = new Map<string, number>();

      dList.forEach((d) => {
        const mode = d.transport_mode || 'Road';
        const wt = Number(d.charged_weight_kg) || 0;
        if (mode === 'Air') {
          airCount++;
          airWeight += wt;
        } else if (mode === 'Train') {
          trainCount++;
          trainWeight += wt;
        } else {
          roadCount++;
          roadWeight += wt;
        }

        if (d.consignee_name) {
          consigneeCounts.set(d.consignee_name, (consigneeCounts.get(d.consignee_name) || 0) + 1);
        }
      });

      const topConsignees = Array.from(consigneeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cName]) => cName);

      return {
        key: name,
        name,
        shipmentCount,
        chargedWeight,
        actualWeight,
        packageCount,
        totalGrand,
        totalSub,
        totalTax,
        avgWeight,
        sharePct,
        roadCount,
        airCount,
        trainCount,
        roadWeight,
        airWeight,
        trainWeight,
        dockets: dList,
        topConsignees,
      };
    });

    // Sort items
    items.sort((a, b) => {
      if (locationSort === 'weight_desc') return b.chargedWeight - a.chargedWeight;
      if (locationSort === 'weight_asc') return a.chargedWeight - b.chargedWeight;
      if (locationSort === 'count_desc') return b.shipmentCount - a.shipmentCount;
      if (locationSort === 'revenue_desc') return b.totalGrand - a.totalGrand;
      if (locationSort === 'name_asc') return a.name.localeCompare(b.name);
      return b.chargedWeight - a.chargedWeight;
    });

    const topLocation = items.length > 0 ? items[0] : null;
    const avgWeightPerShipment = totalShipmentsAll > 0 ? totalChargedWeightAll / totalShipmentsAll : 0;

    return {
      items,
      totalLocations: items.length,
      totalChargedWeightAll,
      totalActualWeightAll,
      totalPackagesAll,
      totalGrandAll,
      totalShipmentsAll,
      topLocation,
      avgWeightPerShipment,
    };
  }, [filteredDockets, lrStatusFilter, locationGrouping, locationSort]);

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

  // Location Weight CSV Export
  const handleExportLocationWeightCSV = () => {
    if (locationData.items.length === 0) {
      alert('No shipment records matching the selected filters for location analysis.');
      return;
    }

    const groupLabel =
      locationGrouping === 'destination'
        ? 'Destination (To City)'
        : locationGrouping === 'origin'
        ? 'Origin (From City)'
        : 'Route (From → To)';

    downloadCSV(
      [
        groupLabel,
        'Total Shipments (LRs)',
        'Charged Weight (kg)',
        'Actual Weight (kg)',
        'Package Count',
        'Avg Weight per LR (kg)',
        'Weight Share (%)',
        'Taxable Subtotal (₹)',
        'GST Amount (₹)',
        'Grand Total (₹)',
        'Road Shipments',
        'Air Shipments',
        'Train Shipments',
        'Top Consignees',
      ],
      locationData.items.map((loc) => [
        loc.name,
        loc.shipmentCount,
        loc.chargedWeight.toFixed(2),
        loc.actualWeight.toFixed(2),
        loc.packageCount,
        loc.avgWeight.toFixed(2),
        `${loc.sharePct.toFixed(1)}%`,
        loc.totalSub.toFixed(2),
        loc.totalTax.toFixed(2),
        loc.totalGrand.toFixed(2),
        `${loc.roadCount} (${loc.roadWeight.toFixed(1)} kg)`,
        `${loc.airCount} (${loc.airWeight.toFixed(1)} kg)`,
        `${loc.trainCount} (${loc.trainWeight.toFixed(1)} kg)`,
        loc.topConsignees.join('; ') || 'N/A',
      ]),
      `Location_Weight_Report_${locationGrouping}_${getFilterLabel()}.csv`
    );
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
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-normal">
            Overview of your shipments, billing and financial activity.
          </p>
        </div>

        {/* Consolidated Export Dropdown */}
        <div className="relative shrink-0">
          <Button
            onClick={() => setIsExportOpen((prev) => !prev)}
            className="h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExportOpen ? 'rotate-180' : ''}`} />
          </Button>

          {isExportOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsExportOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setIsExportOpen(false);
                    handleExportLRsPDF();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <div>
                    <div className="font-semibold text-slate-900">PDF Statement</div>
                    <div className="text-[10px] text-slate-500">Summary statement PDF</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExportOpen(false);
                    handleExportFullReportCSV();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="font-semibold text-slate-900">Full CSV Report</div>
                    <div className="text-[10px] text-slate-500">Comprehensive dataset for tax/audit</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExportOpen(false);
                    handleExportLRsCSV();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Truck className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="font-semibold text-slate-900">Shipment Report</div>
                    <div className="text-[10px] text-slate-500">Detailed LRs CSV report</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExportOpen(false);
                    handleExportBillsCSV();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="font-semibold text-slate-900">Financial Report</div>
                    <div className="text-[10px] text-slate-500">Tax invoices & billing ledger CSV</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. HIGH-LEVEL FINANCIAL KPI SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Revenue</p>
          <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1 tracking-tight">
            ₹{totalGrossRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Gross freight revenue</span>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expenses</p>
          <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1 tracking-tight">
            ₹{totalOperationalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <TrendingDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Operating costs</span>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Profit</p>
          <h3
            className={`text-2xl font-bold font-mono mt-1 tracking-tight ${
              netOperatingProfit >= 0 ? 'text-[#1F8A4C]' : 'text-[#D14343]'
            }`}
          >
            ₹{netOperatingProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
            <span className={netOperatingProfit >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>
              {profitMargin.toFixed(1)}% Margin
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{netOperatingProfit >= 0 ? 'Profitable' : 'Deficit'}</span>
          </div>
        </div>

        {/* Receivables */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Receivables</p>
          <h3 className="text-2xl font-bold text-[#D14343] font-mono mt-1 tracking-tight">
            ₹{totalOutstandingReceivables.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Pending collection</span>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY NAVIGATION */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'shipments', label: 'Shipments', icon: Truck, count: filteredDockets.length },
          { id: 'billing', label: 'Billing', icon: Receipt, count: filteredBills.length },
          { id: 'expenses', label: 'Expenses', icon: Wallet, count: filteredExpenses.length },
          { id: 'cash', label: 'Cash Flow', icon: IndianRupee, count: filteredCashLog.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shrink-0 ${
                isActive ? 'bg-white text-[#0A2030] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. GLOBAL SEARCH + FILTER TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports, LR, invoice..."
            className="w-full h-10 pl-9.5 pr-4 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
          />
        </div>

        {/* Global Date Filter */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 h-10 shadow-2xs">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
              className="bg-transparent text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none pr-1"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_90_days">This Quarter</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="this_fy">This Financial Year</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030]"
              />
              <span className="text-xs text-slate-400 font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030]"
              />
            </div>
          )}

          {(preset !== 'this_month' || searchQuery) && (
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

      {/* Loading Indicator for Remote Data (Only on initial cold load with zero cache) */}
      {loadingRemote && bills.length === 0 && (
        <div className="flex items-center justify-center gap-2 p-6 bg-white border border-slate-200/80 rounded-2xl text-xs text-slate-500 shadow-2xs">
          <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" />
          <span>Synchronizing invoice and expense sheets...</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW (True High-Signal Executive Dashboard)     */}
      {/* ========================================================= */}
      {activeReportTab === 'overview' && (
        <div className="space-y-6">
          {/* 1. Operations & Tax Base (Balanced 2-Column Overview) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Box A: Logistics & Shipment Operations */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-heading">Shipment Operations</h3>
                      <p className="text-[11px] text-slate-500 font-normal">Consignment volume and tonnage dispatched</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReportTab('shipments')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Shipments</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">Active LRs</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      {lrMetrics.activeCount}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {lrMetrics.voidedCount > 0 ? `${lrMetrics.voidedCount} voided` : 'All issued'}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-400">Cargo Weight</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      {lrMetrics.totalWeight.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                      <span className="text-xs font-sans font-normal text-slate-500 ml-1">kg</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Charged weight</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-400">Avg Consignment</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      {lrMetrics.activeCount > 0 ? (lrMetrics.totalWeight / lrMetrics.activeCount).toFixed(1) : 0}
                      <span className="text-xs font-sans font-normal text-slate-500 ml-1">kg/LR</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Mean density</p>
                  </div>
                </div>
              </div>

              {locationData.topLocation && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Top hub: <strong className="text-slate-800">{locationData.topLocation.name}</strong></span>
                  </span>
                  <span className="font-mono font-medium text-slate-700">
                    {locationData.topLocation.chargedWeight.toLocaleString('en-IN')} kg ({locationData.topLocation.sharePct.toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>

            {/* Box B: Tax & Billing Baseline */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-700">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-heading">Tax & Invoicing Base</h3>
                      <p className="text-[11px] text-slate-500 font-normal">Taxable subtotal and GST collection liability</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReportTab('billing')}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Invoices</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">Taxable Freight</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      ₹{(billMetrics.totalSub > 0 ? billMetrics.totalSub : lrMetrics.totalSub).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Pre-tax subtotal</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-400">GST Collected</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      ₹{(billMetrics.totalTax > 0 ? billMetrics.totalTax : lrMetrics.totalTax).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Tax liability</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-400">Invoices Raised</p>
                    <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                      {billMetrics.totalCount}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Tax invoices</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Average invoice size:</span>
                <span className="font-mono font-semibold text-slate-800">
                  ₹{billMetrics.totalCount > 0 ? Math.round(totalGrossRevenue / billMetrics.totalCount).toLocaleString('en-IN') : 0}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Collection Health & Realization Strip */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Collection & Settlement Health</h3>
                  <p className="text-[11px] text-slate-500 font-normal">Realized cash collections versus pending receivables</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveReportTab('billing')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Billing Ledger</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setActiveReportTab('cash')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Cash Flow</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loadingRemote && bills.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#0A2030] mx-auto" />
                <p className="text-xs text-slate-400">Loading collection and invoice metrics...</p>
              </div>
            ) : billMetrics.totalGrand === 0 && filteredCashLog.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-slate-400">No invoices or cash receipts recorded for this period.</p>
                {onNavigateToBilling && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNavigateToBilling}
                    className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Generate Invoice</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5 pt-1">
                {/* Progress bar and metrics */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-5">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Realized Inflow</span>
                      <span className="font-mono font-bold text-base text-emerald-600">
                        ₹{totalInflowRealized.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="h-7 w-px bg-slate-100" />
                    <div>
                      <span className="text-slate-400 text-[11px] block">Pending Receivables</span>
                      <span className="font-mono font-bold text-base text-rose-600">
                        ₹{totalOutstandingReceivables.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {billMetrics.totalGrand > 0 && (
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                        {((billMetrics.totalReceived / billMetrics.totalGrand) * 100).toFixed(1)}% Realized
                      </span>
                    </div>
                  )}
                </div>

                {billMetrics.totalGrand > 0 && (
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, (billMetrics.totalReceived / billMetrics.totalGrand) * 100))}%`,
                      }}
                    />
                    <div
                      className="bg-rose-400 h-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, (billMetrics.totalPending / billMetrics.totalGrand) * 100))}%`,
                      }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5 font-mono">
                  <span>
                    Invoices: <strong className="text-emerald-700 font-semibold">{billMetrics.paidCount} Paid</strong> ·{' '}
                    <strong className="text-amber-700 font-semibold">{billMetrics.partialCount} Partial</strong> ·{' '}
                    <strong className="text-rose-600 font-semibold">{billMetrics.pendingCount} Pending</strong>
                  </span>
                  {totalCashCollected > 0 && (
                    <span className="text-slate-600 font-medium">Direct cash receipts: ₹{totalCashCollected.toLocaleString('en-IN')}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Top Destinations Compact Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Top Destination Hubs</h3>
                  <p className="text-[11px] text-slate-500 font-normal">Tonnage distribution across top volume destinations</p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveReportTab('shipments');
                  setShipmentsSubTab('locations');
                }}
                className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 self-start sm:self-auto"
              >
                <span>View Full Location Analysis</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {locationData.items.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-slate-400">No destination data recorded for this period.</p>
                {onNavigateToShipments && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNavigateToShipments}
                    className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Create Shipment</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-3.5 py-2.5">Destination Hub</th>
                      <th className="px-3.5 py-2.5 text-center">Shipments</th>
                      <th className="px-3.5 py-2.5 text-right">Charged Weight</th>
                      <th className="px-3.5 py-2.5 min-w-[130px]">Weight Share</th>
                      <th className="px-3.5 py-2.5 text-right">Freight Revenue</th>
                      <th className="px-3.5 py-2.5 text-center">Drill-Down</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {locationData.items.slice(0, 5).map((loc, idx) => (
                      <tr key={loc.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span>{loc.name}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono text-slate-600">{loc.shipmentCount} LRs</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-900">
                          {loc.chargedWeight.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-mono text-slate-400">
                              <span>{loc.sharePct.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-[#0A2030] h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(loc.sharePct, 2))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900">
                          ₹{loc.totalGrand.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLocationGrouping('destination');
                              setActiveReportTab('shipments');
                              setShipmentsSubTab('locations');
                              setExpandedLocation(loc.key);
                            }}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                          >
                            Explore →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SHIPMENTS (LRs + Location & Weight Analysis)       */}
      {/* ========================================================= */}
      {activeReportTab === 'shipments' && (
        <div className="space-y-5">
          {/* Sub-tab Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start">
              <button
                type="button"
                onClick={() => setShipmentsSubTab('lrs')}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  shipmentsSubTab === 'lrs'
                    ? 'bg-white text-[#0A2030] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>LR Consignments ({filteredDockets.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setShipmentsSubTab('locations')}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  shipmentsSubTab === 'locations'
                    ? 'bg-white text-[#0A2030] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Location & Weight Analysis ({locationData.items.length})</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={shipmentsSubTab === 'lrs' ? handleExportLRsCSV : handleExportLocationWeightCSV}
              className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export {shipmentsSubTab === 'lrs' ? 'LRs CSV' : 'Location CSV'}</span>
            </Button>
          </div>

          {/* SUB-VIEW 1: LR CONSIGNMENTS */}
          {shipmentsSubTab === 'lrs' && (
            <div className="space-y-4">
              {/* Contextual Filters for LRs */}
              <div className="flex flex-wrap items-center justify-between gap-3 py-1 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Status:</span>
                    <select
                      value={lrStatusFilter}
                      onChange={(e) => setLrStatusFilter(e.target.value as any)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-[#0A2030]"
                    >
                      <option value="all">All Status</option>
                      <option value="issued">Issued</option>
                      <option value="voided">Voided</option>
                    </select>
                  </div>

                  {/* Payment Mode Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Payment:</span>
                    <select
                      value={lrPaymentModeFilter}
                      onChange={(e) => setLrPaymentModeFilter(e.target.value as any)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-[#0A2030]"
                    >
                      <option value="all">All Modes</option>
                      <option value="Paid">Paid</option>
                      <option value="To Pay">To Pay</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>

                  {/* Transport Mode Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Transport:</span>
                    <select
                      value={lrTransportModeFilter}
                      onChange={(e) => setLrTransportModeFilter(e.target.value as any)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-[#0A2030]"
                    >
                      <option value="all">All Modes</option>
                      <option value="Road">Road</option>
                      <option value="Air">Air</option>
                      <option value="Train">Train</option>
                    </select>
                  </div>
                </div>

                <div className="text-slate-500 font-medium">
                  Active Value: <strong className="text-slate-900 font-mono">₹{lrMetrics.totalGrand.toLocaleString('en-IN')}</strong>
                </div>
              </div>

              {/* LRs Table */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3">LR / Ref</th>
                        <th className="px-4 py-3">Booking Date</th>
                        <th className="px-4 py-3">Route</th>
                        <th className="px-4 py-3">Consignor</th>
                        <th className="px-4 py-3">Consignee</th>
                        <th className="px-4 py-3">Mode</th>
                        <th className="px-4 py-3 text-right">Weight (kg)</th>
                        <th className="px-4 py-3 text-right">Grand Total</th>
                        <th className="px-4 py-3 text-center">Payment</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDockets.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-10 text-center space-y-3">
                            <p className="text-xs text-slate-400">No LR records match the current filters.</p>
                            {onNavigateToShipments && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={onNavigateToShipments}
                                className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create New LR</span>
                              </Button>
                            )}
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
                            <td className="px-4 py-3.5 font-medium text-slate-900 max-w-[160px] truncate">
                              {d.consignor_name}
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 max-w-[160px] truncate">
                              {d.consignee_name}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">{d.transport_mode}</td>
                            <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                              {Number(d.charged_weight_kg || 0)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                              ₹{Number(d.grand_total).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md uppercase ${getPaymentBadgeStyle(
                                  d.payment_mode
                                )}`}
                              >
                                {d.payment_mode}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {d.status === 'issued' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  Issued
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                  Voided
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

          {/* SUB-VIEW 2: LOCATION & WEIGHT ANALYSIS */}
          {shipmentsSubTab === 'locations' && (
            <div className="space-y-5">
              {/* Unified Location Metrics Strip (Eliminates 4 duplicate cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
                <div className="px-3 py-1">
                  <p className="text-[11px] font-medium text-slate-400">Total Cargo Weight</p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {locationData.totalChargedWeightAll.toLocaleString('en-IN')}
                    <span className="text-xs font-sans font-normal text-slate-500 ml-1">kg</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{locationData.totalShipmentsAll} total LRs</p>
                </div>

                <div className="px-3 py-1">
                  <p className="text-[11px] font-medium text-slate-400">
                    {locationGrouping === 'destination' ? 'Destinations' : locationGrouping === 'origin' ? 'Origins' : 'Routes'}
                  </p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {locationData.totalLocations}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Active Network</p>
                </div>

                <div className="px-3 py-1">
                  <p className="text-[11px] font-medium text-slate-400">Top Volume Hub</p>
                  <p className="text-xl font-bold text-slate-900 font-heading mt-1 truncate">
                    {locationData.topLocation ? locationData.topLocation.name : '—'}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                    {locationData.topLocation ? `${locationData.topLocation.sharePct.toFixed(0)}% weight share` : '0%'}
                  </p>
                </div>

                <div className="px-3 py-1">
                  <p className="text-[11px] font-medium text-slate-400">Avg Weight / LR</p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {locationData.avgWeightPerShipment.toFixed(1)}
                    <span className="text-xs font-sans font-normal text-slate-500 ml-1">kg</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">₹{locationData.totalGrandAll.toLocaleString('en-IN')} freight</p>
                </div>
              </div>

              {/* Grouping & Sorting Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 py-1 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Group by:</span>
                    <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                      {[
                        { id: 'destination', label: 'Destination' },
                        { id: 'origin', label: 'Origin' },
                        { id: 'route', label: 'Route' },
                      ].map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setLocationGrouping(g.id as any)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                            locationGrouping === g.id
                              ? 'bg-white text-[#0A2030] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Sort:</span>
                    <select
                      value={locationSort}
                      onChange={(e) => setLocationSort(e.target.value as any)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-[#0A2030]"
                    >
                      <option value="weight_desc">Weight (High → Low)</option>
                      <option value="weight_asc">Weight (Low → High)</option>
                      <option value="count_desc">Shipments Count</option>
                      <option value="revenue_desc">Revenue (High → Low)</option>
                      <option value="name_asc">Name (A → Z)</option>
                    </select>
                  </div>
                </div>

                <div className="text-slate-500 font-medium">
                  {locationData.items.length} {locationGrouping === 'route' ? 'routes' : 'hubs'} found
                </div>
              </div>

              {/* Location Breakdown Table */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3">
                          {locationGrouping === 'destination'
                            ? 'Destination Hub (To City)'
                            : locationGrouping === 'origin'
                            ? 'Origin Hub (From City)'
                            : 'Route (From → To)'}
                        </th>
                        <th className="px-4 py-3 text-center">Shipments</th>
                        <th className="px-4 py-3 text-center">Packages</th>
                        <th className="px-4 py-3 text-right">Charged Wt (kg)</th>
                        <th className="px-4 py-3 text-right">Actual Wt (kg)</th>
                        <th className="px-4 py-3 min-w-[120px]">% Share of Weight</th>
                        <th className="px-4 py-3 text-center">Modes</th>
                        <th className="px-4 py-3 text-right">Freight Revenue</th>
                        <th className="px-4 py-3 text-center">Consignments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {locationData.items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            No shipment records found for the selected period.
                          </td>
                        </tr>
                      ) : (
                        locationData.items.map((loc) => {
                          const isExpanded = expandedLocation === loc.key;

                          return (
                            <Fragment key={loc.key}>
                              <tr className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                                      {locationGrouping === 'route' ? (
                                        <Route className="w-3.5 h-3.5 text-blue-600" />
                                      ) : (
                                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                                      )}
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 text-sm tracking-tight">{loc.name}</span>
                                      {loc.topConsignees.length > 0 && (
                                        <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                          To: {loc.topConsignees.join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-center font-mono font-medium text-slate-700">
                                  {loc.shipmentCount} LRs
                                </td>
                                <td className="px-4 py-3.5 text-center font-mono text-slate-600">
                                  {loc.packageCount}
                                </td>
                                <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                                  {loc.chargedWeight.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3.5 text-right font-mono text-slate-600">
                                  {loc.actualWeight.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-mono">
                                      <span className="font-semibold text-slate-700">{loc.sharePct.toFixed(1)}%</span>
                                      <span className="text-slate-400">{loc.avgWeight.toFixed(1)} kg/LR</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-[#0A2030] h-full rounded-full transition-all duration-300"
                                        style={{ width: `${Math.min(100, Math.max(loc.sharePct, 2))}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                                    {loc.roadCount > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                                        Road {loc.roadCount}
                                      </span>
                                    )}
                                    {loc.airCount > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px]">
                                        Air {loc.airCount}
                                      </span>
                                    )}
                                    {loc.trainCount > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px]">
                                        Train {loc.trainCount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                                  ₹{loc.totalGrand.toLocaleString('en-IN')}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedLocation(isExpanded ? null : loc.key)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                      isExpanded
                                        ? 'bg-[#0A2030] text-white'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                  >
                                    <span>{isExpanded ? 'Hide' : 'View LRs'}</span>
                                    {isExpanded ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                  </button>
                                </td>
                              </tr>

                              {/* Expanded Sub-table of LRs */}
                              {isExpanded && (
                                <tr className="bg-slate-50/90">
                                  <td colSpan={9} className="p-4 border-y border-slate-200/80">
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
                                        <div className="flex items-center gap-2">
                                          <MapPin className="w-4 h-4 text-[#0A2030]" />
                                          <span className="font-bold text-slate-900">
                                            Consignments related to <span className="text-[#0A2030]">{loc.name}</span>
                                          </span>
                                          <Badge variant="outline" className="font-mono text-[10px]">
                                            {loc.dockets.length} Dockets
                                          </Badge>
                                        </div>
                                        <div className="text-slate-500 font-medium">
                                          Total Weight: <strong className="text-slate-900 font-mono">{loc.chargedWeight} kg</strong> · Freight Sum: <strong className="text-slate-900 font-mono">₹{loc.totalGrand.toLocaleString('en-IN')}</strong>
                                        </div>
                                      </div>

                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                            <tr>
                                              <th className="px-3 py-2">Docket No</th>
                                              <th className="px-3 py-2">Date</th>
                                              <th className="px-3 py-2">Origin → Destination</th>
                                              <th className="px-3 py-2">Consignor</th>
                                              <th className="px-3 py-2">Consignee</th>
                                              <th className="px-3 py-2">Mode</th>
                                              <th className="px-3 py-2 text-right">Packages</th>
                                              <th className="px-3 py-2 text-right">Charged Wt (kg)</th>
                                              <th className="px-3 py-2 text-right">Amount (₹)</th>
                                              <th className="px-3 py-2 text-center">Payment Mode</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {loc.dockets.map((d) => (
                                              <tr key={d.id} className="hover:bg-slate-50/50">
                                                <td className="px-3 py-2 font-mono font-bold text-[#0A2030]">{d.docket_no}</td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{d.booking_date}</td>
                                                <td className="px-3 py-2 text-slate-700">
                                                  {d.from_city} → {d.to_city}
                                                </td>
                                                <td className="px-3 py-2 text-slate-800 max-w-[140px] truncate">{d.consignor_name}</td>
                                                <td className="px-3 py-2 text-slate-800 max-w-[140px] truncate">{d.consignee_name}</td>
                                                <td className="px-3 py-2 text-slate-600">{d.transport_mode}</td>
                                                <td className="px-3 py-2 text-right font-mono">{d.package_count || 1}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                                  {Number(d.charged_weight_kg || 0)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                                  ₹{Number(d.grand_total).toLocaleString('en-IN')}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${getPaymentBadgeStyle(d.payment_mode)}`}>
                                                    {d.payment_mode}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: BILLING & TAX INVOICES                             */}
      {/* ========================================================= */}
      {activeReportTab === 'billing' && (
        <div className="space-y-5">
          {/* Unified Realization Strip (Replaces 4 duplicate cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Gross Billed Total</p>
              <p className="text-xl font-bold font-mono text-slate-900 mt-1">
                ₹{billMetrics.totalGrand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">{billMetrics.totalCount} Tax Invoices</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Payments Collected</p>
              <p className="text-xl font-bold font-mono text-emerald-600 mt-1">
                ₹{billMetrics.totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                {billMetrics.totalGrand > 0 ? ((billMetrics.totalReceived / billMetrics.totalGrand) * 100).toFixed(1) : 0}% Realized
              </p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Pending Receivables</p>
              <p className="text-xl font-bold font-mono text-rose-600 mt-1">
                ₹{billMetrics.totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-rose-600 font-medium mt-0.5">{billMetrics.pendingCount} Unsettled Bills</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Settlement Counts</p>
              <div className="mt-1 text-xs font-mono font-semibold flex items-center gap-2">
                <span className="text-emerald-700">{billMetrics.paidCount} Paid</span>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">{billMetrics.partialCount} Partial</span>
                <span className="text-slate-300">·</span>
                <span className="text-rose-600">{billMetrics.pendingCount} Pending</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Payment distribution</p>
            </div>
          </div>

          {/* Secondary Filters + Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-1 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-slate-400 font-medium">Filter:</span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                {[
                  { id: 'all', label: 'All Invoices' },
                  { id: 'paid', label: 'Paid' },
                  { id: 'partial', label: 'Partial' },
                  { id: 'pending', label: 'Pending' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setBillStatusFilter(s.id as any)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      billStatusFilter === s.id
                        ? 'bg-white text-[#0A2030] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportBillsCSV}
              className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Invoices CSV</span>
            </Button>
          </div>

          {/* Main Invoices Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
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
                  {loadingRemote && bills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center space-y-3">
                        <Loader2 className="w-5 h-5 animate-spin text-[#0A2030] mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">Loading billing records...</p>
                      </td>
                    </tr>
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center space-y-3">
                        <p className="text-xs text-slate-400">No invoices match the selected period and filters.</p>
                        {onNavigateToBilling && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onNavigateToBilling}
                            className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Generate Invoice</span>
                          </Button>
                        )}
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
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                pay.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : pay.status === 'partial'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  pay.status === 'paid'
                                    ? 'bg-emerald-500'
                                    : pay.status === 'partial'
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                              />
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
      {/* TAB 4: EXPENSES REPORT                                    */}
      {/* ========================================================= */}
      {activeReportTab === 'expenses' && (
        <div className="space-y-5">
          {/* Unified Expenses Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Total Expenses</p>
              <p className="text-xl font-bold text-rose-600 font-mono mt-1">
                ₹{expenseMetrics.totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Operational Outflow</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Expense Sheets</p>
              <p className="text-xl font-bold text-slate-900 font-mono mt-1">
                {expenseMetrics.totalCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Logged ledgers</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Cost Line Items</p>
              <p className="text-xl font-bold text-slate-900 font-mono mt-1">
                {expenseMetrics.totalEntries}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Recorded items</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Avg Spend / Sheet</p>
              <p className="text-xl font-bold text-slate-900 font-mono mt-1">
                ₹{expenseMetrics.avgPerSheet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Mean ledger spend</p>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">Expense Ledgers ({filteredExpenses.length})</div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExpensesCSV}
                className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Expenses CSV</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
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
                  {loadingRemote && expenseLedgers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center space-y-3">
                        <Loader2 className="w-5 h-5 animate-spin text-[#0A2030] mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">Loading expense sheets...</p>
                      </td>
                    </tr>
                  ) : filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center space-y-3">
                        <p className="text-xs text-slate-400">No expense sheets logged for this period.</p>
                        {onNavigateToExpenses && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onNavigateToExpenses}
                            className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Record Expenses</span>
                          </Button>
                        )}
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
      {/* TAB 5: CASH FLOW REPORT                                   */}
      {/* ========================================================= */}
      {activeReportTab === 'cash' && (
        <div className="space-y-5">
          {/* Unified Liquidity Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Realized Cash Inflow</p>
              <p className="text-xl font-bold text-emerald-600 font-mono mt-1">
                ₹{totalInflowRealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Direct receipts & settled bills</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Operating Cash Outflow</p>
              <p className="text-xl font-bold text-rose-600 font-mono mt-1">
                ₹{totalOperationalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Expenses paid</p>
            </div>

            <div className="px-3 py-1">
              <p className="text-[11px] font-medium text-slate-400">Net Cash Position</p>
              <p className={`text-xl font-bold font-mono mt-1 ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{netCashFlow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Liquid balance</p>
            </div>
          </div>

          {/* Cash Receipts Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex justify-between items-center text-xs">
              <div className="font-bold text-slate-900">Direct Payment & Cash Receipts ({filteredCashLog.length})</div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCashCSV}
                className="h-8 px-3 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Cash Log CSV</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 text-slate-400 font-medium uppercase text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">LR / Docket No</th>
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
                      <td colSpan={6} className="p-10 text-center text-slate-400">
                        No direct cash transactions recorded for this period.
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
