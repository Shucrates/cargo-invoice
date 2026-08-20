'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, MapPin, Truck } from 'lucide-react';
import { CargoDocket } from '@/types/cargo';
import { DELIVERY_STATUSES } from '@/lib/deliveryStatus';

interface TrackingEvent {
  id: string;
  docket_id: string;
  status: string;
  location: string;
  description: string;
  event_at: string;
  created_by_name: string;
}

/** `2026-08-12T14:30` — what a datetime-local input needs, in local time. */
function toDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  docket: CargoDocket;
  onClose: () => void;
}

export default function TrackingTimelineModal({ docket, onClose }: Props) {
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [eventAt, setEventAt] = useState(toDatetimeLocal());
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TrackingEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/tracking-events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch tracking events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docket.id]);

  const openNewForm = () => {
    setEditingId(null);
    setStatus('');
    setLocation('');
    setDescription('');
    setEventAt(toDatetimeLocal());
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (ev: TrackingEvent) => {
    setEditingId(ev.id);
    setStatus(ev.status);
    setLocation(ev.location);
    setDescription(ev.description);
    setEventAt(toDatetimeLocal(ev.event_at));
    setError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/dockets/${docket.id}/tracking-events/${editingId}`
        : `/api/dockets/${docket.id}/tracking-events`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          location,
          description,
          event_at: new Date(eventAt).toISOString(),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save checkpoint');
      }
      await fetchEvents();
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save checkpoint');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/dockets/${docket.id}/tracking-events/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Failed to delete tracking event:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0A2030]/10 flex items-center justify-center text-[#0A2030]">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Update Tracking Status
              </h3>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                LR #{docket.docket_no} · {docket.from_city} → {docket.to_city}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content / Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="text-xs text-slate-400 font-mono py-8 text-center">Loading timeline...</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-slate-400 py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              No status checkpoints logged yet. Add one below to notify staff &amp; customer.
            </div>
          ) : (
            <div className="space-y-0 relative pl-2">
              {events.map((ev, i) => (
                <div key={ev.id} className="relative pl-6 pb-5 last:pb-1">
                  {i !== events.length - 1 && (
                    <div className="absolute left-[5px] top-3 bottom-0 w-0.5 bg-slate-200" />
                  )}
                  <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-[#0A2030] ring-4 ring-blue-50" />
                  <div className="flex items-start justify-between gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-2xs hover:border-slate-200 transition-saas">
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">{ev.status}</div>
                      {ev.location && (
                        <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-[#0A2030]" /> {ev.location}
                        </div>
                      )}
                      {ev.description && (
                        <div className="text-[11px] text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {ev.description}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 font-mono mt-1.5">
                        {new Date(ev.event_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · by '}
                        <span className="font-semibold text-slate-600">{ev.created_by_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditForm(ev)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#0A2030] hover:bg-slate-100 cursor-pointer transition-colors"
                        aria-label="Edit checkpoint"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ev)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                        aria-label="Delete checkpoint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSave} className="border border-slate-200/90 rounded-2xl p-4 space-y-3 bg-slate-50/80 shadow-2xs transition-all">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-xs font-bold text-slate-900">
                  {editingId ? 'Edit Checkpoint' : 'Add New Checkpoint'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Status *</label>
                <select
                  required
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-medium focus:outline-none focus:border-[#0A2030] focus:ring-1 focus:ring-[#0A2030]"
                >
                  <option value="" disabled>Select status option</option>
                  {DELIVERY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Mumbai Central Hub"
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-medium focus:outline-none focus:border-[#0A2030] focus:ring-1 focus:ring-[#0A2030]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventAt}
                    onChange={(e) => setEventAt(e.target.value)}
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-mono focus:outline-none focus:border-[#0A2030] focus:ring-1 focus:ring-[#0A2030]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">Customer Note (Optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Visible on live tracking page"
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-medium focus:outline-none focus:border-[#0A2030] focus:ring-1 focus:ring-[#0A2030]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0A2030] hover:bg-[#071520] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-saas"
                >
                  {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Checkpoint'}
                </button>
              </div>
            </form>
          )}
        </div>

        {!showForm && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={openNewForm}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-slate-300 bg-white hover:border-[#0A2030] hover:text-[#0A2030] text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Status Checkpoint</span>
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <h4 className="text-sm font-extrabold text-red-600">Delete Checkpoint</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">"{deleteTarget.status}"</strong>? This will remove it from the tracking timeline.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
