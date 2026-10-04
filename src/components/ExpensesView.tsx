'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import {
  Wallet,
  Plus,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  Search,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Building2,
  DollarSign,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpenseLedger, ExpenseEntry } from '@/types/cargo';
import { downloadCSV } from '@/lib/exportUtils';
import { formatCreatedAt } from '@/lib/formatDate';
import { generateExpenseLedgerPDF } from '@/lib/pdfGenerator';
import { invalidateReportsCache } from '@/components/ReportsView';

const CATEGORIES = [
  'Fuel & Diesel',
  'Driver Allowance',
  'Vehicle Maintenance',
  'Vehicle Costs',
  'Vendor Payment',
  'Office Rent & Utilities',
  'Packing Material',
  'Toll & Permits',
  'Personal Use',
  'Miscellaneous',
] as const;

const PAYMENT_MODES = ['UPI / GPay', 'Cash', 'Bank Transfer', 'Credit'] as const;

const todayISO = () => new Date().toISOString().split('T')[0];

type PeriodMode = 'month' | 'custom';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Month-name dropdown options: '01' .. '12'. */
const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: name,
}));

function monthBounds(yearMonth: string): { start: string; end: string; label: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], label };
}

type EntryDraft = {
  date: string;
  category: string;
  amount: string;
  payment_mode: string;
  ref_number: string;
  vendor_name: string;
  description: string;
};

const emptyEntryDraft = (defaultDate: string): EntryDraft => ({
  date: defaultDate,
  category: CATEGORIES[0],
  amount: '',
  payment_mode: PAYMENT_MODES[0],
  ref_number: '',
  vendor_name: '',
  description: '',
});

type ExpensesSubTab = 'history' | 'new';

export interface ExpensesViewProps {
  isAdmin?: boolean;
  totalRevenue?: number;
}

export default function ExpensesView({ isAdmin: propIsAdmin, totalRevenue: propTotalRevenue }: ExpensesViewProps = {}) {
  const { data: session } = useSession();
  const isAdmin = propIsAdmin ?? (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [totalEarned, setTotalEarned] = useState<number>(propTotalRevenue ?? 0);

  useEffect(() => {
    if (propTotalRevenue !== undefined) {
      setTotalEarned(propTotalRevenue);
    } else if (isAdmin) {
      fetch('/api/dashboard/kpis')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.totalRevenue === 'number') {
            setTotalEarned(data.totalRevenue);
          }
        })
        .catch((err) => console.error('Failed to load total revenue for expense balance KPI:', err));
    }
  }, [propTotalRevenue, isAdmin]);

  const [subTab, setSubTab] = useState<ExpensesSubTab>('history');

  // History state
  const [ledgers, setLedgers] = useState<ExpenseLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLedger, setExpandedLedger] = useState<ExpenseLedger | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const ledgerDetailCache = useRef<Map<string, ExpenseLedger>>(new Map());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseLedger | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline add-entry state, scoped to the currently expanded ledger
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(emptyEntryDraft(todayISO()));
  const [addingEntry, setAddingEntry] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // New-ledger form state
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const currentMonthKey = todayISO().slice(0, 7);
  const [periodStart, setPeriodStart] = useState(monthBounds(currentMonthKey).start);
  const [periodEnd, setPeriodEnd] = useState(monthBounds(currentMonthKey).end);
  const [monthPicker, setMonthPicker] = useState(currentMonthKey);
  const [yearDraft, setYearDraft] = useState(currentMonthKey.slice(0, 4));
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingEntries, setPendingEntries] = useState<EntryDraft[]>([]);
  const [newEntryDraft, setNewEntryDraft] = useState<EntryDraft>(emptyEntryDraft(todayISO()));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchLedgers = async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (q) params.set('q', q);
      const res = await fetch(`/api/expenses?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLedgers((data.ledgers ?? []) as ExpenseLedger[]);
      } else {
        setLedgers([]);
      }
    } catch (err) {
      console.error('Failed to fetch expense ledgers:', err);
      setLedgers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchLedgers(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fetchDetail = async (id: string): Promise<ExpenseLedger> => {
    const res = await fetch(`/api/expenses/${id}`);
    if (!res.ok) throw new Error('Failed to load expense ledger detail');
    return res.json();
  };

  const handleToggleView = async (ledger: ExpenseLedger) => {
    if (expandedId === ledger.id) {
      setExpandedId(null);
      setExpandedLedger(null);
      return;
    }
    setExpandedId(ledger.id);
    setEntryDraft(emptyEntryDraft(ledger.period_start));

    // 1. Instant display from cache if already loaded
    if (ledgerDetailCache.current.has(ledger.id)) {
      setExpandedLedger(ledgerDetailCache.current.get(ledger.id)!);
      setExpandLoading(false);
      return;
    }

    setExpandLoading(true);
    try {
      const detail = await fetchDetail(ledger.id);
      ledgerDetailCache.current.set(ledger.id, detail);
      setExpandedLedger(detail);
    } catch (err) {
      console.error(err);
      setExpandedLedger(null);
    } finally {
      setExpandLoading(false);
    }
  };

  const syncLedgerTotals = (id: string, totalAmount: number, entryCount: number) => {
    setLedgers((prev) => prev.map((l) => (l.id === id ? { ...l, total_amount: totalAmount, entry_count: entryCount } : l)));
  };

  const handleAddEntry = async (ledger: ExpenseLedger) => {
    const amount = Number(entryDraft.amount);
    if (!entryDraft.date || !amount || amount <= 0) return;

    setAddingEntry(true);
    try {
      const res = await fetch(`/api/expenses/${ledger.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: entryDraft.date,
          category: entryDraft.category,
          amount,
          payment_mode: entryDraft.payment_mode,
          ref_number: entryDraft.ref_number,
          vendor_name: entryDraft.vendor_name,
          description: entryDraft.description,
        }),
      });
      if (res.ok) {
        const newEntry: ExpenseEntry = await res.json();
        setExpandedLedger((prev) => {
          if (!prev || prev.id !== ledger.id) return prev;
          const updated = {
            ...prev,
            entries: [...(prev.entries ?? []), newEntry].sort((a, b) => a.date.localeCompare(b.date)),
            total_amount: prev.total_amount + amount,
          };
          ledgerDetailCache.current.set(ledger.id, updated);
          return updated;
        });
        syncLedgerTotals(ledger.id, ledger.total_amount + amount, (ledger.entry_count ?? 0) + 1);
        setEntryDraft(emptyEntryDraft(ledger.period_start));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to add entry.');
      }
    } catch (err) {
      console.error('Failed to add expense entry:', err);
    } finally {
      setAddingEntry(false);
    }
  };

  const handleDeleteEntry = async (ledger: ExpenseLedger, entry: ExpenseEntry) => {
    setDeletingEntryId(entry.id);

    // Optimistic UI update: Remove entry immediately
    setExpandedLedger((prev) => {
      if (!prev || prev.id !== ledger.id) return prev;
      const updated = {
        ...prev,
        entries: (prev.entries ?? []).filter((e) => e.id !== entry.id),
        total_amount: prev.total_amount - entry.amount,
      };
      ledgerDetailCache.current.set(ledger.id, updated);
      return updated;
    });
    syncLedgerTotals(ledger.id, ledger.total_amount - entry.amount, Math.max((ledger.entry_count ?? 1) - 1, 0));
    invalidateReportsCache('expenses');

    try {
      const res = await fetch(`/api/expenses/${ledger.id}/entries/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Failed to delete expense entry.');
        const fresh = await fetchDetail(ledger.id);
        ledgerDetailCache.current.set(ledger.id, fresh);
        setExpandedLedger(fresh);
      }
    } catch (err) {
      console.error('Failed to delete expense entry:', err);
    } finally {
      setDeletingEntryId(null);
    }
  };

  const handleDownloadCSV = async (ledger: ExpenseLedger) => {
    setDownloadingId(ledger.id);
    try {
      let detail = expandedId === ledger.id && expandedLedger ? expandedLedger : ledgerDetailCache.current.get(ledger.id);
      if (!detail) {
        detail = await fetchDetail(ledger.id);
        ledgerDetailCache.current.set(ledger.id, detail);
      }
      const entries = detail.entries ?? [];
      downloadCSV(
        ['Date', 'Category', 'Vendor', 'Description', 'Ref No.', 'Payment Mode', 'Amount (₹)'],
        entries.map((e) => [e.date, e.category, e.vendor_name || '', e.description || '', e.ref_number || '', e.payment_mode, e.amount]),
        `Expense_Ledger_${ledger.ledger_no.replace(/[^a-z0-9]+/gi, '_')}.csv`
      );
    } catch (err) {
      console.error('Failed to download CSV:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadPDF = async (ledger: ExpenseLedger) => {
    setDownloadingId(ledger.id);
    try {
      let detail = expandedId === ledger.id && expandedLedger ? expandedLedger : ledgerDetailCache.current.get(ledger.id);
      if (!detail) {
        detail = await fetchDetail(ledger.id);
        ledgerDetailCache.current.set(ledger.id, detail);
      }
      generateExpenseLedgerPDF(detail, detail.entries ?? []);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteLedger = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null); // Close modal immediately for instant feedback

    // Optimistic UI update: Remove immediately from list
    setLedgers((prev) => prev.filter((l) => l.id !== target.id));
    if (expandedId === target.id) {
      setExpandedId(null);
      setExpandedLedger(null);
    }
    ledgerDetailCache.current.delete(target.id);
    invalidateReportsCache('expenses');

    try {
      const res = await fetch(`/api/expenses/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete expense ledger.');
        setLedgers((prev) => [target, ...prev]);
        invalidateReportsCache('expenses');
      }
    } catch (err) {
      console.error('Failed to delete expense ledger:', err);
      alert('Failed to delete expense ledger. Please try again.');
      setLedgers((prev) => [target, ...prev]);
      invalidateReportsCache('expenses');
    }
  };

  const addPendingEntry = () => {
    const amount = Number(newEntryDraft.amount);
    if (!newEntryDraft.date || !amount || amount <= 0) return;
    if (newEntryDraft.date < periodStart || newEntryDraft.date > periodEnd) {
      setCreateError('Entry date must fall within the ledger period.');
      return;
    }
    setCreateError('');
    setPendingEntries((prev) => [...prev, newEntryDraft]);
    setNewEntryDraft(emptyEntryDraft(periodStart));
  };

  const removePendingEntry = (idx: number) => {
    setPendingEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const pendingTotal = pendingEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // KPI calculations
  const thisMonthKey = todayISO().slice(0, 7);
  const thisMonthBounds = monthBounds(thisMonthKey);
  const monthlyExpenseTotal = ledgers
    .filter((l) => l.period_start <= thisMonthBounds.end && l.period_end >= thisMonthBounds.start)
    .reduce((sum, l) => sum + Number(l.total_amount || 0), 0);
  const allTimeExpenseTotal = ledgers.reduce((sum, l) => sum + Number(l.total_amount || 0), 0);

  const selectMonth = (yearMonth: string, prevLabel: string) => {
    setMonthPicker(yearMonth);
    setYearDraft(yearMonth.slice(0, 4));
    const { start, end, label: monthLabel } = monthBounds(yearMonth);
    setPeriodStart(start);
    setPeriodEnd(end);
    if (!prevLabel.trim()) setLabel(`${monthLabel} Expense Sheet`);
  };

  const resetNewForm = () => {
    setPeriodMode('month');
    selectMonth(todayISO().slice(0, 7), '');
    setLabel('');
    setNotes('');
    setPendingEntries([]);
    setNewEntryDraft(emptyEntryDraft(todayISO()));
    setCreateError('');
  };

  const handleCreateLedger = async () => {
    if (periodEnd < periodStart) {
      setCreateError('Period end cannot be before period start.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          label,
          notes,
          entries: pendingEntries.map((e) => ({
            date: e.date,
            category: e.category,
            amount: Number(e.amount),
            payment_mode: e.payment_mode,
            ref_number: e.ref_number,
            vendor_name: e.vendor_name,
            description: e.description,
          })),
        }),
      });
      if (res.ok) {
        resetNewForm();
        setSubTab('history');
        invalidateReportsCache('expenses');
        fetchLedgers(search);
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || 'Failed to create expense ledger.');
      }
    } catch (err) {
      console.error('Failed to create expense ledger:', err);
      setCreateError('Failed to create expense ledger.');
    } finally {
      setCreating(false);
    }
  };

  // Admin-only: Total Balance = Amount Earned minus Total Expenses
  const totalBalance = totalEarned - allTimeExpenseTotal;
  const isPositiveBalance = totalBalance >= 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">Expense Ledgers</h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Log and track operating expenses across custom date ranges, and export records as Excel CSV or PDF.
          </p>
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setSubTab('history')}
            variant={subTab === 'history' ? 'default' : 'outline'}
            className={`h-9 px-3.5 text-xs font-semibold rounded-xl gap-1.5 cursor-pointer transition-all ${
              subTab === 'history'
                ? 'bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#0A2030]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>All Ledgers</span>
          </Button>

          <Button
            onClick={() => setSubTab('new')}
            variant={subTab === 'new' ? 'default' : 'outline'}
            className={`h-9 px-3.5 text-xs font-semibold rounded-xl gap-1.5 cursor-pointer transition-all ${
              subTab === 'new'
                ? 'bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-[#0A2030]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Ledger</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip — Only displayed in All Ledgers view, hidden during New Ledger creation */}
      {subTab === 'history' && (
        <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
          {/* KPI 1: This Month's Expenses */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">This Month&apos;s Expenses</p>
                <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                  ₹{monthlyExpenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              {thisMonthBounds.label} period
            </div>
          </div>

          {/* KPI 2: Total Recorded Cost */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Recorded Cost</p>
                <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                  ₹{allTimeExpenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              Across {ledgers.length} ledger{ledgers.length === 1 ? '' : 's'}
            </div>
          </div>

          {/* KPI 3: Admin Net Margin / Total Balance */}
          {isAdmin && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Operating Margin</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200/80">
                      Admin
                    </span>
                  </div>
                  <h3
                    className={`text-2xl font-bold font-mono mt-1.5 tracking-tight ${
                      isPositiveBalance ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {totalBalance < 0 ? '-' : '+'}₹{Math.abs(totalBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPositiveBalance ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5 flex items-center gap-1.5 flex-wrap">
                <span>Earned: ₹{totalEarned.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                <span className="text-slate-300">&middot;</span>
                <span>Expenses: ₹{allTimeExpenseTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* HISTORY / ALL LEDGERS SUBTAB */}
      {/* ========================================================= */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by ledger no., label, vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
              />
            </div>
            <span className="text-xs text-slate-500 font-normal">
              {ledgers.length} ledger{ledgers.length === 1 ? '' : 's'} recorded
            </span>
          </div>

          {loading ? (
            <div className="text-center py-16 text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" />
              <span>Loading expense ledgers...</span>
            </div>
          ) : ledgers.length === 0 ? (
            <Card className="p-12 text-center border border-dashed border-slate-200 rounded-2xl bg-white space-y-3 shadow-saas">
              <Wallet className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No expense ledgers found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {search ? `No ledgers matching "${search}"` : 'Create your first expense ledger to track operating costs.'}
              </p>
              {!search && (
                <Button
                  onClick={() => setSubTab('new')}
                  className="mt-2 h-9 px-4 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Ledger</span>
                </Button>
              )}
            </Card>
          ) : (
            <Card className="border border-slate-200/80 shadow-saas rounded-2xl bg-white overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3.5">Ledger No.</th>
                      <th className="px-4 py-3.5">Period</th>
                      <th className="px-4 py-3.5">Label</th>
                      <th className="px-4 py-3.5">Entries</th>
                      <th className="px-4 py-3.5">Created By</th>
                      <th className="px-4 py-3.5 text-right">Total Amount</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgers.map((l) => (
                      <Fragment key={l.id}>
                        <tr className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3.5 font-mono font-bold text-[#0A2030]">{l.ledger_no}</td>
                          <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
                            {l.period_start === l.period_end ? l.period_start : `${l.period_start} → ${l.period_end}`}
                          </td>
                          <td className="px-4 py-3.5 text-slate-800 font-medium">{l.label || '—'}</td>
                          <td className="px-4 py-3.5 font-mono text-slate-600">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200/60">
                              {l.entry_count ?? 0} item{l.entry_count === 1 ? '' : 's'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 text-xs">
                            <div className="font-semibold text-slate-800">{l.created_by_name || 'Staff'}</div>
                            {l.created_at && (
                              <div className="text-[10px] text-slate-400">{formatCreatedAt(l.created_at)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 text-sm">
                            ₹{Number(l.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleView(l)}
                                className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 text-[11px] font-semibold transition-colors"
                                title="View details"
                              >
                                <span>{expandedId === l.id ? 'Close' : 'View'}</span>
                                {expandedId === l.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDownloadCSV(l)}
                                disabled={downloadingId === l.id}
                                className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center cursor-pointer disabled:opacity-50 transition-colors"
                                title="Export CSV"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-700" />
                              </button>
                              <button
                                onClick={() => handleDownloadPDF(l)}
                                disabled={downloadingId === l.id}
                                className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center cursor-pointer disabled:opacity-50 transition-colors"
                                title="Download PDF"
                              >
                                <Download className="w-3.5 h-3.5 text-[#0A2030]" />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => setDeleteTarget(l)}
                                  className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer transition-colors"
                                  title="Delete ledger"
                                  aria-label={`Delete ledger ${l.ledger_no}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Detailed Entries Drawer */}
                        {expandedId === l.id && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={7} className="px-5 py-5">
                              {expandLoading ? (
                                <div className="text-xs text-slate-400 py-4 text-center flex items-center justify-center gap-2">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A2030]" />
                                  <span>Loading ledger entries...</span>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {expandedLedger?.notes && (
                                    <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200/80">
                                      <strong className="font-semibold text-slate-800">Ledger Remarks:</strong> {expandedLedger.notes}
                                    </div>
                                  )}

                                  {/* Inner Entries Table */}
                                  <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-2xs">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                                        <tr>
                                          <th className="px-3.5 py-2.5">Date</th>
                                          <th className="px-3.5 py-2.5">Category</th>
                                          <th className="px-3.5 py-2.5">Vendor</th>
                                          <th className="px-3.5 py-2.5">Description</th>
                                          <th className="px-3.5 py-2.5">Vehicle / Ref No.</th>
                                          <th className="px-3.5 py-2.5">Payment Mode</th>
                                          <th className="px-3.5 py-2.5 text-right">Amount (₹)</th>
                                          <th className="px-3.5 py-2.5 w-10 text-center"></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {(expandedLedger?.entries ?? []).length === 0 ? (
                                          <tr>
                                            <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-xs">
                                              No expense items logged yet. Add your first entry below.
                                            </td>
                                          </tr>
                                        ) : (
                                          expandedLedger?.entries?.map((e) => (
                                            <tr key={e.id} className="hover:bg-slate-50/60">
                                              <td className="px-3.5 py-2.5 font-mono text-slate-600">{e.date}</td>
                                              <td className="px-3.5 py-2.5 font-semibold text-slate-900">{e.category}</td>
                                              <td className="px-3.5 py-2.5 text-slate-600">{e.vendor_name || '—'}</td>
                                              <td className="px-3.5 py-2.5 text-slate-600">{e.description || '—'}</td>
                                              <td className="px-3.5 py-2.5 font-mono text-slate-500">{e.ref_number || '—'}</td>
                                              <td className="px-3.5 py-2.5">
                                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                                                  {e.payment_mode}
                                                </span>
                                              </td>
                                              <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900">
                                                ₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                              </td>
                                              <td className="px-3.5 py-2.5 text-center">
                                                {isAdmin && (
                                                <button
                                                  onClick={() => handleDeleteEntry(l, e)}
                                                  disabled={deletingEntryId === e.id}
                                                  className="w-6 h-6 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 mx-auto"
                                                  title="Delete item"
                                                  aria-label="Delete item"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                                )}
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                      {(expandedLedger?.entries ?? []).length > 0 && (
                                        <tfoot>
                                          <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                            <td colSpan={6} className="px-3.5 py-2.5 text-right text-slate-700 uppercase text-[10px] tracking-wider">
                                              Ledger Subtotal:
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono text-slate-900 text-sm">
                                              ₹{Number(expandedLedger?.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td></td>
                                          </tr>
                                        </tfoot>
                                      )}
                                    </table>
                                  </div>

                                  {/* Inline Quick Add Entry Form */}
                                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs">
                                    <div className="text-xs font-bold text-slate-900 font-heading">Add Line Item to this Ledger</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2.5 items-end">
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date</label>
                                        <Input
                                          type="date"
                                          min={l.period_start}
                                          max={l.period_end}
                                          value={entryDraft.date}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, date: e.target.value }))}
                                          className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Category</label>
                                        <select
                                          value={entryDraft.category}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, category: e.target.value }))}
                                          className="w-full text-xs h-8 px-2 border border-slate-200 rounded-lg bg-slate-50/50 text-slate-900 focus:bg-white focus:border-[#0A2030] focus:outline-none"
                                        >
                                          {CATEGORIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor Name</label>
                                        <Input
                                          placeholder="Fuel Pump / Garage"
                                          value={entryDraft.vendor_name}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, vendor_name: e.target.value }))}
                                          className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Amount (₹) *</label>
                                        <Input
                                          type="number"
                                          placeholder="0"
                                          value={entryDraft.amount}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, amount: e.target.value }))}
                                          className="text-xs h-8 font-mono bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Payment Mode</label>
                                        <select
                                          value={entryDraft.payment_mode}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, payment_mode: e.target.value }))}
                                          className="w-full text-xs h-8 px-2 border border-slate-200 rounded-lg bg-slate-50/50 text-slate-900 focus:bg-white focus:border-[#0A2030] focus:outline-none"
                                        >
                                          {PAYMENT_MODES.map((p) => (
                                            <option key={p} value={p}>{p}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vehicle / Ref</label>
                                        <Input
                                          placeholder="MH-04-1234"
                                          value={entryDraft.ref_number}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, ref_number: e.target.value }))}
                                          className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Remarks</label>
                                        <Input
                                          placeholder="Description..."
                                          value={entryDraft.description}
                                          onChange={(e) => setEntryDraft((d) => ({ ...d, description: e.target.value }))}
                                          className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                                        />
                                      </div>
                                      <Button
                                        onClick={() => handleAddEntry(l)}
                                        disabled={addingEntry}
                                        className="h-8 text-xs font-bold rounded-lg bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer disabled:opacity-50"
                                      >
                                        {addingEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                        <span>Add</span>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Delete Confirmation Modal */}
          {deleteTarget && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
              <Card className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4">
                <div className="flex items-center gap-2.5 text-red-600">
                  <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-heading">Delete Expense Ledger</h3>
                    <p className="text-xs text-slate-500">This action cannot be undone.</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                  Are you sure you want to permanently delete ledger <strong className="font-semibold text-slate-900 font-mono">{deleteTarget.ledger_no}</strong>
                  {deleteTarget.label ? ` (${deleteTarget.label})` : ''} along with all <strong className="font-semibold text-slate-900">{deleteTarget.entry_count ?? 0} logged entries</strong> totaling <strong className="font-mono text-slate-900 font-bold">₹{Number(deleteTarget.total_amount).toLocaleString('en-IN')}</strong>?
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteLedger}
                    disabled={deleting}
                    className="h-9 px-4 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-saas cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete Ledger'}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* NEW LEDGER FORM SUBTAB */}
      {/* ========================================================= */}
      {subTab === 'new' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Step 1: Ledger Setup Card */}
          <Card className="p-6 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-heading">Ledger Period & Setup</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select a month or define a custom accounting timeframe.</p>
              </div>

              {/* Period Selector Segmented Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
                <button
                  type="button"
                  onClick={() => setPeriodMode('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    periodMode === 'month'
                      ? 'bg-[#0A2030] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                    periodMode === 'custom'
                      ? 'bg-[#0A2030] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  Custom Range
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {periodMode === 'month' ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Month</label>
                    <select
                      value={monthPicker.slice(5, 7)}
                      onChange={(e) => selectMonth(`${monthPicker.slice(0, 4)}-${e.target.value}`, label)}
                      className="w-full text-xs h-9 px-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 font-semibold focus:bg-white focus:border-[#0A2030] focus:outline-none"
                    >
                      {MONTH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Year</label>
                    <Input
                      type="number"
                      value={yearDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setYearDraft(raw);
                        if (/^\d{4}$/.test(raw)) selectMonth(`${raw}-${monthPicker.slice(5, 7)}`, label);
                      }}
                      onBlur={() => {
                        if (!/^\d{4}$/.test(yearDraft)) setYearDraft(monthPicker.slice(0, 4));
                      }}
                      className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Period Start *</label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        if (periodEnd < e.target.value) setPeriodEnd(e.target.value);
                      }}
                      className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Period End *</label>
                    <Input
                      type="date"
                      min={periodStart}
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Ledger Label (optional)</label>
                <Input
                  placeholder="e.g. Aug 2026 Fleet Maintenance"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Remarks / Notes (optional)</label>
                <Input
                  placeholder="e.g. Approved monthly diesel bill"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
            </div>
          </Card>

          {/* Step 2: Line Items Card */}
          <Card className="p-6 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-heading">Expense Line Items</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add line entries for fuel, allowance, tolls, maintenance, etc.</p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                {pendingEntries.length} item{pendingEntries.length === 1 ? '' : 's'} added
              </span>
            </div>

            {/* Entry Form Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date *</label>
                <Input
                  type="date"
                  min={periodStart}
                  max={periodEnd}
                  value={newEntryDraft.date}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, date: e.target.value }))}
                  className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Category *</label>
                <select
                  value={newEntryDraft.category}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full text-xs h-9 px-2 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 font-semibold focus:bg-white focus:border-[#0A2030] focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor / Payee</label>
                <Input
                  placeholder="Indian Oil Hub"
                  value={newEntryDraft.vendor_name}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, vendor_name: e.target.value }))}
                  className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Amount (₹) *</label>
                <Input
                  type="number"
                  placeholder="4500"
                  value={newEntryDraft.amount}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="text-xs h-9 font-mono bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Payment Mode</label>
                <select
                  value={newEntryDraft.payment_mode}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, payment_mode: e.target.value }))}
                  className="w-full text-xs h-9 px-2 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:bg-white focus:border-[#0A2030] focus:outline-none"
                >
                  {PAYMENT_MODES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vehicle / Ref No.</label>
                <Input
                  placeholder="MH-04-FK-2041"
                  value={newEntryDraft.ref_number}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, ref_number: e.target.value }))}
                  className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>
              <Button
                onClick={addPendingEntry}
                className="h-9 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </Button>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expense Description / Remarks</label>
              <Input
                placeholder="e.g. Diesel refill for Mumbai to Guwahati transport truck..."
                value={newEntryDraft.description}
                onChange={(e) => setNewEntryDraft((d) => ({ ...d, description: e.target.value }))}
                className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
              />
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {/* Pending Items Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Vendor / Payee</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Vehicle / Ref</th>
                    <th className="p-3">Payment Mode</th>
                    <th className="p-3 text-right">Amount (₹)</th>
                    <th className="p-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {pendingEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                        No line items added yet. Fill out the fields above and click &ldquo;Add Item&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    pendingEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-3 font-mono text-slate-600">{e.date}</td>
                        <td className="p-3 font-semibold text-slate-900">{e.category}</td>
                        <td className="p-3 text-slate-600">{e.vendor_name || '—'}</td>
                        <td className="p-3 text-slate-600">{e.description || '—'}</td>
                        <td className="p-3 font-mono text-slate-500">{e.ref_number || '—'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                            {e.payment_mode}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => removePendingEntry(idx)}
                            className="w-6 h-6 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer mx-auto"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {pendingEntries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-bold">
                      <td colSpan={6} className="p-3 text-right text-slate-700 uppercase text-[10px] tracking-wider">
                        Total Ledger Expense:
                      </td>
                      <td className="p-3 text-right font-mono text-slate-900 text-sm">
                        ₹{pendingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setSubTab('history')}
                className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel & Return
              </Button>

              <Button
                onClick={handleCreateLedger}
                disabled={creating}
                className="h-10 px-5 gap-2 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas cursor-pointer disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                <span>{creating ? 'Creating Ledger...' : 'Create Expense Ledger'}</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
