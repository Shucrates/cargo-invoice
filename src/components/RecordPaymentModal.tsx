'use client';

import { useState, useEffect } from 'react';
import { X, Wallet, IndianRupee, Ban } from 'lucide-react';
import { CargoDocket } from '@/types/cargo';
import { PAYMENT_METHODS } from '@/lib/paymentMethod';

interface Payment {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  notes: string;
  recorded_by_name: string;
  voided: boolean;
  void_reason?: string;
  voided_by_name?: string;
}

/** `2026-08-12` — what a date input needs. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  docket: CargoDocket;
  onClose: () => void;
  onSettled?: () => void;
  isAdmin?: boolean;
}

export default function RecordPaymentModal({ docket, onClose, onSettled, isAdmin }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [grandTotal, setGrandTotal] = useState(docket.grand_total);
  const [amountPaid, setAmountPaid] = useState(docket.amount_paid ?? 0);
  const [amountDue, setAmountDue] = useState(docket.amount_due ?? docket.grand_total);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Cash');
  const [paidAt, setPaidAt] = useState(today());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updateExpectedMode, setUpdateExpectedMode] = useState(false);

  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const enteredAmount = Number(amount) || 0;
  const willBePartial = enteredAmount > 0 && enteredAmount < amountDue;
  const modeDiffersFromExpected = Boolean(docket.expected_mode) && method !== docket.expected_mode;

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/payments`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments ?? []);
        setGrandTotal(data.grand_total ?? docket.grand_total);
        setAmountPaid(data.amount_paid ?? 0);
        setAmountDue(data.amount_due ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docket.id]);

  const openForm = () => {
    setAmount(amountDue > 0 ? amountDue.toFixed(2) : '');
    setMethod('Cash');
    setPaidAt(today());
    setNotes('');
    setUpdateExpectedMode(false);
    setError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          method,
          paid_at: paidAt,
          notes,
          update_expected_mode: willBePartial && modeDiffersFromExpected ? updateExpectedMode : undefined,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to record payment');
      }
      const wasSettled = (await res.json().catch(() => null)) as { amount_due?: number } | null;
      await fetchPayments();
      setShowForm(false);
      if (wasSettled && wasSettled.amount_due === 0 && onSettled) onSettled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (paymentId: string) => {
    if (!voidReason.trim()) return;
    setVoiding(true);
    setError(null);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/payments/${paymentId}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void_reason: voidReason.trim() }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to void payment');
      }
      await fetchPayments();
      setVoidingId(null);
      setVoidReason('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to void payment');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-[#0A2030]" />
              Payments
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{docket.docket_no}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Grand Total</div>
              <div className="text-sm font-bold text-slate-900 font-mono">₹{grandTotal.toFixed(2)}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-green-50 border border-green-200">
              <div className="text-[10px] text-green-700 font-medium">Paid</div>
              <div className="text-sm font-bold text-green-700 font-mono">₹{amountPaid.toFixed(2)}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-[10px] text-amber-700 font-medium">Due</div>
              <div className="text-sm font-bold text-amber-700 font-mono">₹{amountDue.toFixed(2)}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400 font-mono py-6 text-center">Loading payment history...</div>
          ) : payments.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">No payments recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-start justify-between gap-2 p-2.5 rounded-lg border ${
                    p.voided ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className={`text-xs font-bold flex items-center gap-1 ${p.voided ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                      <IndianRupee className="w-3 h-3" />
                      {p.amount.toFixed(2)}
                      <span className="ml-1 font-normal text-slate-500">via {p.method}</span>
                    </div>
                    {p.notes && <div className="text-[11px] text-slate-500 mt-0.5">{p.notes}</div>}
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {new Date(p.paid_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      {' · '}
                      {p.recorded_by_name}
                    </div>
                    {p.voided && (
                      <div className="text-[10px] text-red-600 mt-1">
                        Voided by {p.voided_by_name || 'admin'}{p.void_reason ? `: ${p.void_reason}` : ''}
                      </div>
                    )}
                    {isAdmin && !p.voided && voidingId === p.id && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={voidReason}
                          onChange={(e) => setVoidReason(e.target.value)}
                          placeholder="Reason for voiding *"
                          className="h-7 px-2 border border-red-200 rounded-md bg-white text-[11px] focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                        <button
                          type="button"
                          disabled={voiding || !voidReason.trim()}
                          onClick={() => handleVoid(p.id)}
                          className="px-2 h-7 bg-red-600 hover:bg-red-700 text-white rounded-md text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {voiding ? 'Voiding...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setVoidingId(null); setVoidReason(''); }}
                          className="px-2 h-7 border border-slate-300 rounded-md text-[11px] text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {isAdmin && !p.voided && voidingId !== p.id && (
                    <button
                      type="button"
                      onClick={() => { setVoidingId(p.id); setVoidReason(''); }}
                      title="Void this payment"
                      className="text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSave} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/60">
              {error && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium rounded-md">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Method *</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`h-8 rounded-md border text-[11px] font-medium transition-all ${
                        method === m
                          ? 'border-[#0A2030] bg-[#0A2030]/10 text-[#0A2030] font-bold ring-1 ring-[#0A2030]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {willBePartial && modeDiffersFromExpected && (
                <label className="flex items-start gap-1.5 p-2 bg-blue-50 border border-blue-100 rounded-md text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExpectedMode}
                    onChange={(e) => setUpdateExpectedMode(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Update expected mode for the remaining ₹{(amountDue - enteredAmount).toFixed(2)} to <strong>{method}</strong> too?
                  </span>
                </label>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Note (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Collected at delivery"
                  className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-1.5 bg-[#0A2030] hover:bg-[#071520] text-white rounded-md text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          )}
        </div>

        {!showForm && (
          <div className="px-5 py-3 border-t border-slate-200">
            <button
              onClick={openForm}
              disabled={amountDue <= 0}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-[#0A2030] hover:text-[#0A2030] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              {amountDue <= 0 ? 'Fully Settled' : 'Record Payment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
