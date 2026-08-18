'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { CargoDocket } from '@/types/cargo';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { deliveryStatusBadgeVariant } from '@/lib/deliveryStatus';
import { formatCreatedAt } from '@/lib/formatDate';
import RecordPaymentModal from '@/components/RecordPaymentModal';
import TrackingTimelineModal from '@/components/TrackingTimelineModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  ChevronLeft,
  Printer,
  Download,
  CheckCircle2,
  FileText,
  Truck,
  MapPin,
  Package,
  AlertTriangle,
  Wallet,
  History,
  PlusCircle,
  Pencil,
  Ban,
} from 'lucide-react';

interface TrackingEvent {
  id: string;
  status: string;
  location: string;
  description: string;
  event_at: string;
  created_by_name: string;
}

interface AuditEntry {
  id: string;
  action: string;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
  performed_by_name: string;
  created_at: string;
}

/** Turns snake_case audit field keys into the labels shown on the form. */
const FIELD_LABELS: Record<string, string> = {
  booking_date: 'Booking Date',
  transport_mode: 'Transport Mode',
  is_international: 'International',
  from_city: 'Origin',
  to_city: 'Destination',
  consignor_name: 'Consignor',
  consignor_address: 'Consignor Address',
  consignor_pin: 'Consignor PIN',
  consignor_phone: 'Consignor Phone',
  consignor_gstin: 'Consignor GSTIN',
  consignee_name: 'Consignee',
  consignee_address: 'Consignee Address',
  consignee_pin: 'Consignee PIN',
  consignee_phone: 'Consignee Phone',
  consignee_gstin: 'Consignee GSTIN',
  package_count: 'Packages',
  invoice_no: 'Invoice No.',
  invoice_value: 'Invoice Value',
  actual_weight_kg: 'Actual Weight',
  charged_weight_kg: 'Charged Weight',
  goods_description: 'Goods Description',
  freight_amount: 'Freight Charges',
  risk_charge: 'Risk Charges',
  handling_charge: 'Handling Charges',
  docket_charge: 'Docket Charges',
  pickup_delivery_charge: 'Pickup & Delivery Charges',
  other_charge: 'Other Charges',
  gst_percentage: 'GST %',
  payment_mode: 'Payment Mode',
  customer_code: 'Customer',
  courier_partner: 'Courier / Network',
  tracking_no: 'Tracking No.',
  physical_docket_no: 'Physical LR / Vehicle No.',
  void_reason: 'Void Reason',
};

/** Rupee amounts on an invoice always show both paise digits. */
function formatAmount(value: number): string {
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface ShipmentDetailViewProps {
  docket: CargoDocket;
  onBack: () => void;
  onVoidSuccess?: () => void;
  /** Admin-only correction flow — parent opens the LR wizard pre-filled. */
  onEdit?: () => void;
}

export default function ShipmentDetailView({ docket, onBack, onVoidSuccess, onEdit }: ShipmentDetailViewProps) {
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const { data: session } = useSession();
  // Voiding/editing are admin-only server-side; hide the controls so staff never hit a 403.
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const fetchEvents = () => {
    setEventsLoading(true);
    fetch(`/api/dockets/${docket.id}/tracking-events`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events ?? []))
      .catch((err) => console.error('Failed to fetch tracking events:', err))
      .finally(() => setEventsLoading(false));
  };

  const fetchAuditLog = () => {
    setAuditLoading(true);
    fetch(`/api/dockets/${docket.id}/audit-log`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data) => setAuditEntries(data.entries ?? []))
      .catch((err) => console.error('Failed to fetch activity log:', err))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    fetchEvents();
    fetchAuditLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docket.id]);

  const isVoided = docket.status === 'voided';
  const freight = Number(docket.freight_amount || 0);
  const handling = Number(docket.handling_charge || 0);
  const risk = Number(docket.risk_charge || 0);
  const docketChg = Number(docket.docket_charge || 0);
  const pickup = Number(docket.pickup_delivery_charge || 0);
  const other = Number(docket.other_charge || 0);

  // Totals are frozen at write time and corrected for historical rows by the
  // backfill migration, so this view displays them rather than recalculating —
  // an invoice must never show a different figure than the one on record.
  const subtotal = Number(docket.subtotal || 0);
  const gstPercentage = Number(docket.gst_percentage || 18);
  const gstAmount = Number(docket.gst_amount || 0);
  const grandTotal = Number(docket.grand_total || 0);
  const amountPaid = docket.amount_paid ?? (docket.payment_mode === 'Paid' ? grandTotal : 0);
  const amountDue = docket.amount_due ?? Math.max(grandTotal - amountPaid, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    generateInvoicePDF(docket);
  };

  const handleVoidDocket = async () => {
    if (!voidReason.trim()) return;
    setVoiding(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void_reason: voidReason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVoidError(data.error || 'Failed to void this docket.');
        return;
      }

      setShowVoidModal(false);
      if (onVoidSuccess) onVoidSuccess();
      onBack();
    } catch {
      setVoidError('Network error. Please check your connection and try again.');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans text-slate-900">
      {/* Top Navigation & Action Bar (Screenshot Match) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200/80 p-4 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back to shipments">
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{docket.docket_no}</h1>
              <Badge
                variant={isVoided ? 'destructive' : docket.payment_mode === 'Paid' ? 'success' : 'secondary'}
                className="font-mono text-xs uppercase"
              >
                {isVoided ? 'Voided' : docket.payment_mode}
              </Badge>
              {!isVoided && (
                <Badge variant={deliveryStatusBadgeVariant(docket.delivery_status)} className="text-xs">
                  {docket.delivery_status || 'Booked'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Booked {docket.booking_date} · {docket.consignor_name}
              {docket.created_by_name && (
                <>
                  {' '}
                  · Created by <span className="font-semibold text-slate-700">{docket.created_by_name}</span>
                  {docket.created_at && ` on ${formatCreatedAt(docket.created_at)}`}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </Button>
          {!isVoided && isAdmin && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 text-xs">
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit LR</span>
            </Button>
          )}
          {!isVoided && isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowVoidModal(true)}
              className="gap-1.5 text-xs bg-red-600 hover:bg-red-700"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Void LR</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: 2 Columns Left, 1 Column Right (Screenshot Match) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Shipment Details */}
          <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Shipment Details</h2>

            <div className="grid grid-cols-2 gap-y-4 text-xs">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Consignor</span>
                <span className="font-bold text-slate-900">{docket.consignor_name}</span>
                {docket.consignor_phone && <span className="block text-slate-500">{docket.consignor_phone}</span>}
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Consignee</span>
                <span className="font-bold text-slate-900">{docket.consignee_name}</span>
                {docket.consignee_phone && <span className="block text-slate-500">{docket.consignee_phone}</span>}
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Origin</span>
                <span className="font-semibold text-slate-800">{docket.from_city}</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Destination</span>
                <span className="font-semibold text-slate-800">{docket.to_city}</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Weight</span>
                <span className="font-bold text-slate-900 font-mono">{docket.charged_weight_kg} kg</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Packages</span>
                <span className="font-bold text-slate-900 font-mono">{docket.package_count} packages</span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Physical LR / Vehicle No.</span>
                <span className="font-bold text-slate-900 font-mono">
                  {docket.physical_docket_no || docket.tracking_no || 'Self Vehicle'}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-400 block">Courier / Network</span>
                <span className="font-bold text-slate-900">{docket.courier_partner || 'Self Network'}</span>
              </div>
            </div>
          </Card>

          {/* Card 2: Payment Breakdown */}
          <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Payment Breakdown</h2>

            {/* Every charge line is listed, then subtotal and GST, so the figures
                shown add up to the total on the invoice. */}
            <div className="space-y-2 text-xs divide-y divide-slate-100">
              {[
                { label: 'Freight Charges', value: freight, alwaysShow: true },
                { label: 'Loading / Handling Charges', value: handling, alwaysShow: false },
                { label: 'Risk / Insurance Charges', value: risk, alwaysShow: false },
                { label: 'Docket Charges', value: docketChg, alwaysShow: false },
                { label: 'Pickup & Delivery Charges', value: pickup, alwaysShow: false },
                { label: 'Other Charges', value: other, alwaysShow: false },
              ]
                .filter((line) => line.alwaysShow || line.value > 0)
                .map((line) => (
                  <div key={line.label} className="flex justify-between text-slate-600 pt-1">
                    <span>{line.label}</span>
                    <span className="font-mono">{formatAmount(line.value)}</span>
                  </div>
                ))}

              <div className="flex justify-between text-slate-700 font-semibold pt-1.5">
                <span>Taxable Subtotal</span>
                <span className="font-mono">{formatAmount(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1.5">
                <span>GST ({gstPercentage}%)</span>
                <span className="font-mono">{formatAmount(gstAmount)}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-900 text-sm pt-2">
                <span>Total Amount</span>
                <span className="font-mono text-[#2563EB]">{formatAmount(grandTotal)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-500 font-medium">Payment Status</span>
                <Badge
                  variant={docket.payment_mode === 'Paid' ? 'success' : 'secondary'}
                  className="font-mono text-xs"
                >
                  {docket.payment_mode}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Card 2b: Payments — ledger summary + record action */}
          {!isVoided && (
            <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-6 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900">Payments</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="gap-1.5 text-xs"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{amountDue > 0 ? 'Record Payment' : 'View History'}</span>
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-medium">Grand Total</div>
                  <div className="text-sm font-bold text-slate-900 font-mono">{formatAmount(grandTotal)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-green-50 border border-green-200">
                  <div className="text-[10px] text-green-700 font-medium">Paid</div>
                  <div className="text-sm font-bold text-green-700 font-mono">{formatAmount(amountPaid)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-medium">Due</div>
                  <div className="text-sm font-bold text-amber-700 font-mono">{formatAmount(amountDue)}</div>
                </div>
              </div>
            </Card>
          )}

          {/* Card 3: Documents Download List */}
          <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Documents</h2>

            <div className="space-y-2">
              <button
                onClick={handleDownloadPDF}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-xs font-medium text-slate-800 group"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-red-500" />
                  <span>Lorry Receipt ({docket.docket_no}).pdf</span>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
              </button>

              <button
                onClick={handleDownloadPDF}
                className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-xs font-medium text-slate-800 group"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Tax Invoice ({docket.docket_no}).pdf</span>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
              </button>
            </div>
          </Card>
        </div>

        {/* Right Column (1 Col: Tracking Timeline & Activity Log) */}
        <div className="space-y-6">
          {/* Card 4: Tracking Timeline — driven by real checkpoints, not a
              fixed mock-up; updates live as staff/admin log delivery status. */}
          <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-bold text-slate-900">Tracking Timeline</h2>
              {!isVoided && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTrackingModal(true)}
                  className="gap-1.5 text-[11px] h-7 px-2.5"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>Update Status</span>
                </Button>
              )}
            </div>

            {eventsLoading ? (
              <div className="text-xs text-slate-400 font-mono py-6 text-center">Loading timeline...</div>
            ) : events.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">
                No checkpoints logged yet — status shown is just "Booked".
              </div>
            ) : (
              <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200">
                {[...events].reverse().map((ev, i, arr) => (
                  <div key={ev.id} className="relative">
                    <div
                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                        i === arr.length - 1
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-[#E8F7EF] text-[#1F8A4C]'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">{ev.status}</span>
                      {ev.location && (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {ev.location}
                        </span>
                      )}
                      {ev.description && <span className="text-[11px] text-slate-500 block">{ev.description}</span>}
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {new Date(ev.event_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · '}
                        {ev.created_by_name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Card 5: Activity Log — creation + every admin correction/void. */}
          <Card className="border border-slate-200/80 shadow-2xs rounded-xl bg-white p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-slate-400" />
              Activity Log
            </h2>

            {auditLoading ? (
              <div className="text-xs text-slate-400 font-mono py-6 text-center">Loading activity...</div>
            ) : auditEntries.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No activity recorded yet.</div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditEntries.map((entry) => (
                  <div key={entry.id} className="border border-slate-100 rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                        {entry.action === 'created' && <PlusCircle className="w-3 h-3 text-emerald-600" />}
                        {entry.action === 'edited' && <Pencil className="w-3 h-3 text-blue-600" />}
                        {entry.action === 'voided' && <Ban className="w-3 h-3 text-red-600" />}
                        {entry.action === 'created'
                          ? 'LR created'
                          : entry.action === 'edited'
                          ? 'LR edited'
                          : 'LR voided'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">by {entry.performed_by_name}</div>
                    {entry.changes.length > 0 && (
                      <ul className="text-[10px] text-slate-600 space-y-0.5 pt-1">
                        {entry.changes.map((c, idx) => (
                          <li key={idx}>
                            <span className="font-semibold">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                            <span className="line-through text-slate-400">{String(c.from ?? '—')}</span>{' '}
                            → <span className="text-slate-800">{String(c.to ?? '—')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Void Lorry Receipt ({docket.docket_no})</span>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to void this docket? Voiding is irreversible and records the cancellation in the audit log.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Voiding *</label>
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Order cancelled by customer before dispatch"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            {voidError && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {voidError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowVoidModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleVoidDocket}
                disabled={voiding || !voidReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {voiding ? 'Voiding...' : 'Confirm Void'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Payment Ledger Modal */}
      {showPaymentModal && (
        <RecordPaymentModal
          docket={docket}
          onClose={() => {
            setShowPaymentModal(false);
            if (onVoidSuccess) onVoidSuccess();
          }}
        />
      )}

      {/* Tracking Timeline Modal — add/edit checkpoints; each save re-syncs
          docket.delivery_status server-side, so refresh both local state and
          the parent's docket list to pick that up. */}
      {showTrackingModal && (
        <TrackingTimelineModal
          docket={docket}
          onClose={() => {
            setShowTrackingModal(false);
            fetchEvents();
            if (onVoidSuccess) onVoidSuccess();
          }}
        />
      )}
    </div>
  );
}
