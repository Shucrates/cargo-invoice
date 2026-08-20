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
  Truck,
  MapPin,
  Package,
  AlertTriangle,
  Wallet,
  History,
  PlusCircle,
  Pencil,
  Ban,
  X,
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
  eway_bill_no: 'E-Way Bill No.',
  freight_amount: 'Freight Charges',
  fuel_charge: 'Fuel Charges',
  clearing_charge: 'Clearing Charges',
  air_service_charge: 'Air Service Charges',
  risk_charge: 'Risk Charges',
  handling_charge: 'Handling Charges',
  docket_charge: 'Docket Charges',
  pickup_delivery_charge: 'Pickup & Delivery Charges',
  other_charge: 'Other Charges',
  gst_percentage: 'GST %',
  payment_mode: 'Payment Mode',
  expected_mode: 'Expected Payment Mode',
  customer_code: 'Customer',
  delivery_status: 'Delivery Status',
};

function formatAmount(val: number): string {
  return `₹${val.toLocaleString('en-IN')}`;
}

interface ShipmentDetailViewProps {
  docket: CargoDocket | null;
  isOpen?: boolean;
  onBack: () => void;
  onVoidSuccess?: () => void;
  onEdit?: () => void;
}

export default function ShipmentDetailView({ docket, isOpen = true, onBack, onVoidSuccess, onEdit }: ShipmentDetailViewProps) {
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
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const fetchEvents = () => {
    if (!docket) return;
    setEventsLoading(true);
    fetch(`/api/dockets/${docket.id}/tracking-events`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events ?? []))
      .catch((err) => console.error('Failed to fetch tracking events:', err))
      .finally(() => setEventsLoading(false));
  };

  const fetchAuditLog = () => {
    if (!docket) return;
    setAuditLoading(true);
    fetch(`/api/dockets/${docket.id}/audit-log`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data) => setAuditEntries(data.entries ?? []))
      .catch((err) => console.error('Failed to fetch activity log:', err))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    if (docket?.id) {
      fetchEvents();
      fetchAuditLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docket?.id]);

  if (!isOpen || !docket) return null;

  const isVoided = docket.status === 'voided';
  const freight = Number(docket.freight_amount || 0);
  const fuel = Number(docket.fuel_charge || 0);
  const clearing = Number(docket.clearing_charge || 0);
  const airService = Number(docket.air_service_charge || 0);
  const handling = Number(docket.handling_charge || 0);
  const risk = Number(docket.risk_charge || 0);
  const docketChg = Number(docket.docket_charge || 0);
  const pickup = Number(docket.pickup_delivery_charge || 0);
  const other = Number(docket.other_charge || 0);

  const subtotal = Number(docket.subtotal || 0);
  const gstPercentage = Number(docket.gst_percentage || 18);
  const gstAmount = Number(docket.gst_amount || 0);
  const grandTotal = Number(docket.grand_total || 0);
  const amountPaid = docket.amount_paid ?? (docket.payment_mode === 'Paid' ? grandTotal : 0);
  const amountDue = docket.amount_due ?? Math.max(grandTotal - amountPaid, 0);

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
    <div className="fixed inset-0 z-50 overflow-hidden font-sans text-slate-900">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onBack}
      />

      {/* Tall Right Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 z-50">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
          {/* Header Box (Screenshot 2 Match) */}
          <div className="p-5 border-b border-slate-200/80 bg-slate-50/70 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                LR Invoice to {docket.consignee_name || docket.consignor_name}
              </span>
              <button
                onClick={onBack}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900 font-mono tracking-tight">
                    #{docket.docket_no}
                  </h2>
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
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Booked {docket.booking_date} · {docket.from_city} → {docket.to_city}
                </p>
              </div>

              <div className="text-right">
                <div className="text-2xl font-extrabold text-[#0A2030] font-mono">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Due: ₹{amountDue.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {!isVoided && (
                <Button
                  size="sm"
                  onClick={() => setShowTrackingModal(true)}
                  className="h-8 text-xs font-bold gap-1.5 bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Update Status</span>
                </Button>
              )}

              {!isVoided && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="h-8 text-xs font-semibold gap-1.5 text-slate-700 border-slate-200 hover:bg-slate-100"
                >
                  <Wallet className="w-3.5 h-3.5 text-[#0A2030]" />
                  <span>Update Pay</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                className="h-8 text-xs font-semibold gap-1.5 text-slate-700 border-slate-200 hover:bg-slate-100"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>PDF</span>
              </Button>

              {!isVoided && isAdmin && onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="h-8 text-xs font-semibold gap-1.5 text-slate-700 border-slate-200 hover:bg-slate-100"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Button>
              )}

              {!isVoided && isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowVoidModal(true)}
                  className="h-8 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 ml-auto"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Void</span>
                </Button>
              )}
            </div>
          </div>

          {/* Drawer Scrollable Content — One Single Continuous Sheet */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 divide-y divide-slate-100">
            {/* Section 1: Shipment Logistics Details */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Shipment Information
              </h3>
              <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Consignor</span>
                  <span className="font-bold text-slate-900">{docket.consignor_name}</span>
                  {docket.consignor_phone && <span className="block text-slate-500 text-[11px]">{docket.consignor_phone}</span>}
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Consignee</span>
                  <span className="font-bold text-slate-900">{docket.consignee_name}</span>
                  {docket.consignee_phone && <span className="block text-slate-500 text-[11px]">{docket.consignee_phone}</span>}
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Origin → Destination</span>
                  <span className="font-bold text-slate-800">{docket.from_city} → {docket.to_city}</span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Mode / Vehicle</span>
                  <span className="font-bold text-slate-900">{docket.transport_mode || 'Road'}</span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Charged Weight</span>
                  <span className="font-bold text-slate-900 font-mono">{docket.charged_weight_kg} kg</span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Packages</span>
                  <span className="font-bold text-slate-900 font-mono">{docket.package_count} pkgs</span>
                </div>

                {docket.physical_docket_no && (
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block">Paper LR / Vehicle No.</span>
                    <span className="font-bold text-slate-900 font-mono">{docket.physical_docket_no}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Financial & Charges Breakdown */}
            <div className="pt-5 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Payment &amp; Tariff Breakdown
              </h3>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Freight Charges', value: freight, alwaysShow: true },
                  { label: 'Fuel Charges', value: fuel, alwaysShow: false },
                  { label: 'Clearing Charges', value: clearing, alwaysShow: false },
                  { label: 'Air Service Charges', value: airService, alwaysShow: false },
                  { label: 'Loading / Handling Charges', value: handling, alwaysShow: false },
                  { label: 'Risk / Insurance Charges', value: risk, alwaysShow: false },
                  { label: 'Docket Charges', value: docketChg, alwaysShow: false },
                  { label: 'Pickup & Delivery Charges', value: pickup, alwaysShow: false },
                  { label: 'Other Charges', value: other, alwaysShow: false },
                ]
                  .filter((line) => line.alwaysShow || line.value > 0)
                  .map((line) => (
                    <div key={line.label} className="flex justify-between text-slate-600">
                      <span>{line.label}</span>
                      <span className="font-mono">{formatAmount(line.value)}</span>
                    </div>
                  ))}

                <div className="flex justify-between text-slate-700 font-semibold pt-1 border-t border-slate-100">
                  <span>Taxable Subtotal</span>
                  <span className="font-mono">{formatAmount(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST ({gstPercentage}%)</span>
                  <span className="font-mono">{formatAmount(gstAmount)}</span>
                </div>

                <div className="flex justify-between font-extrabold text-slate-900 text-sm pt-2 border-t border-slate-200">
                  <span>Grand Total</span>
                  <span className="font-mono text-[#0A2030]">{formatAmount(grandTotal)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-medium">Grand Total</div>
                    <div className="text-xs font-bold text-slate-900 font-mono">{formatAmount(grandTotal)}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="text-[10px] text-emerald-700 font-medium">Paid</div>
                    <div className="text-xs font-bold text-emerald-700 font-mono">{formatAmount(amountPaid)}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                    <div className="text-[10px] text-amber-700 font-medium">Due</div>
                    <div className="text-xs font-bold text-amber-700 font-mono">{formatAmount(amountDue)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Tracking Events Timeline */}
            <div className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Tracking History
                </h3>
                {!isVoided && (
                  <button
                    onClick={() => setShowTrackingModal(true)}
                    className="text-xs font-bold text-[#0A2030] hover:underline cursor-pointer"
                  >
                    + Add Checkpoint
                  </button>
                )}
              </div>

              {eventsLoading ? (
                <div className="text-xs text-slate-400 font-mono py-4 text-center">Loading timeline...</div>
              ) : events.length === 0 ? (
                <div className="text-xs text-slate-400 py-3">
                  No checkpoints logged yet — status is Booked.
                </div>
              ) : (
                <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {[...events].reverse().map((ev, i, arr) => (
                    <div key={ev.id} className="relative">
                      <div
                        className={`absolute -left-5 top-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                          i === arr.length - 1
                            ? 'bg-[#0A2030] text-white'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-900 block">{ev.status}</span>
                        {ev.location && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {ev.location}
                          </span>
                        )}
                        {ev.description && <span className="text-[11px] text-slate-600 block">{ev.description}</span>}
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
            </div>

            {/* Section 4: Audit & Activity Log */}
            <div className="pt-5 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Audit &amp; Activity Stream</span>
              </h3>

              {auditLoading ? (
                <div className="text-xs text-slate-400 font-mono py-4 text-center">Loading audit log...</div>
              ) : auditEntries.length === 0 ? (
                <div className="text-xs text-slate-400 py-3">No audit activity recorded yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="text-xs space-y-0.5 py-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          {entry.action === 'created' ? 'LR Created' : entry.action === 'edited' ? 'LR Edited' : 'LR Voided'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">by {entry.performed_by_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
          isAdmin={isAdmin}
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
