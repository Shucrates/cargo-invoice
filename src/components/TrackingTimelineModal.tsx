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
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#2563EB]" />
              Tracking Timeline
            </h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{docket.docket_no}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="text-xs text-slate-400 font-mono py-6 text-center">Loading timeline...</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">
              No checkpoints logged yet. Add one below.
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((ev, i) => (
                <div key={ev.id} className="relative pl-6 pb-4 last:pb-0">
                  {i !== events.length - 1 && (
                    <div className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" />
                  )}
                  <div className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{ev.status}</div>
                      {ev.location && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {ev.location}
                        </div>
                      )}
                      {ev.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{ev.description}</div>
                      )}
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        {new Date(ev.event_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · '}
                        {ev.created_by_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditForm(ev)}
                        className="p-1 rounded text-slate-400 hover:text-[#2563EB] hover:bg-slate-100 cursor-pointer"
                        aria-label="Edit checkpoint"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ev)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 cursor-pointer"
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
            <form onSubmit={handleSave} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-slate-50/60">
              {error && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium rounded-md">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Status *</label>
                <select
                  required
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select status</option>
                  {DELIVERY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Pune Hub"
                    className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventAt}
                    onChange={(e) => setEventAt(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-200 rounded-md bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Note (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown to the customer on the tracking page"
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
                  className="px-3 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-md text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Checkpoint'}
                </button>
              </div>
            </form>
          )}
        </div>

        {!showForm && (
          <div className="px-5 py-3 border-t border-slate-200">
            <button
              onClick={openNewForm}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-[#2563EB] hover:text-[#2563EB] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Checkpoint
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full border border-slate-300 shadow-xl">
            <h4 className="text-sm font-bold text-red-700 mb-2">Delete checkpoint</h4>
            <p className="text-xs text-slate-600 mb-4">
              Delete "{deleteTarget.status}"? This will remove it from the customer-facing tracking page.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold disabled:opacity-50 cursor-pointer"
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
