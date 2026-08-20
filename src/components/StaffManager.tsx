'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus,
  Trash2,
  Pencil,
  ShieldCheck,
  User as UserIcon,
  X,
  Mail,
  ArrowLeft,
  FileText,
  Package,
  CreditCard,
  History,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle,
  Clock,
  Activity,
  Layers,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';

interface StaffAccount {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'staff';
  created_at: string;
  stats?: {
    lrs_count: number;
    lrs_total: number;
    bills_count: number;
    bills_total: number;
    revenue_handled: number;
  };
}

interface StaffDetailData {
  user: StaffAccount;
  stats: {
    lrs_count: number;
    lrs_total: number;
    bills_count: number;
    bills_total: number;
    revenue_handled: number;
    activity_logs_count: number;
  };
  dockets: Array<{
    id: string;
    docket_no: string;
    booking_date: string;
    consignor_name: string;
    consignee_name: string;
    from_city: string;
    to_city: string;
    transport_mode: string;
    payment_mode: string;
    grand_total: number;
    status: string;
  }>;
  bills: Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    customer_name: string;
    grand_total: number;
    payment_status: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    date: string;
    notes: string | null;
    docket_no: string;
  }>;
  audit_logs: Array<{
    id: string;
    action: string;
    summary: string;
    created_at: string;
    docket_id: string | null;
  }>;
}

export default function StaffManager() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const [users, setUsers] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'role' | 'lrs' | 'revenue'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffDetail, setStaffDetail] = useState<StaffDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'activity' | 'lrs' | 'bills' | 'payments'>('activity');

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffAccount | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch staff accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchStaffDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) {
        setStaffDetail(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch staff details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      fetchStaffDetail(selectedStaffId);
    }
  }, [selectedStaffId]);

  const openNewForm = () => {
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('staff');
    setError(null);
    setShowModal(true);
  };

  const openEditForm = (u: StaffAccount) => {
    setEditingUser(u);
    setEmail(u.email);
    setPassword('');
    setFullName(u.full_name || '');
    setRole(u.role);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = { email, full_name: fullName, role };
      if (!editingUser || password) {
        body.password = password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save account');
      }
      await fetchUsers();
      if (selectedStaffId && editingUser?.id === selectedStaffId) {
        await fetchStaffDetail(selectedStaffId);
      }
      setShowModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        if (selectedStaffId === deleteTarget.id) {
          setSelectedStaffId(null);
        }
        setDeleteTarget(null);
      } else {
        const errJson = await res.json();
        setDeleteError(errJson.error || 'Failed to delete account');
      }
    } catch (err) {
      console.error('Failed to delete staff account:', err);
      setDeleteError('Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (field: 'name' | 'role' | 'lrs' | 'revenue') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.full_name && u.full_name.toLowerCase().includes(search.toLowerCase())) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    if (sortField === 'name') {
      aVal = (a.full_name || a.email).toLowerCase();
      bVal = (b.full_name || b.email).toLowerCase();
    } else if (sortField === 'role') {
      aVal = a.role;
      bVal = b.role;
    } else if (sortField === 'lrs') {
      aVal = a.stats?.lrs_count || 0;
      bVal = b.stats?.lrs_count || 0;
    } else if (sortField === 'revenue') {
      aVal = a.stats?.revenue_handled || 0;
      bVal = b.stats?.revenue_handled || 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const formatCurrency = (val?: number | null) =>
    `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const formatDateTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  /* ─────────────────────────────────────────────────────────────
     FULL PAGE VIEW FOR SELECTED STAFF MEMBER
  ───────────────────────────────────────────────────────────── */
  if (selectedStaffId && staffDetail) {
    const { user, stats, dockets, bills, payments, audit_logs } = staffDetail;

    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Top Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedStaffId(null)}
            className="gap-2 text-slate-700 hover:bg-slate-50 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Staff Directory</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openEditForm(user)}
              className="gap-1.5 text-xs font-semibold"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Account</span>
            </Button>
          </div>
        </div>

        {/* Staff Profile Overview Card */}
        <Card className="p-6 border border-slate-200 bg-white rounded-3xl shadow-2xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#0A2030] text-white flex items-center justify-center text-xl font-bold font-mono shadow-sm">
                {(user.full_name || user.email).substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {user.full_name || 'Staff Member'}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      user.role === 'admin'
                        ? 'bg-[#0A2030] text-white'
                        : 'bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    {user.role === 'admin' ? 'Administrator' : 'Staff Member'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-medium">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {user.email}
                  </span>
                  <span>•</span>
                  <span>Account Created: {formatDate(user.created_at)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Monochrome KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>LRs Issued</span>
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">{stats.lrs_count}</div>
              <div className="text-[11px] text-slate-500 font-medium">{formatCurrency(stats.lrs_total)} value</div>
            </div>

            <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Invoices Generated</span>
                <FileText className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">{stats.bills_count}</div>
              <div className="text-[11px] text-slate-500 font-medium">{formatCurrency(stats.bills_total)} billed</div>
            </div>

            <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Revenue Handled</span>
                <DollarSign className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">{formatCurrency(stats.revenue_handled)}</div>
              <div className="text-[11px] text-slate-500 font-medium">Cleared payments collected</div>
            </div>

            <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Audit Logged Events</span>
                <Activity className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">{stats.activity_logs_count}</div>
              <div className="text-[11px] text-slate-500 font-medium">Tracked operations</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-slate-100 flex gap-6 pt-2">
            <button
              type="button"
              onClick={() => setDetailTab('activity')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                detailTab === 'activity'
                  ? 'border-[#0A2030] text-[#0A2030]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Activity Audit Log ({audit_logs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('lrs')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                detailTab === 'lrs'
                  ? 'border-[#0A2030] text-[#0A2030]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Issued LRs ({dockets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('bills')}
              className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                detailTab === 'bills'
                  ? 'border-[#0A2030] text-[#0A2030]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generated Invoices ({bills.length})</span>
            </button>
          </div>

          {/* Tab Content */}
          <div>
            {/* 1. ACTIVITY AUDIT LOG TAB */}
            {detailTab === 'activity' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Documenting all platform activities by {user.full_name || user.email}</span>
                </div>

                {audit_logs.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No activity logs recorded yet for this staff member.
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-4 my-2">
                    {audit_logs.map((log) => (
                      <div key={log.id} className="relative group">
                        <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-slate-200 border-2 border-white group-hover:bg-[#0A2030] transition-colors" />
                        <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">{log.action.replace(/_/g, ' ')}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(log.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">{log.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. ISSUED LRS TAB */}
            {detailTab === 'lrs' && (
              <div className="space-y-3">
                {dockets.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No LRs created by this staff member yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-3">LR Number</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Route</th>
                          <th className="px-4 py-3">Consignee</th>
                          <th className="px-4 py-3">Payment Mode</th>
                          <th className="px-4 py-3 text-right">Grand Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {dockets.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono font-bold text-slate-900">{d.docket_no}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(d.booking_date)}</td>
                            <td className="px-4 py-3 text-slate-700">{d.from_city} &rarr; {d.to_city}</td>
                            <td className="px-4 py-3 text-slate-700">{d.consignee_name}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                {d.payment_mode}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold font-mono">{formatCurrency(d.grand_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 3. GENERATED INVOICES TAB */}
            {detailTab === 'bills' && (
              <div className="space-y-3">
                {bills.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No bills generated by this staff member yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Invoice No.</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Grand Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {bills.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono font-bold text-slate-900">{b.invoice_number}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(b.invoice_date)}</td>
                            <td className="px-4 py-3 text-slate-700">{b.customer_name}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                {b.payment_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold font-mono">{formatCurrency(b.grand_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     MAIN DIRECTORY LIST VIEW FOR ALL STAFF
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Directory & Accounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage organization staff accounts, access permissions, and performance metrics.
          </p>
        </div>
        <Button
          onClick={openNewForm}
          className="bg-[#0A2030] hover:bg-[#071520] text-white gap-2 font-semibold text-xs rounded-xl shadow-saas cursor-pointer px-4 h-10 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </Button>
      </div>

      {/* Directory Search & List Card */}
      <Card className="border border-slate-200 shadow-2xs bg-white rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name, email, or role..."
              className="pl-9 h-10 text-xs rounded-xl border-slate-200"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Showing {sortedUsers.length} of {users.length} accounts
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs font-medium">Loading staff accounts...</div>
        ) : sortedUsers.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No staff accounts found.
          </div>
        ) : (
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-5 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Staff Member</span>
                      {sortField === 'name' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('role')}
                    className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Role</span>
                      {sortField === 'role' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('lrs')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>LRs Created</span>
                      {sortField === 'lrs' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('revenue')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Revenue Handled</span>
                      {sortField === 'revenue' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>

                  <th className="px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {sortedUsers.map((u) => {
                  const isCurrent = currentUserId === u.id;
                  const lrsCount = u.stats?.lrs_count || 0;
                  const lrsTotal = u.stats?.lrs_total || 0;
                  const revHandled = u.stats?.revenue_handled || 0;

                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedStaffId(u.id)}
                      className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold flex items-center justify-center text-xs group-hover:bg-[#0A2030] group-hover:text-white transition-colors">
                            {(u.full_name || u.email).substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-[#0A2030] transition-colors">
                              {u.full_name || 'Staff Member'}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-[#0A2030] text-white'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}
                        >
                          {u.role === 'admin' ? 'Admin' : 'Staff'}
                        </span>
                        {isCurrent && (
                          <span className="ml-1.5 text-[10px] text-slate-400 font-mono">(You)</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="font-bold text-slate-900 font-mono">{lrsCount}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{formatCurrency(lrsTotal)}</div>
                      </td>

                      <td className="px-4 py-4 text-right font-bold text-slate-900 font-mono">
                        {formatCurrency(revHandled)}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedStaffId(u.id)}
                            className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs"
                          >
                            <Activity className="w-4 h-4 text-[#0A2030]" />
                            <span>Details</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditForm(u)}
                            className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs"
                          >
                            <Pencil className="w-4 h-4 text-slate-700" />
                            <span>Edit</span>
                          </Button>
                          {!isCurrent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDeleteTarget(u)}
                              className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-red-200 text-red-600 hover:bg-red-50 shadow-2xs"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                              <span>Delete</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Staff Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200 shadow-2xl rounded-3xl p-6">
            <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-4 border-b border-slate-100">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  {editingUser ? 'Edit Staff Account' : 'Add Staff Account'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Set permissions and login credentials for this staff member.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Amit Sharma"
                    className="h-10 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@company.com"
                    className="h-10 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {editingUser ? 'Password (leave blank to keep unchanged)' : 'Password *'}
                  </label>
                  <Input
                    type="password"
                    required={!editingUser}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingUser ? '••••••••' : 'Min 8 characters'}
                    className="h-10 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10"
                  >
                    <option value="staff">Staff (Standard Operations)</option>
                    <option value="admin">Admin (Full Control & Settings)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                    className="bg-[#0A2030] hover:bg-[#071520] text-white font-semibold"
                  >
                    {submitting ? 'Saving...' : 'Save Account'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-white border border-slate-200 shadow-2xl rounded-3xl p-6">
            <CardHeader className="p-0 mb-4 border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-red-700">Delete Staff Account</CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove the account for{' '}
                <strong className="text-slate-900">{deleteTarget.full_name || deleteTarget.email}</strong>?
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 space-y-4">
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                  {deleteError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
