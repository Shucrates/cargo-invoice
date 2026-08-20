'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  User,
  Activity,
  Ban,
  Calendar,
  ChevronRight,
  MapPin,
} from 'lucide-react';

/** How many dockets the shipments table loads at a time. */
const DOCKET_PAGE_SIZE = 100;

const SHIPMENT_FILTERS = ['All', 'Issued', 'To Pay', 'Paid', 'Credit', 'Voided'] as const;
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

function KpiSparkline({
  data = [10, 14, 18, 15, 22, 28, 35],
  color = '#0A2030',
  gradientId = 'spark-grad-default',
  width = 96,
  height = 36,
}: {
  data?: number[];
  color?: string;
  gradientId?: string;
  width?: number;
  height?: number;
}) {
  const points = data && data.length > 1 ? data : [data?.[0] || 0, data?.[0] || 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const padding = 3;
  const effectiveH = height - padding * 2;

  const pts = points.map((val, idx) => {
    const x = (idx / (points.length - 1 || 1)) * width;
    const y = height - padding - ((val - min) / range) * effectiveH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `M 0,${height} L ${pts.join(' L ')} L ${width},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-20 sm:w-24 h-9 overflow-visible shrink-0"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getTrendBuckets<T>(
  items: T[],
  getDate: (item: T) => string | undefined,
  getValue: (item: T) => number,
  bucketCount = 7
): number[] {
  if (!items || items.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  const sorted = [...items]
    .filter((i) => getDate(i))
    .sort((a, b) => (getDate(a)! > getDate(b)! ? 1 : -1));

  if (sorted.length === 0) return [0, 0, 0, 0, 0, 0, 0];

  const bucketSize = Math.max(1, Math.ceil(sorted.length / bucketCount));
  const buckets: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const chunk = sorted.slice(i * bucketSize, (i + 1) * bucketSize);
    const sum = chunk.reduce((acc, curr) => acc + getValue(curr), 0);
    buckets.push(sum);
  }
  if (buckets.every((v) => v === 0) && sorted.length > 0) {
    return [2, 5, 8, 12, 16, 20, 25];
  }
  return buckets;
}

function getGrowthPercentage(buckets: number[]): { text: string; isPositive: boolean } {
  if (buckets.length < 2) return { text: '+0.0%', isPositive: true };
  const mid = Math.floor(buckets.length / 2);
  const firstHalf = buckets.slice(0, mid).reduce((a, b) => a + b, 0);
  const secondHalf = buckets.slice(mid).reduce((a, b) => a + b, 0);
  if (firstHalf === 0 && secondHalf === 0) return { text: '+0.0%', isPositive: true };
  if (firstHalf === 0) return { text: `+${Math.min(99, secondHalf * 8)}%`, isPositive: true };
  const pct = ((secondHalf - firstHalf) / (firstHalf || 1)) * 100;
  const isPositive = pct >= 0;
  return {
    text: `${isPositive ? '+' : ''}${pct.toFixed(1)}%`,
    isPositive,
  };
}

function formatActivityTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (isNaN(diffMins) || diffMins < 0) return 'Recent';
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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

  // Sync activeTab with URL query parameter ?tab=... so browser refresh & back/forward keep active section
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as NavTab | null;
    const validTabs: NavTab[] = [
      'dashboard',
      'shipments',
      'drafts',
      'customers',
      'billing',
      'quotation',
      'expenses',
      'reports',
      'cash_book',
      'settings',
      'staff',
      'new_lr',
    ];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }

    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const currentTab = currentParams.get('tab') as NavTab | null;
      if (currentTab && validTabs.includes(currentTab)) {
        setActiveTab(currentTab);
      } else {
        setActiveTab('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
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
  const [draftTotal, setDraftTotal] = useState(0);
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
  const [shipmentViewMode, setShipmentViewMode] = useState<'cards' | 'table'>('table');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activityFilter, setActivityFilter] = useState<'All' | 'LRs' | 'Payments' | 'Voids'>('All');
  const [activityLimit, setActivityLimit] = useState(8);

  const recentActivities = useMemo(() => {
    interface ActivityFeedItem {
      id: string;
      type: 'created' | 'payment' | 'voided';
      title: string;
      docketNo: string;
      detail: string;
      performer: string;
      amount?: number;
      timestamp: Date;
      docketObj?: CargoDocket;
    }

    const items: ActivityFeedItem[] = [];

    // 1. Docket Creations & Voids
    dockets.forEach((d) => {
      const createdDate = d.created_at ? new Date(d.created_at) : new Date(d.booking_date);
      items.push({
        id: `created-${d.id}`,
        type: 'created',
        title: 'LR Issued',
        docketNo: d.docket_no,
        detail: `${d.consignor_name} (${d.from_city?.split(',')[0] || ''} → ${d.to_city?.split(',')[0] || ''})`,
        performer: d.created_by_name || 'Staff User',
        amount: Number(d.grand_total || 0),
        timestamp: createdDate,
        docketObj: d,
      });

      if (d.status === 'voided') {
        const voidedDate = d.voided_at ? new Date(d.voided_at) : new Date(d.updated_at || d.created_at);
        items.push({
          id: `voided-${d.id}`,
          type: 'voided',
          title: 'LR Voided',
          docketNo: d.docket_no,
          detail: d.void_reason ? `Reason: ${d.void_reason}` : 'LR voided in system',
          performer: d.voided_by_name || 'Admin User',
          amount: Number(d.grand_total || 0),
          timestamp: voidedDate,
          docketObj: d,
        });
      }
    });

    // 2. Cash Payments / Collections
    cashLog.forEach((p) => {
      const paidDate = new Date(p.paid_at);
      const relatedDocket = dockets.find((d) => d.docket_no === p.docket_no || d.id === p.docket_id);
      items.push({
        id: `payment-${p.id}`,
        type: 'payment',
        title: `Payment Collected (${p.method})`,
        docketNo: p.docket_no || relatedDocket?.docket_no || 'N/A',
        detail: p.notes ? p.notes : relatedDocket ? `Party: ${relatedDocket.consignor_name}` : 'Payment recorded',
        performer: p.recorded_by_name || 'Staff User',
        amount: Number(p.amount || 0),
        timestamp: paidDate,
        docketObj: relatedDocket,
      });
    });

    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [dockets, cashLog]);

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'LRs') return recentActivities.filter((a) => a.type === 'created');
    if (activityFilter === 'Payments') return recentActivities.filter((a) => a.type === 'payment');
    if (activityFilter === 'Voids') return recentActivities.filter((a) => a.type === 'voided');
    return recentActivities;
  }, [recentActivities, activityFilter]);

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

  const fetchDraftCount = async () => {
    try {
      const res = await fetch('/api/dockets/drafts');
      if (res.ok) {
        const data = await res.json();
        setDraftTotal((data.drafts ?? []).length);
      }
    } catch (err) {
      console.error('Failed to fetch draft count:', err);
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
      fetchDraftCount();
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
      case 'Credit':
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

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url.toString());
    }
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



  return (
    <AppShell activeTab={activeTab} onTabChange={handleTabChange} navCounts={{ shipments: docketTotal, drafts: draftTotal }}>
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
                        ? 'bg-white text-[#0A2030] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Essential KPI Cards (Dynamically Filtered by Timeframe with Sparklines & Growth) */}
          {(() => {
            // Trend Buckets for KPI Sparklines & Growth
            const pendingBuckets = getTrendBuckets(
              activeTimeDockets.filter((d) => d.delivery_status !== 'Delivered'),
              (d) => d.booking_date,
              () => 1
            );
            const pendingGrowth = getGrowthPercentage(pendingBuckets);

            const completedBuckets = getTrendBuckets(
              activeTimeDockets.filter((d) => d.delivery_status === 'Delivered'),
              (d) => d.booking_date,
              () => 1
            );
            const completedGrowth = getGrowthPercentage(completedBuckets);

            const cashBuckets = getTrendBuckets(
              timeframeCashPayments.length > 0
                ? timeframeCashPayments
                : activeTimeDockets.filter((d) => d.payment_mode === 'Paid'),
              (item: any) => item.paid_at || item.booking_date,
              (item: any) => Number(item.amount || item.grand_total || 0)
            );
            const cashGrowth = getGrowthPercentage(cashBuckets);

            const outstandingBuckets = getTrendBuckets(
              timeframeUnpaidDockets,
              (d) => d.booking_date,
              (d) => Number(d.amount_due ?? (d.payment_mode === 'Paid' ? 0 : d.grand_total || 0))
            );
            const outstandingGrowth = getGrowthPercentage(outstandingBuckets);

            const inTransitBuckets = getTrendBuckets(
              activeTimeDockets.filter((d) => ['In Transit', 'Out for Delivery'].includes(d.delivery_status || '')),
              (d) => d.booking_date,
              () => 1
            );
            const inTransitGrowth = getGrowthPercentage(inTransitBuckets);

            const staffCashBuckets = getTrendBuckets(
              timeframeCashPayments,
              (c) => c.paid_at,
              (c) => Number(c.amount || 0)
            );
            const staffCashGrowth = getGrowthPercentage(staffCashBuckets);

            const kpiCards = isAdmin
              ? [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(timeframePendingDeliveries),
                    growth: pendingGrowth.text,
                    isPositive: pendingGrowth.isPositive,
                    sub: `Delivery in progress`,
                    sparklineData: pendingBuckets,
                    sparklineColor: '#B7791F',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(timeframeCompletedDeliveries),
                    growth: completedGrowth.text,
                    isPositive: completedGrowth.isPositive,
                    sub: `Marked Delivered`,
                    sparklineData: completedBuckets,
                    sparklineColor: '#1F8A4C',
                  },
                  {
                    key: 'cash',
                    label: `CASH COLLECTED (${timeframeShortLabel.toUpperCase()})`,
                    value: formatINR(timeframeCashCollected),
                    growth: cashGrowth.text,
                    isPositive: cashGrowth.isPositive,
                    sub: '',
                    expected: formatINR(kpis?.cashExpectedThisMonth ?? 0),
                    sparklineData: cashBuckets,
                    sparklineColor: '#0A2030',
                  },
                  {
                    key: 'outstanding',
                    label: 'OUTSTANDING DUE',
                    value: formatINR(timeframeOutstandingDue),
                    growth: outstandingGrowth.text,
                    isPositive: !outstandingGrowth.isPositive,
                    sub: `${timeframeUnpaidCount} unpaid ${timeframeUnpaidCount === 1 ? 'bill' : 'bills'}`,
                    subColor: 'text-[#D14343]',
                    sparklineData: outstandingBuckets,
                    sparklineColor: '#D14343',
                  },
                ]
              : [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(timeframePendingDeliveries),
                    growth: pendingGrowth.text,
                    isPositive: pendingGrowth.isPositive,
                    sub: `Delivery in progress`,
                    sparklineData: pendingBuckets,
                    sparklineColor: '#B7791F',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(timeframeCompletedDeliveries),
                    growth: completedGrowth.text,
                    isPositive: completedGrowth.isPositive,
                    sub: `Marked Delivered`,
                    sparklineData: completedBuckets,
                    sparklineColor: '#1F8A4C',
                  },
                  {
                    key: 'transit',
                    label: 'IN TRANSIT',
                    value: String(timeframeInTransit),
                    growth: inTransitGrowth.text,
                    isPositive: inTransitGrowth.isPositive,
                    sub: `Moving or out for delivery`,
                    sparklineData: inTransitBuckets,
                    sparklineColor: '#0A2030',
                  },
                  {
                    key: 'my_cash',
                    label: 'CASH COLLECTED BY YOU',
                    value: formatINR(kpis?.myCashCollectedToday ?? 0),
                    growth: staffCashGrowth.text,
                    isPositive: staffCashGrowth.isPositive,
                    sub: `Week: ${formatINR(kpis?.myCashCollectedThisWeek ?? 0)}`,
                    sparklineData: staffCashBuckets,
                    sparklineColor: '#0A2030',
                  },
                ];

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {kpiCards.map((card) => (
                  <Card
                    key={card.key}
                    className="p-5 sm:p-6 transition-saas hover:-translate-y-0.5 shadow-saas flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Label */}
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2 truncate">
                        {card.label}
                      </span>

                      {/* Value */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                          {card.value}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Context details on left, Sparkline on right */}
                    <div className="flex items-end justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <div
                          className={`text-xs font-medium truncate ${
                            card.subColor ?? 'text-slate-500'
                          }`}
                        >
                          {card.sub}
                        </div>
                        {card.expected && (
                          <div className="text-[11px] font-medium text-slate-500 truncate">
                            Expected:{' '}
                            <span className="font-semibold text-amber-600 font-mono">{card.expected}</span>
                          </div>
                        )}
                      </div>

                      <KpiSparkline
                        data={card.sparklineData}
                        color={card.sparklineColor}
                        gradientId={`spark-${card.key}`}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            );
          })()}

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

          {/* Recent Activity Operations & Audit Log Card */}
          <Card className="p-6 shadow-saas space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0A2030]" />
                  <h3 className="text-base font-bold text-slate-900">Recent Operations & Audit Log</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Real-time operational stream — who created LRs, collected cash, or voided records
                </p>
              </div>

              {/* Activity Filter Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs self-start sm:self-auto">
                {(['All', 'LRs', 'Payments', 'Voids'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActivityFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                      activityFilter === filter
                        ? 'bg-white text-[#0A2030] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {filteredActivities.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No recent activity records found matching &ldquo;{activityFilter}&rdquo;.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-[460px] overflow-y-auto pr-1 divide-y divide-slate-100">
                  {filteredActivities.slice(0, activityLimit).map((act) => {
                    const isCreated = act.type === 'created';
                    const isPayment = act.type === 'payment';
                    const isVoided = act.type === 'voided';

                    return (
                      <div
                        key={act.id}
                        onClick={() => act.docketObj && setSelectedDocketForDetail(act.docketObj)}
                        className="py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8FAFC] rounded-xl transition-saas cursor-pointer"
                      >
                        {/* Left: Type Icon + Title + Detail */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                              isCreated
                                ? 'bg-blue-50 text-[#0A2030] border border-blue-100'
                                : isPayment
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}
                          >
                            {isCreated && <Package className="w-4 h-4" />}
                            {isPayment && <Wallet className="w-4 h-4" />}
                            {isVoided && <Ban className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">{act.title}</span>
                              <span className="text-[11px] font-semibold font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                #{act.docketNo}
                              </span>
                              {isVoided && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Voided
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {act.detail}
                            </div>
                          </div>
                        </div>

                        {/* Right: Amount + Performer Name & Time */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          {act.amount !== undefined && (
                            <div className="text-right">
                              <div className="text-xs font-bold font-mono text-slate-900">
                                ₹{act.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          )}

                          <div className="text-right flex flex-col items-end">
                            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200/60">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[140px]">{act.performer}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium mt-1">
                              {formatActivityTimeAgo(act.timestamp)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Controls for Large Volume of Entries */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">
                    Showing {Math.min(activityLimit, filteredActivities.length)} of {filteredActivities.length} activities
                  </span>
                  <div className="flex items-center gap-2">
                    {activityLimit < filteredActivities.length ? (
                      <button
                        type="button"
                        onClick={() => setActivityLimit((prev) => prev + 10)}
                        className="text-[#0A2030] font-semibold hover:underline cursor-pointer"
                      >
                        Show 10 More ↓
                      </button>
                    ) : (
                      filteredActivities.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setActivityLimit(8)}
                          className="text-slate-500 font-medium hover:underline cursor-pointer"
                        >
                          Show Less ↑
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
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
              {/* Desktop View Switcher (List vs Cards) */}
              <div className="hidden sm:inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShipmentViewMode('table')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    shipmentViewMode === 'table'
                      ? 'bg-white text-[#0A2030] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="List / Table View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShipmentViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    shipmentViewMode === 'cards'
                      ? 'bg-white text-[#0A2030] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Card View (Quick Actions)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
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
            <div className="bg-[#0A2030] text-white p-4 rounded-2xl flex items-center justify-between shadow-saas-modal text-xs transition-saas">
              <div className="flex items-center gap-2.5 font-medium">
                <FileCheck className="w-5 h-5 text-blue-200" />
                <span><strong className="text-white text-sm">{selectedDocketIds.length}</strong> invoices selected</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Button size="sm" variant="secondary" onClick={handleBatchPDFDownload} className="gap-1.5 text-xs font-semibold bg-white text-[#0A2030] hover:bg-[#0A2030]/10">
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDFs ({selectedDocketIds.length})</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={handleBatchCSVExport} className="gap-1.5 text-xs font-semibold bg-white text-slate-800 hover:bg-slate-100">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Report CSV</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedDocketIds([])} className="text-white hover:bg-[#071520] text-xs">
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
                        ? 'bg-[#0A2030] text-white shadow-saas'
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
              <div className="grid grid-cols-1 gap-4">
                {filteredDockets.map((d) => {
                  const isVoided = d.status === 'voided';
                  const isSelected = selectedDocketIds.includes(d.id);
                  const vehicleImage =
                    d.transport_mode === 'Air'
                      ? '/images/plane.jpg'
                      : d.transport_mode === 'Train'
                      ? '/images/train.jpg'
                      : '/images/truck.jpg';

                  const statusLower = (d.delivery_status || 'Booked').toLowerCase();
                  const isDelivered = statusLower.includes('deliver');
                  const isInTransit = statusLower.includes('transit') || statusLower.includes('out') || isDelivered;

                  return (
                    <Card
                      key={d.id}
                      onClick={() => setSelectedDocketForDetail(d)}
                      className={`p-5 sm:p-6 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#0A2030] bg-[#0A2030]/5 ring-2 ring-[#0A2030]/10 shadow-saas'
                          : isVoided
                          ? 'border-red-200 bg-red-50/20 opacity-85'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 shadow-saas hover:shadow-md'
                      }`}
                    >
                      {/* MOBILE VIEW (Matching Image 2 1-to-1 on small screens) */}
                      <div className="block md:hidden space-y-4">
                        {/* Top Row: Checkbox, LR #, Payment Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectDocket(d.id, e);
                              }}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 shrink-0"
                              aria-label="Select shipment"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-[#0A2030]" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300" />
                              )}
                            </button>
                            <span className={`font-mono font-extrabold text-base tracking-tight ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              LR #{d.docket_no}
                            </span>
                          </div>

                          <Badge
                            variant={isVoided ? 'destructive' : d.payment_mode === 'Paid' ? 'success' : 'warning'}
                            className="text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider"
                          >
                            {isVoided ? 'Voided' : d.payment_mode || 'Credit'}
                          </Badge>
                        </div>

                        {d.physical_docket_no && (
                          <div className="text-xs font-mono text-slate-400 -mt-2">
                            (Paper: {d.physical_docket_no})
                          </div>
                        )}

                        {/* Route Box (Mobile Screenshot Match) */}
                        <div className="bg-slate-50/70 border border-slate-200/60 rounded-2xl p-3 flex items-center justify-center gap-3">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <MapPin className="w-3.5 h-3.5 text-[#0A2030]" />
                            <span>{d.from_city}</span>
                          </div>
                          <span className="text-slate-400 text-xs">→</span>
                          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                            <MapPin className="w-3.5 h-3.5 text-[#0A2030]" />
                            <span>{d.to_city}</span>
                          </div>
                        </div>

                        {/* From / To Parties (Mobile) */}
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
                          <span>From: <strong className="text-slate-800 font-bold">{d.consignor_name}</strong></span>
                          <span className="text-slate-300">|</span>
                          <span>To: <strong className="text-slate-800 font-bold">{d.consignee_name}</strong></span>
                        </div>

                        {/* Created by & Created on side-by-side (Mobile) */}
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Created by</span>
                              <span className="text-xs font-bold text-slate-800">{d.created_by_name || 'Staff User'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">Created on</span>
                              <span className="text-xs font-bold text-slate-800 font-mono">{d.booking_date}</span>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 my-2" />

                        {/* Total Amount & Vehicle Image Row (Mobile) */}
                        <div className="flex items-center justify-between relative min-h-[70px]">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">TOTAL AMOUNT</span>
                            <span className={`font-mono font-extrabold text-3xl ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              ₹{Number(d.grand_total).toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="w-44 h-24 relative pointer-events-none mix-blend-multiply flex items-center justify-end">
                            <img
                              src={vehicleImage}
                              alt={d.transport_mode || 'Road'}
                              className="w-full h-full object-contain object-right"
                            />
                          </div>
                        </div>

                        {/* Timeline Box (Mobile) */}
                        <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-3">
                          <div className="flex items-center gap-1 w-full text-[9px] font-semibold">
                            {['Booked', 'Dispatched', 'In Transit', 'Out for Delivery', 'Delivered'].map((stepName, idx, arr) => {
                              const stepLower = stepName.toLowerCase();
                              const currentLower = (d.delivery_status || 'Booked').toLowerCase();

                              let isPassed = false;
                              let isCurrent = false;

                              if (currentLower.includes('deliver')) {
                                isPassed = true;
                                if (stepLower.includes('deliver')) isCurrent = true;
                              } else if (currentLower.includes('out')) {
                                if (idx <= 3) isPassed = true;
                                if (stepLower.includes('out')) isCurrent = true;
                              } else if (currentLower.includes('transit')) {
                                if (idx <= 2) isPassed = true;
                                if (stepLower.includes('transit')) isCurrent = true;
                              } else if (currentLower.includes('dispatch')) {
                                if (idx <= 1) isPassed = true;
                                if (stepLower.includes('dispatch')) isCurrent = true;
                              } else {
                                if (idx === 0) {
                                  isPassed = true;
                                  isCurrent = true;
                                }
                              }

                              return (
                                <div key={stepName} className="flex flex-col items-center flex-1 min-w-0 relative">
                                  <div className="flex items-center w-full">
                                    {idx > 0 ? (
                                      <div className={`flex-1 h-0.5 ${isPassed ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                    ) : (
                                      <div className="flex-1 opacity-0" />
                                    )}

                                    <div
                                      className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                                        isCurrent
                                          ? 'bg-slate-900 ring-2 ring-slate-200'
                                          : isPassed
                                          ? 'bg-slate-800'
                                          : 'bg-slate-200'
                                      }`}
                                    >
                                      {(isPassed || isCurrent) && <div className="w-1 h-1 bg-white rounded-full" />}
                                    </div>

                                    {idx < arr.length - 1 ? (
                                      <div className={`flex-1 h-0.5 ${isPassed && !isCurrent ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                    ) : (
                                      <div className="flex-1 opacity-0" />
                                    )}
                                  </div>

                                  <span className={`mt-1.5 truncate max-w-[55px] text-center text-[9px] ${isCurrent ? 'text-slate-900 font-extrabold' : isPassed ? 'text-slate-700 font-semibold' : 'text-slate-400 font-normal'}`}>
                                    {stepName}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Stacked Full-Width Buttons with Chevrons (Mobile) */}
                        <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
                          {!isVoided ? (
                            <button
                              type="button"
                              onClick={() => setPaymentModalDocket(d)}
                              className="w-full py-3 px-4 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-between cursor-pointer shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <Wallet className="w-4 h-4 text-slate-700" />
                                <span>Update Pay</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                          ) : (
                            <div className="w-full py-3 px-4 text-xs text-slate-400 font-medium bg-slate-50 rounded-xl text-center">
                              Voided
                            </div>
                          )}

                          {!isVoided && (
                            <button
                              type="button"
                              onClick={() => setTrackingModalDocket(d)}
                              className="w-full py-3 px-4 text-xs font-bold rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 text-slate-900 flex items-center justify-between cursor-pointer shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <Truck className="w-4 h-4 text-slate-800" />
                                <span>Update Status</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* DESKTOP VIEW (Visible on md:flex / medium & large screens) */}
                      <div className="hidden md:flex flex-col justify-between space-y-6">
                        {/* Vehicle image clipped outside right border — larger size, mix-blend-multiply removes white background! */}
                        <div className="absolute -right-6 top-10 w-64 md:w-80 lg:w-[380px] h-36 md:h-44 pointer-events-none opacity-85 flex items-center justify-end z-0 mix-blend-multiply">
                          <img
                            src={vehicleImage}
                            alt={d.transport_mode || 'Road'}
                            className="w-full h-full object-contain object-right"
                          />
                        </div>

                        {/* TOP ROW: Checkbox + LR Number + Payment Badge --- FAR RIGHT (RIGHT ABOVE TRUCK): Total Amount */}
                        <div className="relative z-10 flex items-start justify-between gap-4 pr-16 md:pr-44">
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectDocket(d.id, e);
                              }}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 shrink-0"
                              aria-label="Select shipment"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-[#0A2030]" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300" />
                              )}
                            </button>

                            <span className={`font-mono font-extrabold text-lg sm:text-xl tracking-tight ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              LR #{d.docket_no}
                            </span>

                            {/* Payment Badge Pill */}
                            <Badge
                              variant={isVoided ? 'destructive' : d.payment_mode === 'Paid' ? 'success' : 'warning'}
                              className="text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider"
                            >
                              {isVoided ? 'Voided' : d.payment_mode || 'Credit'}
                            </Badge>

                            {d.physical_docket_no && (
                              <span className="text-xs font-mono text-slate-400">
                                (Paper: {d.physical_docket_no})
                              </span>
                            )}
                          </div>

                          {/* TOTAL AMOUNT — ALIGNED TO FAR TOP RIGHT, DIRECTLY ABOVE TRUCK */}
                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Total Amount</span>
                            <span className={`font-mono font-extrabold text-2xl sm:text-3xl ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              ₹{Number(d.grand_total).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* MIDDLE ROW: Route & Parties */}
                        <div className="relative z-10 flex flex-col justify-start space-y-1 max-w-lg">
                          <div className="flex items-center gap-3 text-base sm:text-lg font-extrabold text-slate-900">
                            <span>{d.from_city}</span>
                            <span className="text-slate-400 font-normal">→</span>
                            <span>{d.to_city}</span>
                          </div>
                          <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
                            <span>From: <strong className="text-slate-800 font-bold">{d.consignor_name}</strong></span>
                            <span className="text-slate-300 font-light">|</span>
                            <span>To: <strong className="text-slate-800 font-bold">{d.consignee_name}</strong></span>
                          </div>
                        </div>

                        {/* BOTTOM ROW (MORE GAP FROM TRUCK): Created By & Created On + STATUS LINE IN SAME ROW (Left & Center) + Action Buttons (Right) */}
                        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-slate-100 mt-6">
                          {/* Left & Center: Created By / On AND Status Line in SAME row */}
                          <div className="flex items-center gap-6 flex-wrap flex-1">
                            {/* Block 1: Created by */}
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                                <User className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Created by</span>
                                <span className="text-xs font-bold text-slate-800">{d.created_by_name || 'Staff User'}</span>
                              </div>
                            </div>

                            {/* Block 2: Created on */}
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Created on</span>
                                <span className="text-xs font-bold text-slate-800 font-mono">{d.booking_date}</span>
                              </div>
                            </div>

                            {/* Status Line in SAME Row! */}
                            <div className="flex-1 max-w-sm ml-2">
                              <div className="flex items-center gap-1 w-full text-[10px] font-semibold">
                                {['Booked', 'Dispatched', 'In Transit', 'Out for Delivery', 'Delivered'].map((stepName, idx, arr) => {
                                  const stepLower = stepName.toLowerCase();
                                  const currentLower = (d.delivery_status || 'Booked').toLowerCase();

                                  let isPassed = false;
                                  let isCurrent = false;

                                  if (currentLower.includes('deliver')) {
                                    isPassed = true;
                                    if (stepLower.includes('deliver')) isCurrent = true;
                                  } else if (currentLower.includes('out')) {
                                    if (idx <= 3) isPassed = true;
                                    if (stepLower.includes('out')) isCurrent = true;
                                  } else if (currentLower.includes('transit')) {
                                    if (idx <= 2) isPassed = true;
                                    if (stepLower.includes('transit')) isCurrent = true;
                                  } else if (currentLower.includes('dispatch')) {
                                    if (idx <= 1) isPassed = true;
                                    if (stepLower.includes('dispatch')) isCurrent = true;
                                  } else {
                                    if (idx === 0) {
                                      isPassed = true;
                                      isCurrent = true;
                                    }
                                  }

                                  return (
                                    <div key={stepName} className="flex flex-col items-center flex-1 min-w-0 relative">
                                      <div className="flex items-center w-full">
                                        {idx > 0 ? (
                                          <div className={`flex-1 h-0.5 ${isPassed ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                        ) : (
                                          <div className="flex-1 opacity-0" />
                                        )}

                                        <div
                                          className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                                            isCurrent
                                              ? 'bg-slate-900 ring-4 ring-slate-100'
                                              : isPassed
                                              ? 'bg-slate-800'
                                              : 'bg-slate-200'
                                          }`}
                                        >
                                          {(isPassed || isCurrent) && <div className="w-1 h-1 bg-white rounded-full" />}
                                        </div>

                                        {idx < arr.length - 1 ? (
                                          <div className={`flex-1 h-0.5 ${isPassed && !isCurrent ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                        ) : (
                                          <div className="flex-1 opacity-0" />
                                        )}
                                      </div>

                                      <span className={`mt-1 truncate max-w-[55px] text-center text-[9px] ${isCurrent ? 'text-slate-900 font-extrabold' : isPassed ? 'text-slate-700 font-semibold' : 'text-slate-400 font-normal'}`}>
                                        {stepName}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Right Action Buttons */}
                          <div
                            className="flex items-center gap-3 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!isVoided ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPaymentModalDocket(d)}
                                className="h-9 px-4 text-xs font-bold gap-2 text-slate-800 bg-white hover:bg-slate-50 border-slate-200 rounded-xl shadow-2xs"
                              >
                                <Wallet className="w-4 h-4 text-slate-700" />
                                <span>Update Pay</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled
                                className="h-9 px-4 text-xs text-slate-300 border-slate-100 rounded-xl"
                              >
                                <span>Voided</span>
                              </Button>
                            )}

                            {!isVoided && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setTrackingModalDocket(d)}
                                className="h-9 px-4 text-xs font-bold gap-2 text-[#0A2030] bg-blue-50/40 hover:bg-blue-50 border-blue-200/60 rounded-xl shadow-2xs"
                              >
                                <Truck className="w-4 h-4 text-[#0A2030]" />
                                <span>Update Status</span>
                              </Button>
                            )}
                          </div>
                        </div>
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
          onDraftsChanged={setDraftTotal}
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
          onDraftSaved={fetchDraftCount}
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
                className="px-4 py-2 bg-[#0A2030] hover:bg-[#071520] text-white rounded text-sm font-bold disabled:opacity-50"
              >
                {leaveSaving ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for LR Details */}
      <ShipmentDetailView
        docket={selectedDocketForDetail}
        isOpen={!!selectedDocketForDetail}
        onBack={() => setSelectedDocketForDetail(null)}
        onVoidSuccess={() => setRefreshKey((prev) => prev + 1)}
      />
    </AppShell>
  );
}
