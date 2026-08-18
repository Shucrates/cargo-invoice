'use client';

import { useState, useEffect, Fragment } from 'react';
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
  TrendingUp,
  TrendingDown,
  IndianRupee,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpenseLedger, ExpenseEntry } from '@/types/cargo';
import { downloadCSV } from '@/lib/exportUtils';
import { generateExpenseLedgerPDF } from '@/lib/pdfGenerator';
import { formatCreatedAt } from '@/lib/formatDate';

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
  // Typed independently so the field can be cleared/retyped; only commits
  // to monthPicker once it's a plausible 4-digit year.
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
    setExpandLoading(true);
    setEntryDraft(emptyEntryDraft(ledger.period_start));
    try {
      const detail = await fetchDetail(ledger.id);
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
        setExpandedLedger((prev) =>
          prev && prev.id === ledger.id
            ? {
                ...prev,
                entries: [...(prev.entries ?? []), newEntry].sort((a, b) => a.date.localeCompare(b.date)),
                total_amount: prev.total_amount + amount,
              }
            : prev
        );
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
    try {
      const res = await fetch(`/api/expenses/${ledger.id}/entries/${entry.id}`, { method: 'DELETE' });
      if (res.ok) {
        setExpandedLedger((prev) =>
          prev && prev.id === ledger.id
            ? {
                ...prev,
                entries: (prev.entries ?? []).filter((e) => e.id !== entry.id),
                total_amount: prev.total_amount - entry.amount,
              }
            : prev
        );
        syncLedgerTotals(ledger.id, ledger.total_amount - entry.amount, Math.max((ledger.entry_count ?? 1) - 1, 0));
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
      const detail = expandedId === ledger.id && expandedLedger ? expandedLedger : await fetchDetail(ledger.id);
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
      const detail = expandedId === ledger.id && expandedLedger ? expandedLedger : await fetchDetail(ledger.id);
      generateExpenseLedgerPDF(detail, detail.entries ?? []);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteLedger = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setLedgers((prev) => prev.filter((l) => l.id !== deleteTarget.id));
        if (expandedId === deleteTarget.id) {
          setExpandedId(null);
          setExpandedLedger(null);
        }
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Failed to delete expense ledger:', err);
    } finally {
      setDeleting(false);
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

  // KPI strip: current-month expense (ledgers overlapping this calendar
  // month) vs. total cost logged across every ledger loaded.
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expense Ledgers</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Log operating expenses into ledgers scoped to a date or date range, and export each as CSV or PDF.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-saas">
          <button
            onClick={() => setSubTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
              subTab === 'history'
                ? 'bg-[#2563EB] text-white shadow-saas'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Ledgers</span>
          </button>

          <button
            onClick={() => setSubTab('new')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
              subTab === 'new'
                ? 'bg-[#2563EB] text-white shadow-saas'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Ledger</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: 3 columns for Admin (including Total Balance), default 2 columns for Staff */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'} gap-5`}>
        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">This Month&apos;s Expense</div>
          <div className="text-2xl font-bold text-red-600 mt-2 font-mono tracking-tight">₹{monthlyExpenseTotal.toLocaleString('en-IN')}</div>
          <div className="text-xs text-slate-500 mt-2 font-medium">{thisMonthBounds.label}</div>
        </Card>

        <Card className="p-6 shadow-saas">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Cost</div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono tracking-tight">₹{allTimeExpenseTotal.toLocaleString('en-IN')}</div>
          <div className="text-xs text-slate-500 mt-2 font-medium">Across {ledgers.length} ledger{ledgers.length === 1 ? '' : 's'}</div>
        </Card>

        {/* Total Balance KPI — Only visible to Admins (Amount Earned minus Expenses) */}
        {isAdmin && (
          <Card className="p-6 shadow-saas">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Balance
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/60">
                Admin
              </span>
            </div>
            <div
              className={`text-2xl font-bold mt-2 font-mono tracking-tight ${
                isPositiveBalance ? 'text-[#1F8A4C]' : 'text-[#D14343]'
              }`}
            >
              {totalBalance < 0 ? '-' : '+'}₹{Math.abs(totalBalance).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-2 font-medium flex items-center gap-1.5 flex-wrap">
              <span>Earned: ₹{totalEarned.toLocaleString('en-IN')}</span>
              <span className="text-slate-300">•</span>
              <span>Expenses: ₹{allTimeExpenseTotal.toLocaleString('en-IN')}</span>
            </div>
          </Card>
        )}
      </div>

      {/* ========================================================= */}
      {/* HISTORY SUBTAB */}
      {/* ========================================================= */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <Input
            placeholder="Search by ledger no. or label..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm text-xs"
          />

          {loading ? (
            <div className="text-center py-16 text-sm text-slate-400">Loading expense ledgers...</div>
          ) : ledgers.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-white">
              <Wallet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No expense ledgers yet. Create one in "New Ledger".</p>
            </div>
          ) : (
            <div className="border border-slate-200 shadow-2xs rounded-xl bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Ledger No.</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Label</th>
                      <th className="px-4 py-3">Entries</th>
                      <th className="px-4 py-3">Created By</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgers.map((l) => (
                      <Fragment key={l.id}>
                        <tr className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono font-bold text-blue-700">{l.ledger_no}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono">
                            {l.period_start === l.period_end ? l.period_start : `${l.period_start} → ${l.period_end}`}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{l.label || '-'}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{l.entry_count ?? 0}</td>
                          <td
                            className="px-4 py-3 text-slate-500"
                            title={`${l.created_at ? formatCreatedAt(l.created_at) : ''}`}
                          >
                            <div>{l.created_by_name || 'Staff'}</div>
                            {l.created_at && (
                              <div className="text-[10px] text-slate-400 font-mono">{formatCreatedAt(l.created_at)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                            ₹{Number(l.total_amount).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleToggleView(l)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                                title="View entries"
                              >
                                {expandedId === l.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDownloadCSV(l)}
                                disabled={downloadingId === l.id}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                                title="Download CSV"
                              >
                                <FileSpreadsheet className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDownloadPDF(l)}
                                disabled={downloadingId === l.id}
                                className="p-1.5 rounded-lg text-[#2563EB] hover:bg-blue-50 cursor-pointer disabled:opacity-50"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(l)}
                                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Delete ledger"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === l.id && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-4">
                              {expandLoading ? (
                                <div className="text-xs text-slate-400 py-2">Loading entries...</div>
                              ) : (
                                <div className="space-y-3">
                                  {expandedLedger?.notes && (
                                    <p className="text-[11px] text-slate-500 italic">Notes: {expandedLedger.notes}</p>
                                  )}

                                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-slate-100 text-slate-600 font-bold">
                                        <tr>
                                          <th className="px-3 py-2">Date</th>
                                          <th className="px-3 py-2">Category</th>
                                          <th className="px-3 py-2">Vendor</th>
                                          <th className="px-3 py-2">Description</th>
                                          <th className="px-3 py-2">Ref No.</th>
                                          <th className="px-3 py-2">Payment Mode</th>
                                          <th className="px-3 py-2 text-right">Amount</th>
                                          <th className="px-3 py-2 w-8"></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {(expandedLedger?.entries ?? []).length === 0 ? (
                                          <tr>
                                            <td colSpan={8} className="px-3 py-4 text-center text-slate-400">
                                              No entries logged yet.
                                            </td>
                                          </tr>
                                        ) : (
                                          expandedLedger?.entries?.map((e) => (
                                            <tr key={e.id}>
                                              <td className="px-3 py-2 font-mono text-slate-600">{e.date}</td>
                                              <td className="px-3 py-2 font-semibold text-slate-900">{e.category}</td>
                                              <td className="px-3 py-2 text-slate-600">{e.vendor_name || '-'}</td>
                                              <td className="px-3 py-2 text-slate-600">{e.description || '-'}</td>
                                              <td className="px-3 py-2 font-mono text-slate-500">{e.ref_number || '-'}</td>
                                              <td className="px-3 py-2 text-slate-600">{e.payment_mode}</td>
                                              <td className="px-3 py-2 text-right font-mono font-bold text-red-600">
                                                ₹{Number(e.amount).toLocaleString('en-IN')}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                <button
                                                  onClick={() => handleDeleteEntry(l, e)}
                                                  disabled={deletingEntryId === e.id}
                                                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Inline add-entry row */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 items-end bg-white border border-slate-200 rounded-lg p-3">
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Date</label>
                                      <Input
                                        type="date"
                                        min={l.period_start}
                                        max={l.period_end}
                                        value={entryDraft.date}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, date: e.target.value }))}
                                        className="mt-1 text-[11px] h-8"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Category</label>
                                      <select
                                        value={entryDraft.category}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, category: e.target.value }))}
                                        className="mt-1 w-full text-[11px] h-8 px-2 border border-slate-200 rounded-lg bg-white"
                                      >
                                        {CATEGORIES.map((c) => (
                                          <option key={c} value={c}>{c}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Vendor Name</label>
                                      <Input
                                        value={entryDraft.vendor_name}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, vendor_name: e.target.value }))}
                                        className="mt-1 text-[11px] h-8"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Amount (₹)</label>
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        value={entryDraft.amount}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, amount: e.target.value }))}
                                        className="mt-1 text-[11px] h-8 font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Payment Mode</label>
                                      <select
                                        value={entryDraft.payment_mode}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, payment_mode: e.target.value }))}
                                        className="mt-1 w-full text-[11px] h-8 px-2 border border-slate-200 rounded-lg bg-white"
                                      >
                                        {PAYMENT_MODES.map((p) => (
                                          <option key={p} value={p}>{p}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Ref No. / Vehicle</label>
                                      <Input
                                        value={entryDraft.ref_number}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, ref_number: e.target.value }))}
                                        className="mt-1 text-[11px] h-8"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-slate-700">Description</label>
                                      <Input
                                        value={entryDraft.description}
                                        onChange={(e) => setEntryDraft((d) => ({ ...d, description: e.target.value }))}
                                        className="mt-1 text-[11px] h-8"
                                      />
                                    </div>
                                    <Button
                                      onClick={() => handleAddEntry(l)}
                                      disabled={addingEntry}
                                      className="bg-[#2563EB] hover:bg-blue-700 text-white h-8 text-[11px] font-medium gap-1"
                                    >
                                      {addingEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                      <span>Add</span>
                                    </Button>
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
            </div>
          )}

          {deleteTarget && (
            <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
                <h3 className="text-base font-bold text-red-700 mb-2">Delete Expense Ledger</h3>
                <p className="text-xs text-slate-600 mb-4">
                  Delete ledger "{deleteTarget.ledger_no}"{deleteTarget.label ? ` (${deleteTarget.label})` : ''} and all
                  {' '}{deleteTarget.entry_count ?? 0} of its entries? This cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteLedger}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold uppercase disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* NEW LEDGER SUBTAB */}
      {/* ========================================================= */}
      {subTab === 'new' && (
        <div className="space-y-4">
          <Card className="p-6 shadow-saas space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Ledger Period</h3>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setPeriodMode('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                  periodMode === 'month' ? 'bg-white text-slate-900 shadow-saas' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-saas cursor-pointer ${
                  periodMode === 'custom' ? 'bg-white text-slate-900 shadow-saas' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Custom Range
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {periodMode === 'month' ? (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Month</label>
                    <select
                      value={monthPicker.slice(5, 7)}
                      onChange={(e) => selectMonth(`${monthPicker.slice(0, 4)}-${e.target.value}`, label)}
                      className="mt-1 w-full text-xs h-9 px-2 border border-slate-200 rounded-lg bg-white"
                    >
                      {MONTH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Year</label>
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
                      className="mt-1 text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Period Start</label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        if (periodEnd < e.target.value) setPeriodEnd(e.target.value);
                      }}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Period End</label>
                    <Input
                      type="date"
                      min={periodStart}
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Label (optional)</label>
                <Input
                  placeholder="Aug 2026 Fuel & Toll"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Notes (optional)</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 shadow-saas space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Entries</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Date</label>
                <Input
                  type="date"
                  min={periodStart}
                  max={periodEnd}
                  value={newEntryDraft.date}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, date: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Category</label>
                <select
                  value={newEntryDraft.category}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, category: e.target.value }))}
                  className="mt-1 w-full text-xs h-9 px-2 border border-slate-200 rounded-lg bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Vendor Name</label>
                <Input
                  placeholder="ABC Transport Services"
                  value={newEntryDraft.vendor_name}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, vendor_name: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Amount (₹)</label>
                <Input
                  type="number"
                  placeholder="4500"
                  value={newEntryDraft.amount}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="mt-1 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Payment Mode</label>
                <select
                  value={newEntryDraft.payment_mode}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, payment_mode: e.target.value }))}
                  className="mt-1 w-full text-xs h-9 px-2 border border-slate-200 rounded-lg bg-white"
                >
                  {PAYMENT_MODES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Vehicle / Ref No.</label>
                <Input
                  placeholder="MH-04-FK-2041"
                  value={newEntryDraft.ref_number}
                  onChange={(e) => setNewEntryDraft((d) => ({ ...d, ref_number: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
              <Button onClick={addPendingEntry} className="bg-[#2563EB] hover:bg-blue-700 text-white h-9 text-xs font-medium gap-1">
                <Plus className="w-4 h-4" />
                <span>Add Entry</span>
              </Button>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700">Notes / Expense Description</label>
              <Input
                placeholder="Diesel refill for Mumbai to Guwahati transport truck..."
                value={newEntryDraft.description}
                onChange={(e) => setNewEntryDraft((d) => ({ ...d, description: e.target.value }))}
                className="mt-1 text-xs"
              />
            </div>

            {createError && <p className="text-xs text-red-600 font-medium">{createError}</p>}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Ref No / Vehicle</th>
                    <th className="p-3">Payment Mode</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {pendingEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">
                        No entries added yet.
                      </td>
                    </tr>
                  ) : (
                    pendingEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-600">{e.date}</td>
                        <td className="p-3 font-semibold text-slate-900">{e.category}</td>
                        <td className="p-3 text-slate-600">{e.vendor_name || '-'}</td>
                        <td className="p-3 text-slate-600">{e.description || '-'}</td>
                        <td className="p-3 font-mono text-slate-500">{e.ref_number || '-'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                            {e.payment_mode}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-red-600">
                          ₹{Number(e.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => removePendingEntry(idx)}
                            className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {pendingEntries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-bold">
                      <td colSpan={6} className="p-3 text-right text-slate-600">Total</td>
                      <td className="p-3 text-right font-mono text-slate-900">₹{pendingTotal.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={handleCreateLedger}
                disabled={creating}
                className="bg-[#1F8A4C] hover:bg-green-700 text-white text-xs font-semibold gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>{creating ? 'Creating...' : 'Create Ledger'}</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
