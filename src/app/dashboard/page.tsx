'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AppShell, { NavTab } from '@/components/AppShell';
import CargoDocketForm, { CargoDocketFormHandle } from '@/components/CargoDocketForm';
import CustomerManager from '@/components/CustomerManager';
import DraftList from '@/components/DraftList';
import ShipmentDetailView from '@/components/ShipmentDetailView';
import BillingView, { BillingViewHandle } from '@/components/BillingView';
import QuotationView from '@/components/QuotationView';
import ExpensesView from '@/components/ExpensesView';
import CompanySettingsView from '@/components/CompanySettingsView';
import StaffManager from '@/components/StaffManager';
import ReportsView from '@/components/ReportsView';
import CashBookView from '@/components/CashBookView';
import TrackingTimelineModal from '@/components/TrackingTimelineModal';
import RecordPaymentModal from '@/components/RecordPaymentModal';
import { RevenueLineChart, ShipmentsBarChart } from '@/components/DashboardCharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CargoDocket, Customer, DocketDraft } from '@/types/cargo';
import { deliveryStatusBadgeVariant } from '@/lib/deliveryStatus';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { exportToCSV, downloadCSV } from '@/lib/exportUtils';
import {
  Search,
  Download,
  FileCheck,
  CheckSquare,
  Square,
  FileSpreadsheet,
  Truck,
  Package,
  CheckCircle2,
  Wallet,
  IndianRupee,
  LayoutGrid,
  List,
  AlertTriangle,
  Clock3,
} from 'lucide-react';

/** How many dockets the shipments table loads at a time. */
const DOCKET_PAGE_SIZE = 100;

const SHIPMENT_FILTERS = ['All', 'Issued', 'To Pay', 'Paid', 'Unpaid', 'Voided'] as const;
type ShipmentFilter = (typeof SHIPMENT_FILTERS)[number];

interface CashPayment {
  id: string;
  docket_id: string;
  docket_no: string;
  amount: number;
  method: string;
  paid_at: string;
  notes: string;
  recorded_by_name: string;
}

interface DashboardKpis {
  activeCount: number;
  voidedCount: number;
  totalRevenue: number;
  totalSubtotal: number;
  totalGST: number;
  totalWeight: number;
  pendingCollection: number;
  paidCollection: number;
  unpaidCount: number;
  pendingDeliveries: number;
  completedDeliveries: number;
  bookedToday: number;
  bookedYesterday: number;
  bookedThisWeek: number;
  bookedLastWeek: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  cashCollectedThisMonth: number;
  cashCollectedLastMonth: number;
  cashExpectedThisMonth: number;
  missingExpectedModeCount: number;
  missingExpectedModeAmount: number;
  myCashCollectedToday: number;
  myCashCollectedThisWeek: number;
  customerCount: number;
  customersThisMonth: number;
}

/** Compact Indian-format currency: ₹1.2L above a lakh, grouped digits below. */
function formatINR(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * Renders a period-over-period change. Returns null when there is no prior
 * period to compare against — we show nothing rather than invent a baseline.
 */
function formatDelta(current: number, previous: number, unit: 'count' | 'percent') {
  if (previous === 0) {
    if (current === 0) return null;
    return { text: `+${current} (no prior period)`, positive: true };
  }

  const diff = current - previous;
  if (diff === 0) return { text: 'No change', positive: true };

  const sign = diff > 0 ? '+' : '';
  const text =
    unit === 'percent'
      ? `${sign}${Math.round((diff / previous) * 100)}% vs last period`
      : `${sign}${diff} vs last period`;

  return { text, positive: diff > 0 };
}

export type DashboardTimeframe = 'week' | 'month' | 'year' | 'all';

function getISTDateRange(timeframe: DashboardTimeframe) {
  const now = new Date();
  const todayISTStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  if (timeframe === 'all') {
    return { startDate: '1970-01-01', label: 'All Time', shortLabel: 'All Time' };
  }

  const [yearStr, monthStr, dayStr] = todayISTStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (timeframe === 'year') {
    return { startDate: `${year}-01-01`, label: 'This Year', shortLabel: 'Year' };
  }

  if (timeframe === 'month') {
    return { startDate: `${year}-${String(month).padStart(2, '0')}-01`, label: 'This Month', shortLabel: 'Month' };
  }

  if (timeframe === 'week') {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = d.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    const mondayStr = d.toISOString().slice(0, 10);
    return { startDate: mondayStr, label: 'This Week', shortLabel: 'Week' };
  }

  return { startDate: '1970-01-01', label: 'All Time', shortLabel: 'All Time' };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [dashboardTimeframe, setDashboardTimeframe] = useState<DashboardTimeframe>('month');
  const [refreshKey, setRefreshKey] = useState(0);
  const cargoFormRef = useRef<CargoDocketFormHandle>(null);
  const billFormRef = useRef<BillingViewHandle>(null);
  const [editingDraft, setEditingDraft] = useState<DocketDraft | null>(null);
  const [pendingNav, setPendingNav] = useState<NavTab | null>(null);
  const [pendingNavSource, setPendingNavSource] = useState<'lr' | 'bill' | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [dockets, setDockets] = useState<CargoDocket[]>([]);
  const [docketTotal, setDocketTotal] = useState(0);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail View & Selection States
  const [selectedDocketForDetail, setSelectedDocketForDetail] = useState<CargoDocket | null>(null);
  const [selectedDocketIds, setSelectedDocketIds] = useState<string[]>([]);
  const [trackingModalDocket, setTrackingModalDocket] = useState<CargoDocket | null>(null);
  const [paymentModalDocket, setPaymentModalDocket] = useState<CargoDocket | null>(null);
  const [cashLog, setCashLog] = useState<CashPayment[]>([]);

  // Shipments Tab Filters
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShipmentFilter>('All');
  const [shipmentViewMode, setShipmentViewMode] = useState<'cards' | 'table'>('cards');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const router = useRouter();

  const fetchDockets = async () => {
    try {
      const res = await fetch(`/api/dockets?limit=${DOCKET_PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setDockets(data.dockets ?? []);
        setDocketTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch dockets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKpis = async () => {
    try {
      const res = await fetch('/api/dashboard/kpis');
      if (res.ok) {
        const data = await res.json();
        setKpis(data);
      }
    } catch (err) {
      console.error('Failed to fetch KPIs:', err);
    }
  };

  const fetchCashLog = async () => {
    try {
      const res = await fetch('/api/payments?method=Cash');
      if (res.ok) {
        const data = await res.json();
        setCashLog(data.payments ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch cash log:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomersList(data);
        setCustomerCount(data.length);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status === 'authenticated') {
      fetchDockets();
      fetchCustomers();
      fetchKpis();
      fetchCashLog();
    }
  }, [status, router, refreshKey]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-500 text-xs font-mono">
        Loading Rudra Cargo interface...
      </div>
    );
  }

  // Timeframe date filtering & dynamic KPI computations
  const { startDate: timeframeStartDate, label: timeframeLabel, shortLabel: timeframeShortLabel } = getISTDateRange(dashboardTimeframe);

  const timeframeDockets = dockets.filter((d) => {
    if (dashboardTimeframe === 'all') return true;
    const dateStr = d.booking_date || d.created_at?.slice(0, 10);
    return dateStr ? dateStr >= timeframeStartDate : true;
  });

  const activeTimeDockets = timeframeDockets.filter((d) => d.status === 'issued');
  const activeTimeCount = activeTimeDockets.length;
  const voidedTimeCount = timeframeDockets.filter((d) => d.status === 'voided').length;

  const timeframePendingDeliveries = activeTimeDockets.filter((d) => d.delivery_status !== 'Delivered').length;
  const timeframeCompletedDeliveries = activeTimeDockets.filter((d) => d.delivery_status === 'Delivered').length;
  const timeframeInTransit = activeTimeDockets.filter((d) =>
    ['In Transit', 'Out for Delivery'].includes(d.delivery_status || '')
  ).length;
  const timeframeNeedsAttention = activeTimeDockets.filter((d) =>
    ['Delayed', 'Exception'].includes(d.delivery_status || '')
  ).length;

  const timeframeTotalRevenue = activeTimeDockets.reduce((sum, d) => sum + Number(d.grand_total || 0), 0);
  const timeframeTotalSubtotal = activeTimeDockets.reduce((sum, d) => sum + Number(d.subtotal || 0), 0);
  const timeframeTotalGST = activeTimeDockets.reduce((sum, d) => sum + Number(d.gst_amount || 0), 0);

  const timeframeUnpaidDockets = activeTimeDockets.filter((d) => {
    const due = d.amount_due ?? (d.payment_mode === 'Paid' ? 0 : Number(d.grand_total || 0));
    return due > 0.01;
  });
  const timeframeUnpaidCount = timeframeUnpaidDockets.length;
  const timeframeOutstandingDue = timeframeUnpaidDockets.reduce((sum, d) => {
    return sum + (d.amount_due ?? (d.payment_mode === 'Paid' ? 0 : Number(d.grand_total || 0)));
  }, 0);

  const timeframeCashPayments = cashLog.filter((c) => {
    if (dashboardTimeframe === 'all') return true;
    const dateStr = c.paid_at?.slice(0, 10);
    return dateStr ? dateStr >= timeframeStartDate : true;
  });
  const timeframeCashCollected = timeframeCashPayments.length > 0
    ? timeframeCashPayments.reduce((sum, c) => sum + Number(c.amount || 0), 0)
    : activeTimeDockets.filter((d) => d.payment_mode === 'Paid').reduce((sum, d) => sum + Number(d.grand_total || 0), 0);

  // Global active dockets for fallback / reference & Reports tab
  const activeDockets = dockets.filter((d) => d.status === 'issued');
  const activeCount = kpis?.activeCount ?? activeDockets.length;
  const voidedCount = kpis?.voidedCount ?? dockets.filter((d) => d.status === 'voided').length;
  const totalRevenue = kpis?.totalRevenue ?? activeDockets.reduce((sum, d) => sum + Number(d.grand_total || 0), 0);
  const totalSubtotal = kpis?.totalSubtotal ?? activeDockets.reduce((sum, d) => sum + Number(d.subtotal || 0), 0);
  const totalGST = kpis?.totalGST ?? activeDockets.reduce((sum, d) => sum + Number(d.gst_amount || 0), 0);
  const paidPayments =
    kpis?.paidCollection ??
    activeDockets
      .filter((d) => d.payment_mode === 'Paid')
      .reduce((sum, d) => sum + Number(d.grand_total || 0), 0);
  const pendingPayments =
    kpis?.pendingCollection ??
    activeDockets
      .filter((d) => d.payment_mode === 'To Pay' || d.payment_mode === 'Credit')
      .reduce((sum, d) => sum + Number(d.grand_total || 0), 0);

  // "Today" in IST
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Filtered dockets for Shipments tab
  const filteredDockets = dockets.filter((d) => {
    const matchesSearch =
      d.docket_no.toLowerCase().includes(shipmentSearch.toLowerCase()) ||
      d.consignor_name.toLowerCase().includes(shipmentSearch.toLowerCase()) ||
      d.consignee_name.toLowerCase().includes(shipmentSearch.toLowerCase()) ||
      d.to_city.toLowerCase().includes(shipmentSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (dateFrom && d.booking_date < dateFrom) return false;
    if (dateTo && d.booking_date > dateTo) return false;

    switch (statusFilter) {
      case 'Issued':
        return d.status === 'issued';
      case 'Voided':
        return d.status === 'voided';
      case 'To Pay':
        return d.status === 'issued' && (d.payment_mode === 'To Pay' || (d as any).payment_mode === 'To_Pay');
      case 'Paid':
        return d.status === 'issued' && d.payment_mode === 'Paid';
      case 'Unpaid':
        return d.status === 'issued' && (d.payment_mode === 'To Pay' || d.payment_mode === 'Credit');
      default:
        return true;
    }
  });

  // Checkbox Batch Handlers
  const toggleSelectAll = () => {
    if (selectedDocketIds.length === filteredDockets.length) {
      setSelectedDocketIds([]);
    } else {
      setSelectedDocketIds(filteredDockets.map((d) => d.id));
    }
  };

  const toggleSelectDocket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDocketIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchPDFDownload = () => {
    const selected = dockets.filter((d) => selectedDocketIds.includes(d.id));
    selected.forEach((d) => generateInvoicePDF(d));
  };

  const handleBatchCSVExport = () => {
    const selected = dockets.filter((d) => selectedDocketIds.includes(d.id));
    exportToCSV(selected, `Selected_Shipments_${selectedDocketIds.length}_Invoices.csv`);
  };


  const handleTabChange = (tab: NavTab) => {
    if (activeTab === 'new_lr' && tab !== 'new_lr' && cargoFormRef.current?.isDirty) {
      setPendingNav(tab);
      setPendingNavSource('lr');
      return;
    }
    if (activeTab === 'billing' && tab !== 'billing' && billFormRef.current?.isDirty) {
      setPendingNav(tab);
      setPendingNavSource('bill');
      return;
    }
    setSelectedDocketForDetail(null);
    setEditingDraft(null);
    setActiveTab(tab);
  };

  const resolvePendingNav = async (action: 'save' | 'discard' | 'cancel') => {
    if (action === 'cancel') {
      setPendingNav(null);
      setPendingNavSource(null);
      return;
    }
    if (action === 'save') {
      setLeaveSaving(true);
      if (pendingNavSource === 'bill') await billFormRef.current?.saveAsDraft();
      else await cargoFormRef.current?.saveAsDraft();
      setLeaveSaving(false);
    }
    setSelectedDocketForDetail(null);
    setEditingDraft(null);
    if (pendingNav) setActiveTab(pendingNav);
    setPendingNav(null);
    setPendingNavSource(null);
  };

  // RENDER DETAILED INFO PAGE IF A DOCKET IS CLICKED
  if (selectedDocketForDetail) {
    return (
      <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
        <ShipmentDetailView
          docket={selectedDocketForDetail}
          onBack={() => setSelectedDocketForDetail(null)}
          onVoidSuccess={() => setRefreshKey((prev) => prev + 1)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
      {/* 1. DASHBOARD OVERVIEW TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          {/* Header & Page Title with Timeframe Filters */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{todayLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              {/* Timeframe Filter Switcher */}
              <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs">
                {(
                  [
                    { id: 'week', label: 'This Week' },
                    { id: 'month', label: 'This Month' },
                    { id: 'year', label: 'This Year' },
                    { id: 'all', label: 'All Time' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDashboardTimeframe(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                      dashboardTimeframe === t.id
                        ? 'bg-white text-[#2563EB] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Essential KPI Cards (Dynamically Filtered by Timeframe).
              Admins see money figures; staff see ops-only figures — the
              dashboard is shared, but earnings/dues are admin-only info. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {(isAdmin
              ? [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(timeframePendingDeliveries),
                    sub: `Delivery not done (${timeframeLabel.toLowerCase()})`,
                    icon: Package,
                    iconBg: 'bg-[#FFF6DD]',
                    iconColor: 'text-[#B7791F]',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(timeframeCompletedDeliveries),
                    sub: `Marked Delivered (${timeframeLabel.toLowerCase()})`,
                    icon: CheckCircle2,
                    iconBg: 'bg-[#E8F7EF]',
                    iconColor: 'text-[#1F8A4C]',
                  },
                  {
                    key: 'cash',
                    label: `CASH COLLECTED (${timeframeShortLabel.toUpperCase()})`,
                    value: formatINR(timeframeCashCollected),
                    sub: `Cash-settled in ${timeframeLabel.toLowerCase()}`,
                    icon: Wallet,
                    iconBg: 'bg-[#EEF4FF]',
                    iconColor: 'text-[#2563EB]',
                  },
                  {
                    key: 'outstanding',
                    label: 'OUTSTANDING DUE',
                    value: formatINR(timeframeOutstandingDue),
                    sub: `Across ${timeframeUnpaidCount} ${timeframeUnpaidCount === 1 ? 'invoice' : 'invoices'} (${timeframeLabel.toLowerCase()})`,
                    subColor: 'text-[#D14343]',
                    icon: IndianRupee,
                    iconBg: 'bg-[#FDECEC]',
                    iconColor: 'text-[#D14343]',
                  },
                  {
                    key: 'cash_expected',
                    label: 'CASH EXPECTED / PENDING',
                    value: formatINR(kpis?.cashExpectedThisMonth ?? 0),
                    sub: 'Projected — not yet received',
                    icon: Clock3,
                    iconBg: 'bg-[#FFF3E0]',
                    iconColor: 'text-[#B7791F]',
                  },
                ]
              : [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(timeframePendingDeliveries),
                    sub: `Delivery not done (${timeframeLabel.toLowerCase()})`,
                    icon: Package,
                    iconBg: 'bg-[#FFF6DD]',
                    iconColor: 'text-[#B7791F]',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(timeframeCompletedDeliveries),
                    sub: `Marked Delivered (${timeframeLabel.toLowerCase()})`,
                    icon: CheckCircle2,
                    iconBg: 'bg-[#E8F7EF]',
                    iconColor: 'text-[#1F8A4C]',
                  },
                  {
                    key: 'transit',
                    label: 'IN TRANSIT',
                    value: String(timeframeInTransit),
                    sub: `Moving or out for delivery (${timeframeLabel.toLowerCase()})`,
                    icon: Truck,
                    iconBg: 'bg-[#EEF4FF]',
                    iconColor: 'text-[#2563EB]',
                  },
                  {
                    key: 'attention',
                    label: 'NEEDS ATTENTION',
                    value: String(timeframeNeedsAttention),
                    sub: `Delayed or exception (${timeframeLabel.toLowerCase()})`,
                    subColor: timeframeNeedsAttention > 0 ? 'text-[#D14343]' : undefined,
                    icon: AlertTriangle,
                    iconBg: 'bg-[#FDECEC]',
                    iconColor: 'text-[#D14343]',
                  },
                  {
                    key: 'my_cash',
                    label: 'CASH COLLECTED BY YOU (TODAY)',
                    value: formatINR(kpis?.myCashCollectedToday ?? 0),
                    sub: `This week: ${formatINR(kpis?.myCashCollectedThisWeek ?? 0)}`,
                    icon: Wallet,
                    iconBg: 'bg-[#EEF4FF]',
                    iconColor: 'text-[#2563EB]',
                  },
                ]
            ).map((card) => (
              <Card key={card.key} className="p-6 transition-saas hover:-translate-y-0.5 shadow-saas">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate min-w-0">
                    {card.label}
                  </span>
                  <div className={`w-9 h-9 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center font-bold shrink-0`}>
                    <card.icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900 mt-2 font-sans tracking-tight">{card.value}</div>
                <div className={`text-xs mt-2.5 font-medium ${card.subColor ?? 'text-slate-400'}`}>{card.sub}</div>
              </Card>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('cash_book')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Cash Book →
            </button>
          )}

          {/* Charts Row — Revenue Breakdown is admin-only; staff see Shipments Volume only */}
          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-3' : ''} gap-6`}>
            {isAdmin && (
              <Card className="lg:col-span-2 p-6 space-y-4 shadow-saas">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Revenue Breakdown</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Subtotal ₹{timeframeTotalSubtotal.toLocaleString('en-IN')} + GST ₹{timeframeTotalGST.toLocaleString('en-IN')} ({timeframeLabel})
                  </p>
                </div>

                <RevenueLineChart dockets={timeframeDockets} />
              </Card>
            )}

            <Card className="p-6 space-y-4 shadow-saas">
              <div>
                <h3 className="text-base font-bold text-slate-900">Shipments Volume</h3>
                <p className="text-xs text-slate-500 font-medium">{activeTimeCount} active / {voidedTimeCount} voided ({timeframeLabel})</p>
              </div>

              <ShipmentsBarChart dockets={timeframeDockets} />
            </Card>
          </div>

          {/* Recent Activity Table Card */}
          <Card className="p-6 shadow-saas">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
                <p className="text-xs text-slate-500 font-medium">Latest shipments created across operations</p>
              </div>
              <button onClick={() => setActiveTab('shipments')} className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer">
                View all shipments →
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {dockets.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDocketForDetail(d)}
                  className="py-4 flex items-center justify-between text-xs hover:bg-[#F8FAFC] px-3.5 rounded-xl transition-saas cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="font-mono text-slate-500 font-medium text-xs bg-slate-100 px-2 py-1 rounded-md">{d.docket_no}</span>
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{d.consignor_name}</div>
                      <div className="text-xs text-slate-400">{d.from_city} → {d.to_city}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <Badge variant={d.status === 'voided' ? 'destructive' : 'info'} className="text-xs">
                      {d.status === 'voided' ? 'Voided' : 'Issued'}
                    </Badge>
                    <span className="text-sm font-semibold text-slate-900 font-mono">₹{Number(d.grand_total).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 2. SHIPMENTS TAB WITH MULTI-SELECT CHECKBOXES & DETAIL ENTRY CLICK */}
      {activeTab === 'shipments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Shipments</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {docketTotal > dockets.length
                  ? `Showing ${dockets.length} most recent of ${docketTotal} records`
                  : `${docketTotal} total records`}{' '}
                · Click any row to open full details
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Desktop View Switcher (Cards vs Table) */}
              <div className="hidden sm:inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShipmentViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    shipmentViewMode === 'cards'
                      ? 'bg-white text-[#2563EB] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Card View (Quick Actions)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShipmentViewMode('table')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    shipmentViewMode === 'table'
                      ? 'bg-white text-[#2563EB] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Table / List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(dockets, `cargo_shipments_all_${todayStr}.csv`)}
                className="gap-2 text-xs font-semibold shadow-saas"
              >
                <Download className="w-4 h-4" />
                <span>Export All CSV</span>
              </Button>
            </div>
          </div>

          {/* Floating Batch Download Bar when checkboxes selected */}
          {selectedDocketIds.length > 0 && (
            <div className="bg-[#2563EB] text-white p-4 rounded-2xl flex items-center justify-between shadow-saas-modal text-xs transition-saas">
              <div className="flex items-center gap-2.5 font-medium">
                <FileCheck className="w-5 h-5 text-blue-200" />
                <span><strong className="text-white text-sm">{selectedDocketIds.length}</strong> invoices selected</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Button size="sm" variant="secondary" onClick={handleBatchPDFDownload} className="gap-1.5 text-xs font-semibold bg-white text-[#2563EB] hover:bg-blue-50">
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDFs ({selectedDocketIds.length})</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={handleBatchCSVExport} className="gap-1.5 text-xs font-semibold bg-white text-slate-800 hover:bg-slate-100">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Report CSV</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDocketIds([])} className="text-white hover:bg-blue-700 text-xs">
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Search & Filter Pills */}
          <div className="space-y-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by LR number, customer, destination city..."
                value={shipmentSearch}
                onChange={(e) => setShipmentSearch(e.target.value)}
                className="pl-11 bg-white border-slate-200/90 shadow-saas h-12 text-sm"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-4 pointer-events-none" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {SHIPMENT_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
                      statusFilter === filter
                        ? 'bg-[#2563EB] text-white shadow-saas'
                        : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  className="bg-white border-slate-200/90 shadow-2xs h-9 text-xs w-[140px]"
                  aria-label="From date"
                />
                <span className="text-xs text-slate-400 font-medium">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="bg-white border-slate-200/90 shadow-2xs h-9 text-xs w-[140px]"
                  aria-label="To date"
                />
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer px-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card View: Rendered on mobile screens always, and on desktop when shipmentViewMode === 'cards' */}
          <div className={shipmentViewMode === 'cards' ? 'block' : 'block md:hidden'}>
            {filteredDockets.length === 0 ? (
              <Card className="p-8 text-center text-xs text-slate-400 font-medium shadow-saas">
                No shipments found matching your criteria.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDockets.map((d) => {
                  const isVoided = d.status === 'voided';
                  const isSelected = selectedDocketIds.includes(d.id);

                  return (
                    <Card
                      key={d.id}
                      onClick={() => setSelectedDocketForDetail(d)}
                      className={`p-4 border transition-saas cursor-pointer active:scale-[0.99] flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#2563EB] bg-[#F0F5FF] shadow-saas'
                          : isVoided
                          ? 'border-red-200/70 bg-red-50/20 shadow-2xs'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 shadow-saas'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Header Row: Checkbox, LR No, Booking Date & Grand Total */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectDocket(d.id, e);
                              }}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                              aria-label="Select shipment"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold text-sm tracking-tight ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {d.docket_no}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium">
                                  {d.booking_date}
                                </span>
                              </div>
                              {d.physical_docket_no && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  Paper LR: {d.physical_docket_no}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className={`font-mono font-bold text-base ${isVoided ? 'line-through text-slate-400' : 'text-[#2563EB]'}`}>
                              ₹{Number(d.grand_total).toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {d.charged_weight_kg} kg · {d.package_count} {d.package_count === 1 ? 'pkg' : 'pkgs'}
                            </div>
                          </div>
                        </div>

                        {/* Route & Parties */}
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span className="truncate">{d.from_city}</span>
                            <span className="text-slate-400 font-normal px-1.5">→</span>
                            <span className="truncate">{d.to_city}</span>
                            <span className="ml-auto text-[11px] text-slate-500 font-medium px-2 py-0.5 bg-white border border-slate-200/60 rounded-md">
                              {d.transport_mode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 border-t border-slate-100/80">
                            <span className="truncate max-w-[48%]">
                              From: <strong className="text-slate-700 font-medium">{d.consignor_name}</strong>
                            </span>
                            <span className="truncate max-w-[48%] text-right">
                              To: <strong className="text-slate-700 font-medium">{d.consignee_name}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Badges Row */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isVoided ? (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                                VOIDED
                              </Badge>
                            ) : (
                              <Badge
                                variant={d.payment_mode === 'Paid' ? 'success' : d.payment_mode === 'Credit' ? 'warning' : 'info'}
                                className="text-[10px] px-2 py-0.5"
                              >
                                {d.payment_mode}
                              </Badge>
                            )}
                            {!isVoided && (
                              <Badge
                                variant={deliveryStatusBadgeVariant(d.delivery_status)}
                                className="text-[10px] px-2 py-0.5"
                              >
                                {d.delivery_status || 'Booked'}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-[#2563EB] font-medium flex items-center gap-0.5">
                            View Details →
                          </span>
                        </div>
                      </div>

                      {/* Quick Action Buttons Row */}
                      <div
                        className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isVoided ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentModalDocket(d)}
                            className="h-8 text-[11px] font-semibold gap-1 text-slate-700 hover:text-[#2563EB] hover:bg-blue-50 border-slate-200"
                          >
                            <Wallet className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>Update Pay</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                            className="h-8 text-[11px] text-slate-300 border-slate-100"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Voided</span>
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTrackingModalDocket(d)}
                          className="h-8 text-[11px] font-semibold gap-1 text-slate-700 hover:text-[#2563EB] hover:bg-blue-50 border-slate-200"
                        >
                          <Truck className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Status</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateInvoicePDF(d)}
                          className="h-8 text-[11px] font-semibold gap-1 text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>PDF</span>
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop Table View (rendered when shipmentViewMode === 'table') */}
          {shipmentViewMode === 'table' && (
            <Card className="hidden md:block overflow-hidden border border-slate-200/80 shadow-saas p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-500 font-semibold tracking-wider text-xs">
                  <tr>
                    <th className="px-4 py-4 w-12 text-center">
                      <button onClick={toggleSelectAll} className="cursor-pointer text-slate-500 hover:text-slate-900">
                        {selectedDocketIds.length === filteredDockets.length && filteredDockets.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-5 py-4">LR NO.</th>
                    <th className="px-5 py-4">CUSTOMER</th>
                    <th className="px-5 py-4">ROUTE</th>
                    <th className="px-5 py-4">DATE</th>
                    <th className="px-5 py-4">WEIGHT</th>
                    <th className="px-5 py-4">AMOUNT</th>
                    <th className="px-5 py-4">STATUS / PAYMENT</th>
                    <th className="px-5 py-4">DELIVERY</th>
                    <th className="px-5 py-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDockets.map((d) => {
                    const isVoided = d.status === 'voided';
                    const isSelected = selectedDocketIds.includes(d.id);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDocketForDetail(d)}
                        className={`transition-saas cursor-pointer h-16 ${
                          isSelected
                            ? 'bg-[#EEF4FF]'
                            : isVoided
                            ? 'bg-red-50/20 text-slate-400'
                            : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="px-4 py-4 text-center" onClick={(e) => toggleSelectDocket(d.id, e)}>
                          <button className="cursor-pointer">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 hover:text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-4 font-mono font-semibold text-xs">
                          <div className={isVoided ? 'line-through text-slate-400' : 'text-slate-900'}>{d.docket_no}</div>
                          {d.physical_docket_no && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              Paper LR: {d.physical_docket_no}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-semibold text-sm ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {d.consignor_name}
                          </div>
                          <div className="text-xs text-slate-400">{d.consignee_name}</div>
                        </td>
                        <td className={`px-5 py-4 text-xs ${isVoided ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {d.from_city} → {d.to_city}
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium text-xs">{d.booking_date}</td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-700">{d.charged_weight_kg} kg</td>
                        <td className={`px-5 py-4 font-bold font-mono text-xs ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          ₹{Number(d.grand_total).toLocaleString('en-IN')}
                        </td>
                        <td className="px-5 py-4">
                          {isVoided ? (
                            <Badge variant="destructive">
                              VOIDED
                            </Badge>
                          ) : (
                            <Badge
                              variant={d.payment_mode === 'Paid' ? 'success' : d.payment_mode === 'Credit' ? 'warning' : 'info'}
                            >
                              {d.payment_mode}
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {!isVoided && (
                            <Badge variant={deliveryStatusBadgeVariant(d.delivery_status)}>
                              {d.delivery_status || 'Booked'}
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setTrackingModalDocket(d)} title="Edit tracking timeline">
                              <Truck className="w-4 h-4 text-slate-400 hover:text-[#2563EB]" />
                            </Button>
                            {!isVoided && (
                              <Button variant="ghost" size="icon" onClick={() => setPaymentModalDocket(d)} title="Record payment">
                                <Wallet className="w-4 h-4 text-slate-400 hover:text-[#2563EB]" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => generateInvoicePDF(d)} title="Download PDF">
                              <Download className="w-4 h-4 text-slate-400 hover:text-slate-700" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          )}
        </div>
      )}


      {/* 3. CUSTOMERS TAB (Mockup 4) */}
      {activeTab === 'customers' && <CustomerManager />}

      {/* 3b. DRAFTS TAB — half-filled LRs saved for later */}
      {activeTab === 'drafts' && (
        <DraftList
          onEdit={(draft) => {
            setEditingDraft(draft);
            setActiveTab('new_lr');
          }}
        />
      )}

      {/* 4. NEW LR CREATION WIZARD TAB (Mockup 5) */}
      {activeTab === 'new_lr' && (
        <CargoDocketForm
          key={editingDraft?.id || 'new'}
          ref={cargoFormRef}
          draftId={editingDraft?.id}
          initialData={editingDraft?.data}
          onBack={() => handleTabChange('dashboard')}
          onCreated={() => {
            setRefreshKey((prev) => prev + 1);
            setEditingDraft(null);
            setActiveTab('shipments');
          }}
        />
      )}

      {/* 5. FINANCE TABS */}
      {activeTab === 'billing' && <BillingView ref={billFormRef} dockets={dockets} customers={customersList} />}
      {activeTab === 'quotation' && <QuotationView />}
      {activeTab === 'expenses' && <ExpensesView totalRevenue={totalRevenue} isAdmin={isAdmin} />}

      {/* 6. REPORTS TAB — admin-only; nav hides the tab for staff, this guards direct state access too */}
      {activeTab === 'reports' && isAdmin && (
        <ReportsView dockets={dockets} cashLog={cashLog} customers={customersList} />
      )}

      {/* 6b. CASH BOOK TAB — admin-only; nav hides the tab for staff, this guards direct state access too */}
      {activeTab === 'cash_book' && isAdmin && (
        <CashBookView customers={customersList} onNavigateToShipments={() => setActiveTab('shipments')} />
      )}

      {/* 7. SETTINGS TAB */}
      {activeTab === 'settings' && <CompanySettingsView />}
      {activeTab === 'staff' && <StaffManager />}

      {/* Tracking timeline editor, opened from a Shipments row action */}
      {trackingModalDocket && (
        <TrackingTimelineModal
          docket={trackingModalDocket}
          onClose={() => setTrackingModalDocket(null)}
        />
      )}

      {/* Payment ledger, opened from a Shipments row action */}
      {paymentModalDocket && (
        <RecordPaymentModal
          docket={paymentModalDocket}
          onClose={() => {
            setPaymentModalDocket(null);
            setRefreshKey((prev) => prev + 1);
          }}
        />
      )}

      {/* Unsaved-changes guard when navigating away from a dirty New LR form */}
      {pendingNav && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-2">Unsaved changes</h3>
            <p className="text-xs text-slate-600 mb-4">
              {pendingNavSource === 'bill'
                ? "This bill hasn't been issued yet. Save it as a draft to finish later, or discard your changes."
                : "This LR hasn't been issued yet. Save it as a draft to finish later, or discard your changes."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => resolvePendingNav('cancel')}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => resolvePendingNav('discard')}
                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded text-sm font-semibold"
              >
                Discard
              </button>
              <button
                onClick={() => resolvePendingNav('save')}
                disabled={leaveSaving}
                className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded text-sm font-bold disabled:opacity-50"
              >
                {leaveSaving ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
