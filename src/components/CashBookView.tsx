'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Clock3, Download, IndianRupee, Ban } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/types/cargo';
import { PAYMENT_METHODS } from '@/lib/paymentMethod';
import { downloadCSV } from '@/lib/exportUtils';

interface CashPayment {
  id: string;
  docket_id: string;
  docket_no: string;
  customer_code?: string | null;
  amount: number;
  method: string;
  paid_at: string;
  notes: string;
  recorded_by: string;
  recorded_by_name: string;
  voided: boolean;
  void_reason?: string;
}

interface StaffOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface ExpectedResponse {
  mode: string;
  total_expected: number;
  missing_expected_mode_count: number;
  missing_expected_mode_amount: number;
  by_staff: { staff_id: string; staff_name: string; amount: number }[];
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

interface Props {
  customers?: Customer[];
  /** No query-filtered deep link into Shipments yet — just switches tabs. */
  onNavigateToShipments?: () => void;
}

export default function CashBookView({ customers = [], onNavigateToShipments }: Props) {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [staffId, setStaffId] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [mode, setMode] = useState<string>('Cash');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [payments, setPayments] = useState<CashPayment[]>([]);
  const [expected, setExpected] = useState<ExpectedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    fetch('/api/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setStaffOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const paymentsParams = new URLSearchParams({ from: dateFrom, to: dateTo, limit: '500' });
      if (mode !== 'All') paymentsParams.set('method', mode);
      if (staffId) paymentsParams.set('recordedBy', staffId);
      if (customerCode) paymentsParams.set('customerCode', customerCode);

      const paymentsRes = await fetch(`/api/payments?${paymentsParams.toString()}`);
      const paymentsData = paymentsRes.ok ? await paymentsRes.json() : { payments: [] };
      setPayments(paymentsData.payments ?? []);

      if (mode !== 'All') {
        const expectedParams = new URLSearchParams({ dateFrom, dateTo, mode });
        if (staffId) expectedParams.set('staff', staffId);
        if (customerCode) expectedParams.set('customerCode', customerCode);
        const expectedRes = await fetch(`/api/cash-book/expected?${expectedParams.toString()}`);
        setExpected(expectedRes.ok ? await expectedRes.json() : null);
      } else {
        setExpected(null);
      }
    } catch (err) {
      console.error('Failed to load Cash Book:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, staffId, customerCode, mode]);

  const totalCollected = useMemo(
    () => payments.filter((p) => !p.voided).reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [payments]
  );

  const collectedByStaff = useMemo(() => {
    const map = new Map<string, number>();
    payments
      .filter((p) => !p.voided)
      .forEach((p) => {
        map.set(p.recorded_by_name || 'Staff', (map.get(p.recorded_by_name || 'Staff') || 0) + Number(p.amount || 0));
      });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const handleVoid = async (p: CashPayment) => {
    if (!voidReason.trim()) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/dockets/${p.docket_id}/payments/${p.id}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void_reason: voidReason.trim() }),
      });
      if (res.ok) {
        await fetchAll();
        setVoidingId(null);
        setVoidReason('');
      }
    } catch (err) {
      console.error('Failed to void payment:', err);
    } finally {
      setVoiding(false);
    }
  };

  const handleExportCSV = () => {
    downloadCSV(
      ['LR No', 'Date', 'Customer', 'Amount', 'Mode', 'Recorded By', 'Notes', 'Voided'],
      payments.map((p) => [
        p.docket_no,
        p.paid_at.split('T')[0],
        p.customer_code || '',
        p.amount,
        p.method,
        p.recorded_by_name,
        p.notes || '',
        p.voided ? 'Yes' : 'No',
      ]),
      `cash_book_${dateFrom}_to_${dateTo}.csv`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cash Book</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Collected = staff who physically received the payment. Expected = staff who booked the LR and logged the customer&apos;s promise — these are often different people.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-end gap-3 border border-slate-200/90 rounded-2xl">
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Staff</label>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Staff</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Customer</label>
          <select
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value)}
            className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.code || ''}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Modes</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Two visually distinct totals — never summed together */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border border-emerald-200 bg-emerald-50/60 rounded-2xl">
          <div className="flex items-center gap-2 text-emerald-700">
            <Banknote className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">{mode === 'All' ? 'All Modes' : mode} Collected</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono mt-1">
            ₹{totalCollected.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-1">Confirmed — actually received and logged.</p>
        </Card>

        <Card className="p-4 border border-amber-200 bg-amber-50/60 rounded-2xl">
          <div className="flex items-center gap-2 text-amber-700">
            <Clock3 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">{mode === 'All' ? 'Cash' : mode} Expected / Pending</span>
          </div>
          {mode === 'All' ? (
            <p className="text-xs text-amber-700/80 mt-1">Select a specific mode above to view its projected pending figure.</p>
          ) : (
            <>
              <div className="text-2xl font-bold text-amber-700 font-mono mt-1">
                ₹{(expected?.total_expected ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-amber-700/80 mt-1">Projected — not yet received. From the customer&apos;s stated intent at booking.</p>
              {(expected?.missing_expected_mode_count ?? 0) > 0 && (
                <button
                  onClick={onNavigateToShipments}
                  className="text-[11px] text-amber-800 underline mt-1.5 cursor-pointer"
                >
                  {expected?.missing_expected_mode_count} invoice(s) (₹{(expected?.missing_expected_mode_amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}) have no stated payment mode — not counted here
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Two separately headed reconciliation tables — never blended */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-0 overflow-hidden border border-slate-200/90 rounded-2xl">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Cash Collected — by who received it</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100">
                {collectedByStaff.length === 0 ? (
                  <tr><td className="px-4 py-6 text-center text-slate-400">No collections in this period.</td></tr>
                ) : (
                  collectedByStaff.map((row) => (
                    <tr key={row.name}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{row.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                        ₹{row.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden border border-slate-200/90 rounded-2xl">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Cash Expected — by who booked it</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100">
                {mode === 'All' ? (
                  <tr><td className="px-4 py-6 text-center text-slate-400">Select a specific mode to view.</td></tr>
                ) : (expected?.by_staff ?? []).length === 0 ? (
                  <tr><td className="px-4 py-6 text-center text-slate-400">No expected {mode} balance in this period.</td></tr>
                ) : (
                  (expected?.by_staff ?? []).map((row) => (
                    <tr key={row.staff_id}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{row.staff_name}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">
                        ₹{row.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Payment rows */}
      <Card className="shadow-saas p-0 overflow-hidden border border-slate-200/90 rounded-2xl bg-white">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Payments ({payments.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-500 font-semibold tracking-wider text-xs sticky top-0 z-10 shadow-2xs">
              <tr>
                <th className="px-5 py-3.5">LR NO</th>
                <th className="px-5 py-3.5">DATE</th>
                <th className="px-5 py-3.5 text-right">AMOUNT</th>
                <th className="px-5 py-3.5">MODE</th>
                <th className="px-5 py-3.5">RECORDED BY</th>
                <th className="px-5 py-3.5">NOTES</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-xs">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400 text-xs">
                    <IndianRupee className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p>No payments recorded for this filter.</p>
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className={`hover:bg-[#F8FAFC] transition-saas h-12 ${p.voided ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-mono font-semibold text-slate-900">{p.docket_no}</td>
                    <td className="px-5 py-3 text-slate-500 font-medium">{p.paid_at.split('T')[0]}</td>
                    <td className={`px-5 py-3 text-right font-mono font-bold ${p.voided ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                      ₹{Number(p.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">{p.method}</Badge>
                      {p.voided && <Badge variant="destructive" className="font-mono text-[10px] ml-1">Voided</Badge>}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-700">{p.recorded_by_name || 'Staff'}</td>
                    <td className="px-5 py-3 text-slate-500 italic">{p.notes || '—'}</td>
                    <td className="px-5 py-3">
                      {!p.voided && (
                        voidingId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                              placeholder="Reason *"
                              className="h-7 px-2 border border-red-200 rounded-md bg-white text-[11px] focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            <button
                              disabled={voiding || !voidReason.trim()}
                              onClick={() => handleVoid(p)}
                              className="px-2 h-7 bg-red-600 hover:bg-red-700 text-white rounded-md text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setVoidingId(null); setVoidReason(''); }}
                              className="px-2 h-7 border border-slate-300 rounded-md text-[11px] text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setVoidingId(p.id); setVoidReason(''); }}
                            title="Void this payment"
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
