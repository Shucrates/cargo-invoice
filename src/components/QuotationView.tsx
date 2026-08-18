'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Download, Plus, Trash2, Star, Save, Loader2, X, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityInput } from '@/components/ui/city-input';
import { generateQuotationPDF, QuotationRateItem } from '@/lib/pdfGenerator';
import { getCompanySettings } from '@/lib/companyConfig';
import { formatCreatedAt } from '@/lib/formatDate';

export type SheetType = 'ROAD_RAIL' | 'AIR';

export interface QuotationSheetDTO {
  id: string;
  created_by: string;
  created_by_name: string;
  name: string;
  sheet_type: SheetType;
  origin_city: string;
  is_default: boolean;
  min_qty_kg: number;
  rates: QuotationRateItem[];
  notes: string[];
  created_at: string;
  updated_at: string;
}

const SEED_ROAD_RAIL: QuotationRateItem[] = [
  { destination: 'PUNE', ratePerKg: 16, mode: 'BY ROAD', deliveryTime: '24 HRS' },
  { destination: 'NASHIK', ratePerKg: 16, mode: 'BY ROAD', deliveryTime: '24 HRS' },
  { destination: 'NAGPUR', ratePerKg: 21, mode: 'BY RAIL', deliveryTime: '48 HRS' },
  { destination: 'NEW DELHI', ratePerKg: 28, mode: 'BY RAIL', deliveryTime: '48 HRS' },
];

const SEED_AIR: QuotationRateItem[] = [
  { region: 'South', destination: 'HYDERABAD', ratePerKg: 70, mode: 'BY AIR' },
  { region: 'South', destination: 'BANGALORE', ratePerKg: 75, mode: 'BY AIR' },
  { region: 'North UP', destination: 'NEW DELHI', ratePerKg: 72, mode: 'BY AIR' },
  { region: 'North East', destination: 'GUWAHATI', ratePerKg: 85, mode: 'BY AIR' },
];

const SEED_NOTES: Record<SheetType, string[]> = {
  ROAD_RAIL: [
    'By Train - An additional charge of Rs. 2 per kg will be applied to all return parcel',
    'All return parcels subject to verification',
  ],
  AIR: ['35% SERVICE CHARGES', 'GST 18%'],
};

/** Groups Air sheet rates by region, preserving first-seen region order —
 *  mirrors the side-by-side "South / North UP / North East / Bihar" mini
 *  tables on the printed rate card. */
function groupByRegion(rates: QuotationRateItem[]): Array<[string, QuotationRateItem[]]> {
  const map = new Map<string, { label: string; rows: QuotationRateItem[] }>();
  rates.forEach((r) => {
    const label = r.region?.trim() || 'General';
    const key = label.toLowerCase();
    if (!map.has(key)) map.set(key, { label, rows: [] });
    map.get(key)!.rows.push(r);
  });
  return Array.from(map.values()).map(({ label, rows }) => [label, rows]);
}

export default function QuotationView() {
  const settings = getCompanySettings();
  const [activeType, setActiveType] = useState<SheetType>('ROAD_RAIL');
  const [activeCity, setActiveCity] = useState<string>(settings.defaultOriginCity || 'Mumbai');
  const [sheets, setSheets] = useState<QuotationSheetDTO[]>([]);
  // Origin cities already used across sheets, and destination cities already used on
  // rate lines, surfaced first in the city autocompletes below.
  const knownOriginCities = useMemo(() => sheets.map((s) => s.origin_city).filter(Boolean), [sheets]);
  const knownDestCities = useMemo(
    () => sheets.flatMap((s) => s.rates.map((r) => r.destination)).filter(Boolean),
    [sheets]
  );
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local editable draft of the active sheet
  const [draftName, setDraftName] = useState('');
  const [draftOriginCity, setDraftOriginCity] = useState('');
  const [draftMinQty, setDraftMinQty] = useState(200);
  const [draftRates, setDraftRates] = useState<QuotationRateItem[]>([]);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  const [newRegion, setNewRegion] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newMode, setNewMode] = useState<QuotationRateItem['mode']>(activeType === 'AIR' ? 'BY AIR' : 'BY RAIL');
  const [newTime, setNewTime] = useState('48 HRS');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createOriginCity, setCreateOriginCity] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [showPreview, setShowPreview] = useState(false);

  const citiesForType = Array.from(new Set(sheets.filter((s) => s.sheet_type === activeType).map((s) => s.origin_city)));
  const sheetsOfType = sheets.filter(
    (s) => s.sheet_type === activeType && s.origin_city.toLowerCase() === activeCity.toLowerCase()
  );
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || null;

  const fetchSheets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quotations');
      const data = await res.json();
      const loaded: QuotationSheetDTO[] = data.sheets || [];
      setSheets(loaded);

      const forType = loaded.filter((s) => s.sheet_type === activeType);
      const forCity = forType.filter((s) => s.origin_city.toLowerCase() === activeCity.toLowerCase());
      const preferred = forCity.find((s) => s.is_default) || forCity[0] || forType[0];
      if (preferred) {
        setActiveSheetId(preferred.id);
        setActiveCity(preferred.origin_city);
      }
    } catch (e) {
      console.error('Failed to load quotation sheets', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const forType = sheets.filter((s) => s.sheet_type === activeType);
    if (forType.length === 0) {
      setActiveSheetId('');
      return;
    }
    if (!forType.some((s) => s.origin_city.toLowerCase() === activeCity.toLowerCase())) {
      const preferred = forType.find((s) => s.is_default) || forType[0];
      setActiveCity(preferred.origin_city);
    }
    setNewMode(activeType === 'AIR' ? 'BY AIR' : 'BY RAIL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, sheets]);

  useEffect(() => {
    const forCity = sheets.filter(
      (s) => s.sheet_type === activeType && s.origin_city.toLowerCase() === activeCity.toLowerCase()
    );
    if (forCity.length === 0) {
      setActiveSheetId('');
      return;
    }
    if (!forCity.some((s) => s.id === activeSheetId)) {
      const preferred = forCity.find((s) => s.is_default) || forCity[0];
      setActiveSheetId(preferred.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCity, sheets]);

  useEffect(() => {
    if (activeSheet) {
      setDraftName(activeSheet.name);
      setDraftOriginCity(activeSheet.origin_city);
      setDraftMinQty(activeSheet.min_qty_kg);
      setDraftRates(activeSheet.rates);
      setDraftNotes(activeSheet.notes);
      setDirty(false);
    } else {
      setDraftName('');
      setDraftOriginCity(activeCity);
      setDraftMinQty(200);
      setDraftRates([]);
      setDraftNotes([]);
      setDirty(false);
    }
  }, [activeSheet]);

  const markDirty = () => setDirty(true);

  const openCreateModal = () => {
    setCreateName(activeType === 'AIR' ? 'Air Rate Sheet' : 'Road & Rail Rate Sheet');
    setCreateOriginCity(activeCity || settings.defaultOriginCity || 'Mumbai');
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
  };

  const submitCreateSheet = async () => {
    const name = createName.trim();
    const originCity = createOriginCity.trim();
    if (!name) {
      setCreateError('Sheet name is required.');
      return;
    }
    if (!originCity) {
      setCreateError('Origin city is required.');
      return;
    }
    const existingForCity = sheets.filter(
      (s) => s.sheet_type === activeType && s.origin_city.toLowerCase() === originCity.toLowerCase()
    );
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sheet_type: activeType,
          origin_city: originCity,
          min_qty_kg: activeType === 'AIR' ? 30 : 200,
          rates: existingForCity.length === 0 ? (activeType === 'AIR' ? SEED_AIR : SEED_ROAD_RAIL) : [],
          notes: SEED_NOTES[activeType],
          is_default: existingForCity.length === 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create sheet');
      const created: QuotationSheetDTO = await res.json();
      setSheets((prev) => [created, ...prev]);
      setActiveCity(created.origin_city);
      setActiveSheetId(created.id);
      setShowCreateModal(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create quotation sheet');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSheet = async () => {
    if (!activeSheet) return;
    if (!window.confirm(`Delete quotation sheet "${activeSheet.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/quotations/${activeSheet.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete sheet');
      setSheets((prev) => prev.filter((s) => s.id !== activeSheet.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete quotation sheet');
    }
  };

  const handleSetDefault = async () => {
    if (!activeSheet) return;
    try {
      const res = await fetch(`/api/quotations/${activeSheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to set default');
      const updated: QuotationSheetDTO = await res.json();
      setSheets((prev) =>
        prev.map((s) =>
          s.sheet_type === updated.sheet_type && s.origin_city.toLowerCase() === updated.origin_city.toLowerCase()
            ? { ...s, is_default: s.id === updated.id }
            : s
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to set default quotation sheet');
    }
  };

  const handleSave = async () => {
    if (!activeSheet) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${activeSheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          origin_city: draftOriginCity,
          min_qty_kg: draftMinQty,
          rates: draftRates,
          notes: draftNotes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save sheet');
      const updated: QuotationSheetDTO = await res.json();
      setSheets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setActiveCity(updated.origin_city);
      setDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save quotation sheet');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRate = () => {
    if (!newCity || !newRate) return;
    setDraftRates((prev) => [
      ...prev,
      {
        region: activeType === 'AIR' ? (newRegion.trim() || 'General') : undefined,
        destination: newCity.toUpperCase(),
        ratePerKg: Number(newRate),
        mode: newMode,
        deliveryTime: activeType === 'AIR' ? undefined : newTime,
      },
    ]);
    setNewRegion('');
    setNewCity('');
    setNewRate('');
    markDirty();
  };

  const handleRemoveRate = (idx: number) => {
    setDraftRates((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateRateField = (idx: number, field: keyof QuotationRateItem, value: string | number) => {
    setDraftRates((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    markDirty();
  };

  const handleAddNote = () => {
    setDraftNotes((prev) => [...prev, '']);
    markDirty();
  };

  const updateNote = (idx: number, value: string) => {
    setDraftNotes((prev) => prev.map((n, i) => (i === idx ? value : n)));
    markDirty();
  };

  const removeNote = (idx: number) => {
    setDraftNotes((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const handleDownload = () => {
    if (!activeSheet) return;
    generateQuotationPDF({
      name: draftName || activeSheet.name,
      sheet_type: activeType,
      min_qty_kg: draftMinQty,
      rates: draftRates,
      notes: draftNotes,
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quotation Rate Sheets</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Build, edit, and download PAN India rate cards. The sheet marked Default auto-prices new LRs by destination + mode.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => setShowPreview(!showPreview)} disabled={!activeSheet} variant="outline" className="gap-2 text-xs font-semibold">
            <Eye className="w-4 h-4" />
            <span>{showPreview ? 'Edit Sheet' : 'Preview'}</span>
          </Button>
          <Button onClick={handleDownload} disabled={!activeSheet} variant="outline" className="gap-2 text-xs font-semibold">
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </Button>
          <Button onClick={handleSave} disabled={!activeSheet || !dirty || saving} className="gap-2 shadow-saas text-xs font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
      </div>

      {!showPreview && (
      <>
      {/* Sheet Type Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          onClick={() => setActiveType('ROAD_RAIL')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-saas cursor-pointer ${
            activeType === 'ROAD_RAIL' ? 'bg-[#2563EB] text-white shadow-saas' : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Road & Rail Rate Sheet
        </button>
        <button
          onClick={() => setActiveType('AIR')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-saas cursor-pointer ${
            activeType === 'AIR' ? 'bg-[#2563EB] text-white shadow-saas' : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Domestic Air Rate Sheet
        </button>

        {citiesForType.length > 0 && (
          <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-200/80">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Origin</span>
            {citiesForType.map((city) => (
              <button
                key={city}
                onClick={() => setActiveCity(city)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-saas cursor-pointer ${
                  activeCity.toLowerCase() === city.toLowerCase()
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading quotation sheets...
        </div>
      ) : (
        <>
          {/* Sheet Picker */}
          <Card className="p-4 border border-slate-200/80 shadow-saas rounded-2xl bg-white">
            <div className="flex flex-wrap items-center gap-3">
              <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={activeSheetId}
                onChange={(e) => setActiveSheetId(e.target.value)}
                className="text-xs font-semibold h-10 px-3 border border-slate-200/90 rounded-xl bg-[#F8FAFC] text-slate-900 focus:border-[#2563EB] focus:outline-none min-w-[220px]"
              >
                {sheetsOfType.length === 0 && <option value="">No sheets yet</option>}
                {sheetsOfType.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.is_default ? '(Default)' : ''}
                  </option>
                ))}
              </select>

              <Button onClick={openCreateModal} variant="outline" className="h-10 gap-1.5 text-xs font-semibold">
                <Plus className="w-4 h-4" /> New Sheet
              </Button>

              {activeSheet && !activeSheet.is_default && (
                <Button onClick={handleSetDefault} variant="outline" className="h-10 gap-1.5 text-xs font-semibold">
                  <Star className="w-4 h-4" /> Set as Default
                </Button>
              )}
              {activeSheet?.is_default && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 h-10">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> Default for {activeType === 'AIR' ? 'Air' : 'Road/Rail'} bills
                </span>
              )}

              {activeSheet && (
                <Button onClick={handleDeleteSheet} variant="outline" className="h-10 gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 ml-auto">
                  <Trash2 className="w-4 h-4" /> Delete Sheet
                </Button>
              )}
            </div>

            {activeSheet && (
              <p className="text-[11px] text-slate-400 mt-2">
                Created by <span className="font-semibold text-slate-500">{activeSheet.created_by_name || 'Staff'}</span>
                {activeSheet.updated_at && ` · last saved ${formatCreatedAt(activeSheet.updated_at)}`}
              </p>
            )}

            {activeSheet && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Sheet Name</label>
                  <Input value={draftName} onChange={(e) => { setDraftName(e.target.value); markDirty(); }} className="text-xs bg-[#F8FAFC]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Origin City</label>
                  <CityInput
                    value={draftOriginCity}
                    onChange={(v) => { setDraftOriginCity(v); markDirty(); }}
                    extraCities={knownOriginCities}
                    placeholder="Mumbai"
                    className="text-xs bg-[#F8FAFC] font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Minimum Order Quantity (Kgs)</label>
                  <Input
                    type="number"
                    value={draftMinQty}
                    onChange={(e) => { setDraftMinQty(Number(e.target.value)); markDirty(); }}
                    className="text-xs font-mono bg-[#F8FAFC]"
                  />
                </div>
              </div>
            )}
          </Card>

          {!activeSheet ? (
            <Card className="p-10 border border-dashed border-slate-300 rounded-2xl bg-white text-center text-sm text-slate-500">
              No {activeType === 'AIR' ? 'Air' : 'Road/Rail'} quotation sheet yet for {activeCity}. Click &ldquo;New Sheet&rdquo; to create one.
            </Card>
          ) : (
            <>
              {/* Add New Rate Row */}
              <Card className="p-6 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-4">
                <div className="text-sm font-bold text-slate-900">Add Rate Line</div>
                <div className={`grid grid-cols-1 gap-4 items-end ${activeType === 'AIR' ? 'sm:grid-cols-5' : 'sm:grid-cols-5'}`}>
                  {activeType === 'AIR' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Region</label>
                      <Input placeholder="South" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} className="text-xs bg-[#F8FAFC]" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Destination City</label>
                    <CityInput
                      placeholder="PUNE"
                      value={newCity}
                      onChange={setNewCity}
                      extraCities={knownDestCities}
                      className="text-xs uppercase bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Rate / KG (₹)</label>
                    <Input placeholder="16" type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="text-xs font-mono bg-[#F8FAFC]" />
                  </div>
                  {activeType === 'ROAD_RAIL' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Transport Mode</label>
                      <select
                        value={newMode}
                        onChange={(e) => setNewMode(e.target.value as QuotationRateItem['mode'])}
                        className="w-full text-xs h-12 px-3 border border-slate-200/90 rounded-xl bg-[#F8FAFC] text-slate-900 focus:border-[#2563EB] focus:outline-none"
                      >
                        <option value="BY ROAD">BY ROAD</option>
                        <option value="BY RAIL">BY RAIL</option>
                      </select>
                    </div>
                  )}
                  {activeType === 'ROAD_RAIL' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Delivery Time</label>
                      <Input placeholder="24 HRS" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="text-xs bg-[#F8FAFC]" />
                    </div>
                  )}
                  <Button onClick={handleAddRate} className="h-12 text-xs font-semibold gap-1.5 shadow-saas">
                    <Plus className="w-4 h-4" />
                    <span>Add Rate</span>
                  </Button>
                </div>
              </Card>

              {/* Editable Rate Table */}
              <Card className="p-0 border border-slate-200/80 shadow-saas rounded-2xl bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600 font-semibold uppercase text-[10px]">
                      {activeType === 'AIR' && <th className="p-2.5">Region</th>}
                      <th className="p-2.5">Destination</th>
                      <th className="p-2.5">Rate / Kg</th>
                      {activeType === 'ROAD_RAIL' && <th className="p-2.5">Mode</th>}
                      {activeType === 'ROAD_RAIL' && <th className="p-2.5">Delivery Time</th>}
                      <th className="p-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftRates.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {activeType === 'AIR' && (
                          <td className="p-1.5">
                            <Input value={r.region || ''} onChange={(e) => updateRateField(idx, 'region', e.target.value)} className="text-xs h-8 bg-[#F8FAFC]" />
                          </td>
                        )}
                        <td className="p-1.5">
                          <Input value={r.destination} onChange={(e) => updateRateField(idx, 'destination', e.target.value.toUpperCase())} className="text-xs h-8 bg-[#F8FAFC] font-semibold" />
                        </td>
                        <td className="p-1.5">
                          <Input type="number" value={r.ratePerKg} onChange={(e) => updateRateField(idx, 'ratePerKg', Number(e.target.value))} className="text-xs h-8 font-mono bg-[#F8FAFC]" />
                        </td>
                        {activeType === 'ROAD_RAIL' && (
                          <td className="p-1.5">
                            <select
                              value={r.mode}
                              onChange={(e) => updateRateField(idx, 'mode', e.target.value)}
                              className="w-full text-xs h-8 px-2 border border-slate-200/90 rounded-lg bg-[#F8FAFC] text-slate-900 focus:border-[#2563EB] focus:outline-none"
                            >
                              <option value="BY ROAD">BY ROAD</option>
                              <option value="BY RAIL">BY RAIL</option>
                            </select>
                          </td>
                        )}
                        {activeType === 'ROAD_RAIL' && (
                          <td className="p-1.5">
                            <Input value={r.deliveryTime || ''} onChange={(e) => updateRateField(idx, 'deliveryTime', e.target.value)} className="text-xs h-8 bg-[#F8FAFC]" />
                          </td>
                        )}
                        <td className="p-1.5 text-center">
                          <button onClick={() => handleRemoveRate(idx)} className="text-red-500 hover:text-red-700 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {draftRates.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400">No rate lines yet. Add one above.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>

              {/* Footer Notes */}
              <Card className="p-6 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-slate-900">Footer Notes</div>
                  <Button onClick={handleAddNote} variant="outline" className="h-8 gap-1.5 text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Add Note
                  </Button>
                </div>
                <div className="space-y-2">
                  {draftNotes.map((note, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input value={note} onChange={(e) => updateNote(idx, e.target.value)} className="text-xs bg-[#F8FAFC]" />
                      <button onClick={() => removeNote(idx)} className="text-red-500 hover:text-red-700 cursor-pointer shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {draftNotes.length === 0 && <div className="text-xs text-slate-400">No footer notes.</div>}
                </div>
              </Card>
            </>
          )}
        </>
      )}
      </>
      )}

      {showPreview && activeSheet && (
        <div className="bg-white text-slate-900 p-6 md:p-8 border border-slate-300 rounded-2xl shadow-xl font-sans text-xs animate-fade-in">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Rate Sheet Live Preview</span>
            <div className="flex items-center gap-2">
              <Button onClick={handleDownload} className="gap-2 text-xs font-semibold shadow-saas">
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </Button>
              <Button onClick={() => setShowPreview(false)} variant="outline" className="gap-2 text-xs font-semibold bg-white">
                <X className="w-4 h-4" />
                <span>Close Preview</span>
              </Button>
            </div>
          </div>

            {/* Printed rate-card replica */}
            <div className="bg-white text-slate-900 rounded-sm p-8 font-sans">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-slate-800">
                <div>
                  <h1 className="text-2xl font-serif italic font-bold tracking-tight">{settings.tradeName}</h1>
                  <p className="text-sm font-serif italic text-slate-700 -mt-0.5">(PAN India Self Service)</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-md">{settings.address}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-[11px] font-semibold text-slate-700">{settings.gstin}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/rudra-logo.png" alt="Rudra Cargo & Transport NX" className="w-16 h-auto" />
                </div>
              </div>

              {activeType === 'ROAD_RAIL' ? (
                <div className="mt-4 border border-slate-800">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-300 text-slate-900">
                        <th className="border border-slate-800 py-2 px-2 font-bold uppercase">Destination</th>
                        <th className="border border-slate-800 py-2 px-2 font-bold uppercase">Rate / Kg</th>
                        <th className="border border-slate-800 py-2 px-2 font-bold uppercase">Mode</th>
                        <th className="border border-slate-800 py-2 px-2 font-bold uppercase">Delivery Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={4} className="border border-slate-800 py-1.5 text-center font-bold bg-slate-100">
                          Minimum Order Quantity - {draftMinQty} Kgs
                        </td>
                      </tr>
                      {draftRates.map((r, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}>
                          <td className="border border-slate-800 py-1.5 px-2 font-semibold">{r.destination}</td>
                          <td className="border border-slate-800 py-1.5 px-2 text-center">{r.ratePerKg}/-</td>
                          <td className="border border-slate-800 py-1.5 px-2 text-center">{r.mode}</td>
                          <td className="border border-slate-800 py-1.5 px-2 text-center">{r.deliveryTime || '-'}</td>
                        </tr>
                      ))}
                      {draftRates.length === 0 && (
                        <tr>
                          <td colSpan={4} className="border border-slate-800 py-6 text-center text-slate-400">No rate lines yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4">
                  <h2 className="text-center font-bold text-sm">Domestic Courier By Air (Console Schedule)</h2>
                  <p className="text-xs font-semibold mt-2 mb-3">Minimum Order Quantity - {draftMinQty} Kgs</p>

                  <div className="flex flex-wrap gap-4">
                    {groupByRegion(draftRates).map(([region, rows]) => (
                      <table key={region} className="text-xs border-collapse border border-slate-800 w-44">
                        <thead>
                          <tr>
                            <th colSpan={2} className="border border-slate-800 py-1.5 px-2 font-bold bg-slate-300">{region}</th>
                          </tr>
                          <tr className="bg-slate-200">
                            <th className="border border-slate-800 py-1 px-2 font-bold text-left">City Name</th>
                            <th className="border border-slate-800 py-1 px-2 font-bold">Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'}>
                              <td className="border border-slate-800 py-1 px-2 font-semibold">{r.destination}</td>
                              <td className="border border-slate-800 py-1 px-2 text-center">{r.ratePerKg}/-</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                    {draftRates.length === 0 && <p className="text-slate-400 text-xs">No rate lines yet.</p>}
                  </div>
                </div>
              )}

              {/* Notes */}
              {draftNotes.length > 0 && (
                <div className="mt-5 text-xs">
                  <p className="font-bold flex items-center gap-1">
                    <span>&#10148;</span> Note:-
                  </p>
                  <ul className="mt-1 space-y-1 pl-5 list-disc">
                    {draftNotes.map((n, i) => (
                      <li key={i} className={activeType === 'ROAD_RAIL' ? 'font-bold' : ''}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="mt-6 pt-3 border-t border-slate-300 text-center text-[11px] text-slate-600 space-y-0.5">
                <p>{settings.address}</p>
                <p>
                  Ph.: {settings.phone1}, {settings.phone2} &nbsp;E - Mail: {settings.email}
                </p>
              </div>
            </div>
          </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4" onClick={closeCreateModal}>
          <Card
            className="w-full max-w-sm p-6 shadow-xl rounded-2xl bg-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                New {activeType === 'AIR' ? 'Air' : 'Road/Rail'} Quotation Sheet
              </h3>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sheet Name</label>
                <Input
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitCreateSheet()}
                  className="text-xs bg-[#F8FAFC]"
                  placeholder={activeType === 'AIR' ? 'Air Rate Sheet' : 'Road & Rail Rate Sheet'}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Origin City</label>
                <CityInput
                  value={createOriginCity}
                  onChange={setCreateOriginCity}
                  extraCities={knownOriginCities}
                  onKeyDown={(e) => e.key === 'Enter' && submitCreateSheet()}
                  className="text-xs bg-[#F8FAFC]"
                  placeholder="Mumbai"
                />
                <p className="text-[10px] text-slate-400 mt-1">Rates on this sheet apply to shipments booked from this city.</p>
              </div>
              {createError && <p className="text-[11px] text-red-600 font-medium">{createError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={closeCreateModal} disabled={creating} className="text-xs font-semibold">
                Cancel
              </Button>
              <Button onClick={submitCreateSheet} disabled={creating} className="gap-2 text-xs font-semibold shadow-saas">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{creating ? 'Creating...' : 'Create Sheet'}</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
