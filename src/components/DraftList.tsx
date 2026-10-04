'use client';

import { useState, useEffect, useMemo } from 'react';
import { DocketDraft } from '@/types/cargo';
import { FileText, Edit2, Trash2, Search, Plus, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupees } from '@/lib/money';
import { notify } from '@/lib/notify';

export type LRStep = 'consignor' | 'consignee' | 'route' | 'shipment' | 'transport' | 'charges' | 'payment';

const STEPS: { id: LRStep; label: string }[] = [
  { id: 'consignor', label: 'Consignor' },
  { id: 'consignee', label: 'Consignee' },
  { id: 'route', label: 'Route & Mode' },
  { id: 'shipment', label: 'Goods & Weight' },
  { id: 'transport', label: 'Carrier' },
  { id: 'charges', label: 'Charges' },
  { id: 'payment', label: 'Payment' },
];

function getDraftStepInfo(data: Record<string, any> = {}) {
  if (data.current_step) {
    const idx = STEPS.findIndex((s) => s.id === data.current_step);
    if (idx !== -1) {
      return {
        stepNumber: idx + 1,
        totalSteps: STEPS.length,
        stepLabel: STEPS[idx].label,
      };
    }
  }

  // Fallback deduction if current_step was not explicitly saved
  let stepNumber = 1;
  if (!data.consignor_name) stepNumber = 1;
  else if (!data.consignee_name) stepNumber = 2;
  else if (!data.from_city || !data.to_city) stepNumber = 3;
  else if (!data.charged_weight_kg && !data.package_count) stepNumber = 4;
  else if (!data.courier_partner && !data.tracking_no) stepNumber = 5;
  else if (!data.freight_amount) stepNumber = 6;
  else stepNumber = 7;

  return {
    stepNumber,
    totalSteps: STEPS.length,
    stepLabel: STEPS[stepNumber - 1].label,
  };
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface DraftListProps {
  onEdit: (draft: DocketDraft) => void;
  onDraftsChanged?: (count: number) => void;
  onNewLR?: () => void;
}

export default function DraftList({ onEdit, onDraftsChanged, onNewLR }: DraftListProps) {
  const [drafts, setDrafts] = useState<DocketDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocketDraft | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dockets/drafts');
      if (res.ok) {
        const data = await res.json();
        const list = (data.drafts ?? []) as DocketDraft[];
        setDrafts(list);
        onDraftsChanged?.(list.length);
      } else {
        setDrafts([]);
      }
    } catch (err) {
      console.error('Failed to fetch drafts:', err);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null); // Close modal instantly

    // Optimistic UI update
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== target.id);
      onDraftsChanged?.(next.length);
      return next;
    });

    try {
      const res = await fetch(`/api/dockets/drafts/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setDrafts((prev) => {
          const next = [target, ...prev];
          onDraftsChanged?.(next.length);
          return next;
        });
        notify('Failed to delete draft.');
      }
    } catch (err) {
      console.error('Failed to delete draft:', err);
      setDrafts((prev) => {
        const next = [target, ...prev];
        onDraftsChanged?.(next.length);
        return next;
      });
      notify('Failed to delete draft.');
    }
  };

  const filteredDrafts = useMemo(() => {
    if (!search.trim()) return drafts;
    const q = search.toLowerCase();
    return drafts.filter((d) => {
      const data = d.data || {};
      return (
        (d.label && d.label.toLowerCase().includes(q)) ||
        (data.consignor_name && String(data.consignor_name).toLowerCase().includes(q)) ||
        (data.consignee_name && String(data.consignee_name).toLowerCase().includes(q)) ||
        (data.from_city && String(data.from_city).toLowerCase().includes(q)) ||
        (data.to_city && String(data.to_city).toLowerCase().includes(q)) ||
        (data.goods_description && String(data.goods_description).toLowerCase().includes(q)) ||
        (d.created_by_name && String(d.created_by_name).toLowerCase().includes(q))
      );
    });
  }, [drafts, search]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-heading">Drafts</h1>
          <p className="text-xs text-slate-500 font-normal">
            Saved in-progress LRs ({drafts.length}) &middot; Auto-cleaned after 30 days
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onNewLR && (
            <Button
              onClick={onNewLR}
              className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-[#0A2030] hover:bg-slate-800 text-white cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New LR</span>
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {drafts.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drafts by party, route, creator..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
          />
        </div>
      )}

      {/* Drafts List */}
      {loading ? (
        <div className="text-center py-16 text-xs text-slate-400 font-medium">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-slate-200 rounded-xl bg-white space-y-2">
          <FileText className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500">No saved drafts. Half-fill an LR and click "Save as Draft" to resume later.</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="text-center py-12 border border-slate-200 rounded-xl bg-white text-xs text-slate-400">
          No drafts matching "{search}"
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredDrafts.map((draft) => {
            const data = draft.data || {};
            const stepInfo = getDraftStepInfo(data);
            const fromCity = data.from_city || '—';
            const toCity = data.to_city || '—';
            const mode = data.transport_mode || 'Road';
            const weight = data.charged_weight_kg || data.actual_weight_kg;
            const pkgs = data.package_count;
            const freight = data.freight_amount;
            const creatorName = draft.created_by_name || 'Staff';

            return (
              <div
                key={draft.id}
                className="p-5 bg-white border border-slate-200/90 rounded-xl hover:border-slate-300 transition-colors shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                {/* Left: Label, Route, Step, Parties & Creator */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-900 truncate">
                      {draft.label}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded">
                      Step {stepInfo.stepNumber} of {stepInfo.totalSteps} · {stepInfo.stepLabel}
                    </span>
                    <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                      {mode}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1 font-medium text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{fromCity} → {toCity}</span>
                    </div>
                    {data.consignor_name && (
                      <span className="truncate max-w-[220px]">
                        From: <span className="text-slate-700 font-medium">{data.consignor_name}</span>
                      </span>
                    )}
                    {data.consignee_name && (
                      <span className="truncate max-w-[220px]">
                        To: <span className="text-slate-700 font-medium">{data.consignee_name}</span>
                      </span>
                    )}
                  </div>

                  {/* Creator & Timestamp meta */}
                  <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400 pt-0.5">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>Created by <strong className="font-medium text-slate-600">{creatorName}</strong></span>
                    </span>
                    <span>&middot;</span>
                    <span>Saved {timeAgo(draft.updated_at)}</span>
                  </div>
                </div>

                {/* Middle: Details (Weight, Packages, Freight) */}
                <div className="flex items-center gap-6 text-xs text-slate-600 shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Weight</span>
                    <span className="font-semibold text-slate-900 text-sm">{weight ? `${weight} kg` : '—'}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Packages</span>
                    <span className="font-semibold text-slate-900 text-sm">{pkgs ? `${pkgs} pkgs` : '—'}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Freight</span>
                    <span className="font-semibold text-slate-900 text-sm">
                      {freight ? `${formatRupees(Number(freight))}` : '—'}
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => onEdit(draft)}
                    className="h-9 px-4 text-xs font-semibold rounded-lg bg-[#0A2030] hover:bg-slate-800 text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(draft)}
                    className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-red-100"
                    title="Delete draft"
                    aria-label="Delete draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full border border-slate-200 shadow-lg space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Delete Draft</h3>
            <p className="text-xs text-slate-500">
              Delete "{deleteTarget.label}"? This draft cannot be recovered.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg cursor-pointer"
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


