'use client';

import { useDialog } from '@/lib/useDialog';
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
import CompanySettingsView, { CompanySettingsViewHandle } from '@/components/CompanySettingsView';
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
import { deliveryStatusBadgeVariant, paymentModeBadgeVariant } from '@/lib/deliveryStatus';
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
  Pencil,
  Save,
} from 'lucide-react';
import { formatRupees } from '@/lib/money';
import { formatDay } from '@/lib/formatDate';
import { notify } from '@/lib/notify';
import { fetchAllPages } from '@/lib/fetchAll';

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
  /** Figures scoped to the selected dashboard timeframe. Money fields are admin-only. */
  period: {
    timeframe: DashboardTimeframe;
    startDate: string;
    endDate: string;
    activeCount: number;
    voidedCount: number;
    pendingDeliveries: number;
    completedDeliveries: number;
    inTransit: number;
    myCashCollected: number;
    revenue?: number;
    subtotal?: number;
    gst?: number;
    outstanding?: number;
    unpaidCount?: number;
    cashExpected?: number;
    cashCollected?: number;
    /** Sparkline series: equal time slices across the period, oldest first. */
    trends: {
      pending: number[];
      completed: number[];
      inTransit: number[];
      myCash: number[];
      outstanding?: number[];
      cash?: number[];
    };
  };
  revenueByMonth?: Record<string, number>;
  bookingsByDay: Record<string, number>;
}

/** Today's date in IST as YYYY-MM-DD. */
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Compact Indian-format currency: ₹1.2L above a lakh, grouped digits below. */
function formatINR(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `${formatRupees(Math.round(amount))}`;
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
  data = [],
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

/** Enter/Space on a focused clickable row acts like a click (ignores keys from inner buttons). */
function openOnKey(e: React.KeyboardEvent, open: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    open();
  }
}

type ShipmentSortKey = 'created' | 'docket' | 'date' | 'amount';
type ShipmentSort = { key: ShipmentSortKey; dir: 'asc' | 'desc' };

/** Table header that sorts the shipments list server-side when clicked. */
function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: ShipmentSortKey;
  sort: ShipmentSort;
  onSort: (next: ShipmentSort) => void;
}) {
  const active = sort.key === sortKey;
  const nextDir = active && sort.dir === 'desc' ? 'asc' : 'desc';
  return (
    <th className="px-5 py-4" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: nextDir })}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-slate-900 ${active ? 'text-slate-900' : ''}`}
      >
        {label}
        <span aria-hidden="true" className={active ? '' : 'opacity-30'}>
          {active && sort.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    </th>
  );
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

  // Browser tab title follows the open section.
  useEffect(() => {
    const titles: Record<NavTab, string> = {
      dashboard: 'Dashboard',
      shipments: 'Shipments',
      drafts: 'Drafts',
      customers: 'Customers',
      billing: 'Billing',
      quotation: 'Quotation',
      expenses: 'Expenses',
      reports: 'Reports',
      cash_book: 'Cash Book',
      settings: 'Company Settings',
      staff: 'Staff Management',
      new_lr: 'New LR',
    };
    const title = `${titles[activeTab]} · Rudra Cargo`;
    document.title = title;
    // Next applies the route's static metadata title after hydration; re-assert ours.
    const t = setTimeout(() => {
      document.title = title;
    }, 500);
    return () => clearTimeout(t);
  }, [activeTab, status]);
  const [dashboardTimeframe, setDashboardTimeframe] = useState<DashboardTimeframe>('month');
  const [refreshKey, setRefreshKey] = useState(0);
  const cargoFormRef = useRef<CargoDocketFormHandle>(null);
  const billFormRef = useRef<BillingViewHandle>(null);
  const settingsFormRef = useRef<CompanySettingsViewHandle>(null);
  const [editingDraft, setEditingDraft] = useState<DocketDraft | null>(null);
  const [editingDocket, setEditingDocket] = useState<CargoDocket | null>(null);
  const [pendingNav, setPendingNav] = useState<NavTab | null>(null);
  const [pendingNavSource, setPendingNavSource] = useState<'lr' | 'bill' | 'settings' | null>(null);
  // Modal behaviour (Escape, focus in/out, Tab trap) for this component's dialogs.
  const pendingNavDialog = useDialog(() => {
    // Escape = "Keep editing": stay on the current form.
    setPendingNav(null);
    setPendingNavSource(null);
  });
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
  // Shipments tab list: filtered and paged on the server so search covers every LR.
  const [shipmentList, setShipmentList] = useState<CargoDocket[]>([]);
  const [shipmentMatchTotal, setShipmentMatchTotal] = useState(0);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [exportingAll, setExportingAll] = useState(false);
  const [batchPdfProgress, setBatchPdfProgress] = useState<string | null>(null);
  const [shipmentSort, setShipmentSort] = useState<ShipmentSort>({
    key: 'created',
    dir: 'desc',
  });
  // Every LR, for views that aggregate or pick from the whole book (Billing,
  // Reports). Loaded on first visit to those tabs and after any change.
  const [allDockets, setAllDockets] = useState<CargoDocket[] | null>(null);
  const allDocketsKey = useRef<number | null>(null);
  const shipmentRequestId = useRef(0);
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
        title: 'Cash Collected',
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

  const fetchKpis = async (timeframe: DashboardTimeframe) => {
    try {
      const res = await fetch(`/api/dashboard/kpis?timeframe=${timeframe}`);
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
      setCashLog(await fetchAllPages<CashPayment>('/api/payments?method=Cash', 'payments'));
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

  /** Query string for the Shipments tab's current search and filters. */
  const shipmentQuery = (offset: number, limit: number) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    if (statusFilter === 'Issued') params.set('status', 'issued');
    if (statusFilter === 'Voided') params.set('status', 'voided');
    if (statusFilter === 'To Pay' || statusFilter === 'Paid' || statusFilter === 'Credit') {
      params.set('status', 'issued');
      params.set('paymentMode', statusFilter);
    }
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (shipmentSort.key !== 'created') params.set('sort', `${shipmentSort.key}_${shipmentSort.dir}`);
    return params.toString();
  };

  const fetchShipments = async (offset: number) => {
    const requestId = ++shipmentRequestId.current;
    setShipmentLoading(true);
    try {
      const res = await fetch(`/api/dockets?${shipmentQuery(offset, DOCKET_PAGE_SIZE)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Ignore responses from a search the user has already moved past.
      if (requestId !== shipmentRequestId.current) return;
      setShipmentList((prev) => (offset === 0 ? data.dockets ?? [] : [...prev, ...(data.dockets ?? [])]));
      // A fresh result set may hide previously selected rows; never act on what isn't shown.
      if (offset === 0) setSelectedDocketIds([]);
      setShipmentMatchTotal(data.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch shipments:', err);
      if (requestId === shipmentRequestId.current) notify('Could not load shipments. Please try again.');
    } finally {
      if (requestId === shipmentRequestId.current) setShipmentLoading(false);
    }
  };

  /** Downloads every LR matching the current filters, not just the loaded page. */
  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const all: CargoDocket[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const res = await fetch(`/api/dockets?${shipmentQuery(offset, pageSize)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        all.push(...(data.dockets ?? []));
        if (!data.hasMore) break;
      }
      exportToCSV(all, `cargo_shipments_${todayIST()}.csv`);
    } catch (err) {
      console.error('Failed to export shipments:', err);
      notify('Export failed. Please try again.');
    } finally {
      setExportingAll(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(shipmentSearch), 300);
    return () => clearTimeout(t);
  }, [shipmentSearch]);

  useEffect(() => {
    if (status !== 'authenticated' || activeTab !== 'shipments') return;
    fetchShipments(0);
  }, [status, activeTab, debouncedSearch, statusFilter, dateFrom, dateTo, shipmentSort, refreshKey]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (status === 'authenticated') {
      fetchDockets();
      fetchCustomers();
      fetchCashLog();
      fetchDraftCount();
    }
  }, [status, router, refreshKey]);

  useEffect(() => {
    if (status !== 'authenticated' || (activeTab !== 'billing' && activeTab !== 'reports')) return;
    if (allDocketsKey.current === refreshKey) return;
    allDocketsKey.current = refreshKey;
    fetchAllPages<CargoDocket>('/api/dockets', 'dockets')
      .then(setAllDockets)
      .catch((err) => {
        console.error('Failed to load all dockets:', err);
        allDocketsKey.current = null;
        notify('Could not load the full LR list. Please refresh.');
      });
  }, [status, activeTab, refreshKey]);

  useEffect(() => {
    if (status === 'authenticated') fetchKpis(dashboardTimeframe);
  }, [status, refreshKey, dashboardTimeframe]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] p-6 md:p-8" aria-busy="true" aria-label="Loading dashboard">
        <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 w-56 rounded-lg bg-slate-200" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-white border border-slate-200/80" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-white border border-slate-200/80" />
        </div>
      </div>
    );
  }

  // Timeframe date filtering & dynamic KPI computations
  const { label: timeframeLabel, shortLabel: timeframeShortLabel } = getISTDateRange(dashboardTimeframe);

  // Timeframe figures come from the server, aggregated over every LR — not
  // just the page of dockets loaded into this view.
  const period = kpis?.period;
  const emptyTrend = [0, 0, 0, 0, 0, 0, 0];
  const activeTimeCount = period?.activeCount ?? 0;
  const voidedTimeCount = period?.voidedCount ?? 0;
  const timeframeTotalSubtotal = period?.subtotal ?? 0;
  const timeframeTotalGST = period?.gst ?? 0;

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

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Filtered dockets for Shipments tab
  const filteredDockets = shipmentList;

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

  const handleBatchPDFDownload = async () => {
    const selected = shipmentList.filter((d) => selectedDocketIds.includes(d.id));
    // One at a time with a short gap — browsers block a burst of simultaneous downloads.
    for (let i = 0; i < selected.length; i++) {
      setBatchPdfProgress(`${i + 1}/${selected.length}`);
      await generateInvoicePDF(selected[i]);
      await new Promise((r) => setTimeout(r, 400));
    }
    setBatchPdfProgress(null);
    if (selected.length > 1) {
      notify(`Downloaded ${selected.length} PDFs. If some are missing, allow multiple downloads for this site.`, 'info');
    }
  };

  const handleBatchCSVExport = () => {
    const selected = shipmentList.filter((d) => selectedDocketIds.includes(d.id));
    exportToCSV(selected, `Selected_Shipments_${selectedDocketIds.length}_Invoices.csv`);
  };


  /** Switches tab and records it in the URL so Back/refresh land in the same place. */
  const goToTab = (tab: NavTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== tab) {
        url.searchParams.set('tab', tab);
        window.history.pushState({}, '', url.toString());
      }
    }
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
    if (activeTab === 'settings' && tab !== 'settings' && settingsFormRef.current?.isDirty) {
      setPendingNav(tab);
      setPendingNavSource('settings');
      return;
    }
    setSelectedDocketForDetail(null);
    setEditingDraft(null);
    setEditingDocket(null);
    goToTab(tab);
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
      else if (pendingNavSource === 'settings') await settingsFormRef.current?.save();
      else await cargoFormRef.current?.saveAsDraft();
      setLeaveSaving(false);
    } else if (action === 'discard') {
      if (pendingNavSource === 'settings') settingsFormRef.current?.discard();
    }
    setSelectedDocketForDetail(null);
    setEditingDraft(null);
    setEditingDocket(null);
    if (pendingNav) goToTab(pendingNav);
    setPendingNav(null);
    setPendingNavSource(null);
  };

  const handleEditDocket = (docket: CargoDocket) => {
    if (!isAdmin) return;
    setEditingDocket(docket);
    setEditingDraft(null);
    setSelectedDocketForDetail(null);
    goToTab('new_lr');
  };



  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      navCounts={{ shipments: docketTotal, drafts: draftTotal }}
      searchValue={shipmentSearch}
      onSearchChange={setShipmentSearch}
    >
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
                    aria-pressed={dashboardTimeframe === t.id}
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
            const trends = period?.trends;
            const unpaidCount = period?.unpaidCount ?? 0;

            const kpiCards = isAdmin
              ? [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(period?.pendingDeliveries ?? 0),
                    sub: `Not yet delivered`,
                    sparklineData: trends?.pending ?? emptyTrend,
                    sparklineColor: '#B7791F',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(period?.completedDeliveries ?? 0),
                    sub: `Marked Delivered`,
                    sparklineData: trends?.completed ?? emptyTrend,
                    sparklineColor: '#1F8A4C',
                  },
                  {
                    key: 'cash',
                    label: `CASH COLLECTED (${timeframeShortLabel.toUpperCase()})`,
                    value: formatINR(period?.cashCollected ?? 0),
                    sub: '',
                    expected: formatINR(period?.cashExpected ?? 0),
                    sparklineData: trends?.cash ?? emptyTrend,
                    sparklineColor: '#0A2030',
                  },
                  {
                    key: 'outstanding',
                    label: 'OUTSTANDING DUE',
                    value: formatINR(period?.outstanding ?? 0),
                    sub: `${unpaidCount} unpaid ${unpaidCount === 1 ? 'LR' : 'LRs'}`,
                    subColor: 'text-[#D14343]',
                    sparklineData: trends?.outstanding ?? emptyTrend,
                    sparklineColor: '#D14343',
                  },
                ]
              : [
                  {
                    key: 'pending',
                    label: 'PENDING LRs',
                    value: String(period?.pendingDeliveries ?? 0),
                    sub: `Not yet delivered`,
                    sparklineData: trends?.pending ?? emptyTrend,
                    sparklineColor: '#B7791F',
                  },
                  {
                    key: 'completed',
                    label: 'COMPLETED DELIVERIES',
                    value: String(period?.completedDeliveries ?? 0),
                    sub: `Marked Delivered`,
                    sparklineData: trends?.completed ?? emptyTrend,
                    sparklineColor: '#1F8A4C',
                  },
                  {
                    key: 'transit',
                    label: 'IN TRANSIT',
                    value: String(period?.inTransit ?? 0),
                    sub: `Moving or out for delivery`,
                    sparklineData: trends?.inTransit ?? emptyTrend,
                    sparklineColor: '#0A2030',
                  },
                  {
                    key: 'my_cash',
                    label: `CASH COLLECTED BY YOU (${timeframeShortLabel.toUpperCase()})`,
                    value: formatINR(period?.myCashCollected ?? 0),
                    sub: `Today: ${formatINR(kpis?.myCashCollectedToday ?? 0)}`,
                    sparklineData: trends?.myCash ?? emptyTrend,
                    sparklineColor: '#0A2030',
                  },
                ];

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                {kpiCards.map((card) => (
                  <Card
                    key={card.key}
                    className="p-4 sm:p-6 transition-saas hover:-translate-y-0.5 shadow-saas flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Label */}
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2 line-clamp-2 sm:truncate">
                        {card.label}
                      </span>

                      {/* Value */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
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
                          <div
                            className="text-[11px] font-medium text-slate-500 truncate"
                            title={`Unpaid cash expected from LRs booked ${timeframeShortLabel === 'All Time' ? 'at any time' : `this ${timeframeShortLabel.toLowerCase()}`}`}
                          >
                            Expected:{' '}
                            <span className="font-semibold text-amber-600 font-mono">{card.expected}</span>
                          </div>
                        )}
                      </div>

                      <div className="hidden sm:block shrink-0">
                        <KpiSparkline
                          data={card.sparklineData}
                          color={card.sparklineColor}
                          gradientId={`spark-${card.key}`}
                        />
                      </div>
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
                    Last 6 months · {timeframeLabel}: Subtotal {formatRupees(timeframeTotalSubtotal)} + GST {formatRupees(timeframeTotalGST)}
                  </p>
                </div>

                <RevenueLineChart revenueByMonth={kpis?.revenueByMonth ?? {}} />
              </Card>
            )}

            <Card className="p-6 space-y-4 shadow-saas">
              <div>
                <h3 className="text-base font-bold text-slate-900">Shipments Volume</h3>
                <p className="text-xs text-slate-500 font-medium">{activeTimeCount} active / {voidedTimeCount} voided ({timeframeLabel})</p>
              </div>

              <ShipmentsBarChart bookingsByDay={kpis?.bookingsByDay ?? {}} />
            </Card>
          </div>

          {/* Recent Activity Operations & Audit Log Card */}
          <Card className="p-6 shadow-saas space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0A2030]" />
                  <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Latest LRs issued, cash collected and LRs voided — refreshes when you reload
                </p>
              </div>

              {/* Activity Filter Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs self-start sm:self-auto">
                {(['All', 'LRs', 'Payments', 'Voids'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActivityFilter(filter)}
                    aria-pressed={activityFilter === filter}
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
                        onKeyDown={(e) => act.docketObj && openOnKey(e, () => setSelectedDocketForDetail(act.docketObj!))}
                        tabIndex={act.docketObj ? 0 : undefined}
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
                                <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
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
                            <div className="text-[11px] text-slate-400 font-medium mt-1">
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
                {shipmentLoading && shipmentList.length === 0
                  ? 'Loading…'
                  : shipmentMatchTotal === docketTotal
                  ? `${docketTotal} total records`
                  : `${shipmentMatchTotal} of ${docketTotal} records match`}{' '}
                · Click any row to open full details
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Desktop View Switcher (List vs Cards) */}
              <div className="hidden sm:inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShipmentViewMode('table')}
                  aria-pressed={shipmentViewMode === 'table'}
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
                  aria-pressed={shipmentViewMode === 'cards'}
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
                onClick={handleExportAll}
                disabled={exportingAll || shipmentMatchTotal === 0}
                className="gap-2 text-xs font-semibold shadow-saas"
              >
                <Download className="w-4 h-4" />
                <span>{exportingAll ? 'Exporting…' : `Export ${shipmentMatchTotal === docketTotal ? 'All' : 'Matching'} CSV`}</span>
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
                <Button size="sm" variant="secondary" onClick={handleBatchPDFDownload} disabled={!!batchPdfProgress} className="gap-1.5 text-xs font-semibold bg-white text-[#0A2030] hover:bg-[#0A2030]/10">
                  <Download className="w-3.5 h-3.5" />
                  <span>{batchPdfProgress ? `Downloading ${batchPdfProgress}…` : `Download PDFs (${selectedDocketIds.length})`}</span>
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
                placeholder="Search by LR, paper LR, waybill, customer or city…"
                value={shipmentSearch}
                onChange={(e) => setShipmentSearch(e.target.value)}
                className="pl-11 bg-white border-slate-200/90 shadow-saas h-12 text-sm"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-4 pointer-events-none" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                {SHIPMENT_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    aria-pressed={statusFilter === filter}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-saas cursor-pointer ${
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
              <Card className="p-8 text-center text-xs text-slate-500 font-medium shadow-saas">
                {shipmentLoading ? 'Loading shipments…' : 'No shipments found matching your criteria.'}
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredDockets.map((d) => {
                  const isVoided = d.status === 'voided';
                  const isSelected = selectedDocketIds.includes(d.id);
                  const vehicleImage =
                    d.transport_mode === 'Air'
                      ? '/images/plane-blue.jpg'
                      : d.transport_mode === 'Train'
                      ? '/images/train-blue.jpg'
                      : '/images/truck-blue.jpg';

                  const statusLower = (d.delivery_status || 'Booked').toLowerCase();
                  const isDelivered = statusLower.includes('deliver');
                  const isInTransit = statusLower.includes('transit') || statusLower.includes('out') || isDelivered;

                  return (
                    <Card
                      key={d.id}
                      onClick={() => setSelectedDocketForDetail(d)}
                      onKeyDown={(e) => openOnKey(e, () => setSelectedDocketForDetail(d))}
                      tabIndex={0}
                      aria-label={`Open LR ${d.docket_no}`}
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
                              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${d.docket_no}`}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-[#0A2030]" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300" />
                              )}
                            </button>
                            <span className={`font-mono font-extrabold text-base tracking-tight ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {d.docket_no}
                            </span>
                          </div>

                          <Badge
                            variant={paymentModeBadgeVariant(d.payment_mode, isVoided)}
                            className="text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider"
                          >
                            {isVoided ? 'Voided' : d.payment_mode || '—'}
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
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Created by</span>
                              <span className="text-xs font-bold text-slate-800">{d.created_by_name || 'Staff User'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Created on</span>
                              <span className="text-xs font-bold text-slate-800">{formatDay(d.booking_date)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 my-2" />

                        {/* Total Amount & Vehicle Image Row (Mobile) */}
                        <div className="flex items-center justify-between relative min-h-[70px]">
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">TOTAL AMOUNT</span>
                            <span className={`font-mono font-extrabold text-3xl ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {formatRupees(Number(d.grand_total))}
                            </span>
                          </div>

                          <div className="w-44 h-24 relative pointer-events-none mix-blend-multiply flex items-center justify-end">
                            <img
                              src={vehicleImage}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-contain object-right"
                            />
                          </div>
                        </div>

                        {/* Timeline Box (Mobile) */}
                        <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-3">
                          <div className="flex items-start gap-1 w-full text-[11px] font-semibold">
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

                                  <span className={`mt-1.5 max-w-[64px] text-center leading-tight text-[11px] ${isCurrent ? 'text-slate-900 font-extrabold' : isPassed ? 'text-slate-700 font-semibold' : 'text-slate-400 font-normal'}`}>
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

                          {!isVoided && isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleEditDocket(d)}
                              className="w-full py-3 px-4 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-between cursor-pointer shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <Pencil className="w-4 h-4 text-[#0A2030]" />
                                <span>Edit LR Details (Admin)</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* DESKTOP VIEW (Visible on md:flex / medium & large screens) */}
                      <div className="hidden md:flex flex-col justify-between space-y-6">
                        {/* Vehicle image clipped outside right border — larger size, mix-blend-multiply removes white background! */}
                        <div className="absolute -right-6 top-10 w-64 md:w-80 lg:w-[380px] h-36 md:h-44 pointer-events-none flex items-center justify-end z-0 mix-blend-multiply">
                          <img
                            src={vehicleImage}
                            alt=""
                            loading="lazy"
                            decoding="async"
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
                              aria-label={`${isSelected ? 'Deselect' : 'Select'} ${d.docket_no}`}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-[#0A2030]" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-300" />
                              )}
                            </button>

                            <span className={`font-mono font-extrabold text-lg sm:text-xl tracking-tight ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {d.docket_no}
                            </span>

                            {/* Payment Badge Pill */}
                            <Badge
                              variant={paymentModeBadgeVariant(d.payment_mode, isVoided)}
                              className="text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider"
                            >
                              {isVoided ? 'Voided' : d.payment_mode || '—'}
                            </Badge>

                            {d.physical_docket_no && (
                              <span className="text-xs font-mono text-slate-400">
                                (Paper: {d.physical_docket_no})
                              </span>
                            )}
                          </div>

                          {/* TOTAL AMOUNT — ALIGNED TO FAR TOP RIGHT, DIRECTLY ABOVE TRUCK */}
                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">Total Amount</span>
                            <span className={`font-mono font-extrabold text-2xl sm:text-3xl ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {formatRupees(Number(d.grand_total))}
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
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Created by</span>
                                <span className="text-xs font-bold text-slate-800">{d.created_by_name || 'Staff User'}</span>
                              </div>
                            </div>

                            {/* Block 2: Created on */}
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-500">
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Created on</span>
                                <span className="text-xs font-bold text-slate-800">{formatDay(d.booking_date)}</span>
                              </div>
                            </div>

                            {/* Status Line in SAME Row! */}
                            <div className="flex-1 max-w-sm ml-2">
                              <div className="flex items-start gap-1 w-full text-[11px] font-semibold">
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

                                      <span className={`mt-1 max-w-[64px] text-center leading-tight text-[11px] ${isCurrent ? 'text-slate-900 font-extrabold' : isPassed ? 'text-slate-700 font-semibold' : 'text-slate-400 font-normal'}`}>
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

                            {!isVoided && isAdmin && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditDocket(d)}
                                className="h-9 px-3.5 text-xs font-bold gap-1.5 text-slate-800 bg-white hover:bg-slate-50 border-slate-200 rounded-xl shadow-2xs"
                              >
                                <Pencil className="w-3.5 h-3.5 text-[#0A2030]" />
                                <span>Edit</span>
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
                      <button
                        onClick={toggleSelectAll}
                        aria-label={selectedDocketIds.length === filteredDockets.length && filteredDockets.length > 0 ? 'Clear selection' : 'Select all shown shipments'}
                        className="cursor-pointer text-slate-500 hover:text-slate-900"
                      >
                        {selectedDocketIds.length === filteredDockets.length && filteredDockets.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-[#0A2030]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <SortableTh label="LR NO." sortKey="docket" sort={shipmentSort} onSort={setShipmentSort} />
                    <th className="px-5 py-4">CUSTOMER</th>
                    <th className="px-5 py-4">ROUTE</th>
                    <SortableTh label="DATE" sortKey="date" sort={shipmentSort} onSort={setShipmentSort} />
                    <th className="px-5 py-4">WEIGHT</th>
                    <SortableTh label="AMOUNT" sortKey="amount" sort={shipmentSort} onSort={setShipmentSort} />
                    <th className="px-5 py-4">STATUS / PAYMENT</th>
                    <th className="px-5 py-4">DELIVERY</th>
                    <th className="px-5 py-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDockets.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-5 py-10 text-center text-xs text-slate-500">
                        {shipmentLoading ? 'Loading shipments…' : 'No shipments found matching your criteria.'}
                      </td>
                    </tr>
                  )}
                  {filteredDockets.map((d) => {
                    const isVoided = d.status === 'voided';
                    const isSelected = selectedDocketIds.includes(d.id);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDocketForDetail(d)}
                        onKeyDown={(e) => openOnKey(e, () => setSelectedDocketForDetail(d))}
                        tabIndex={0}
                        aria-label={`Open LR ${d.docket_no}`}
                        className={`transition-saas cursor-pointer h-16 focus-visible:outline-2 focus-visible:outline-[#0A2030] focus-visible:-outline-offset-2 ${
                          isSelected
                            ? 'bg-[#EEF4FF]'
                            : isVoided
                            ? 'bg-red-50/20 text-slate-400'
                            : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="px-4 py-4 text-center" onClick={(e) => toggleSelectDocket(d.id, e)}>
                          <button
                            type="button"
                            className="cursor-pointer"
                            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${d.docket_no}`}
                            aria-pressed={isSelected}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#0A2030]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 hover:text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-4 font-mono font-semibold text-xs whitespace-nowrap">
                          <div className={isVoided ? 'line-through text-slate-400' : 'text-slate-900'}>{d.docket_no}</div>
                          {d.physical_docket_no && (
                            <div className="text-[11px] text-slate-500 font-mono">
                              Paper LR: {d.physical_docket_no}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-semibold text-sm ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {d.consignor_name}
                          </div>
                          <div className="text-xs text-slate-500">{d.consignee_name}</div>
                        </td>
                        <td className={`px-5 py-4 text-xs whitespace-nowrap ${isVoided ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {d.from_city} → {d.to_city}
                        </td>
                        <td className="px-5 py-4 text-slate-500 font-medium text-xs whitespace-nowrap">{formatDay(d.booking_date)}</td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-700 whitespace-nowrap">{d.charged_weight_kg} kg</td>
                        <td className={`px-5 py-4 font-bold font-mono text-xs whitespace-nowrap ${isVoided ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {formatRupees(Number(d.grand_total))}
                        </td>
                        <td className="px-5 py-4">
                          {isVoided ? (
                            <Badge variant="destructive">
                              VOIDED
                            </Badge>
                          ) : (
                            <Badge
                              variant={paymentModeBadgeVariant(d.payment_mode)}
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
                            {!isVoided && (
                              <Button variant="ghost" size="icon" onClick={() => setTrackingModalDocket(d)} title="Update tracking status" aria-label={`Update tracking status for ${d.docket_no}`}>
                                <Truck className="w-4 h-4 text-slate-400 hover:text-[#0A2030]" />
                              </Button>
                            )}
                            {!isVoided && (
                              <Button variant="ghost" size="icon" onClick={() => setPaymentModalDocket(d)} title="Record payment" aria-label="Record payment">
                                <Wallet className="w-4 h-4 text-slate-400 hover:text-[#0A2030]" />
                              </Button>
                            )}
                            {!isVoided && isAdmin && (
                              <Button variant="ghost" size="icon" onClick={() => handleEditDocket(d)} title="Edit LR Details (Admin)" aria-label="Edit LR details">
                                <Pencil className="w-4 h-4 text-slate-400 hover:text-[#0A2030]" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => generateInvoicePDF(d)} title="Download PDF" aria-label="Download PDF">
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

          {shipmentList.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-slate-500">
                Showing {shipmentList.length} of {shipmentMatchTotal}
              </p>
              {shipmentList.length < shipmentMatchTotal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchShipments(shipmentList.length)}
                  disabled={shipmentLoading}
                >
                  {shipmentLoading ? 'Loading…' : `Load ${Math.min(DOCKET_PAGE_SIZE, shipmentMatchTotal - shipmentList.length)} more`}
                </Button>
              )}
            </div>
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
            goToTab('new_lr');
          }}
          onDraftsChanged={setDraftTotal}
          onNewLR={() => {
            setEditingDraft(null);
            goToTab('new_lr');
          }}
        />
      )}

      {/* 4. NEW LR CREATION WIZARD TAB / ADMIN EDIT LR */}
      {activeTab === 'new_lr' && (
        <CargoDocketForm
          key={editingDocket?.id ? `edit-${editingDocket.id}` : editingDraft?.id || 'new'}
          ref={cargoFormRef}
          editDocketId={editingDocket?.id}
          draftId={editingDraft?.id}
          initialData={editingDocket ? (editingDocket as any) : editingDraft?.data}
          onBack={() => {
            const wasEditing = Boolean(editingDocket);
            setEditingDocket(null);
            setEditingDraft(null);
            handleTabChange(wasEditing ? 'shipments' : 'dashboard');
          }}
          onCreated={() => {
            setRefreshKey((prev) => prev + 1);
            setEditingDocket(null);
            setEditingDraft(null);
            goToTab('shipments');
          }}
          onDraftSaved={fetchDraftCount}
        />
      )}

      {/* 5. FINANCE TABS */}
      {(activeTab === 'billing' || activeTab === 'reports') && !allDockets && (
        <Card className="p-10 text-center text-sm text-slate-500">Loading all LRs…</Card>
      )}
      {activeTab === 'billing' && allDockets && (
        <BillingView ref={billFormRef} dockets={allDockets} customers={customersList} />
      )}
      {activeTab === 'quotation' && <QuotationView />}
      {activeTab === 'expenses' && <ExpensesView totalRevenue={totalRevenue} isAdmin={isAdmin} />}

      {/* 6. REPORTS TAB — admin-only; nav hides the tab for staff, this guards direct state access too */}
      {activeTab === 'reports' && isAdmin && allDockets && (
        <ReportsView
          dockets={allDockets}
          cashLog={cashLog}
          customers={customersList}
          onNavigateToBilling={() => handleTabChange('billing')}
          onNavigateToShipments={() => handleTabChange('shipments')}
          onNavigateToExpenses={() => handleTabChange('expenses')}
        />
      )}

      {/* 6b. CASH BOOK TAB — admin-only; nav hides the tab for staff, this guards direct state access too */}
      {activeTab === 'cash_book' && isAdmin && (
        <CashBookView customers={customersList} onNavigateToShipments={() => handleTabChange('shipments')} />
      )}

      {/* 7. SETTINGS TAB */}
      {activeTab === 'settings' && <CompanySettingsView ref={settingsFormRef} />}
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

      {/* Unsaved-changes guard when navigating away from a dirty form */}
      {pendingNav && (
        <div ref={pendingNavDialog} role="dialog" aria-modal="true" aria-label="Unsaved changes" className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 font-heading">
                  {pendingNavSource === 'bill'
                    ? 'Unsaved Bill Changes'
                    : pendingNavSource === 'settings'
                    ? 'Unsaved Settings Changes'
                    : 'Unsaved LR Changes'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {pendingNavSource === 'bill'
                    ? "You have an in-progress tax invoice with unsaved entries. If you leave now without saving, your changes will be discarded."
                    : pendingNavSource === 'settings'
                    ? "You have modified company profile, GSTIN, or payment configurations. Leaving this tab without saving will revert your recent changes."
                    : "You have an in-progress Lorry Receipt with unsaved shipment details. If you leave now without saving, your entries will be discarded."}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => resolvePendingNav('cancel')}
                className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => resolvePendingNav('discard')}
                className="w-full sm:w-auto px-4 py-2.5 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Discard & Leave
              </button>
              <button
                type="button"
                onClick={() => resolvePendingNav('save')}
                disabled={leaveSaving}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#0A2030] hover:bg-[#071520] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {leaveSaving
                    ? 'Saving...'
                    : pendingNavSource === 'settings'
                    ? 'Save Changes'
                    : 'Save as Draft'}
                </span>
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
        onEdit={() => selectedDocketForDetail && handleEditDocket(selectedDocketForDetail)}
      />
    </AppShell>
  );
}
