'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Loader2,
  Edit2,
  ArrowRight,
  ArrowLeft,
  Check,
  Search,
  Building2,
  Layers,
  FileText,
} from 'lucide-react';
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
    'By Train - An additional charge of Rs. 2 per kg will be applied to all return parcels',
    'All return parcels subject to verification',
  ],
  AIR: ['35% SERVICE CHARGES', 'GST 18%'],
};

export default function QuotationView() {
  const settings = getCompanySettings();
  const [activeType, setActiveType] = useState<SheetType>('ROAD_RAIL');
  const [activeCity, setActiveCity] = useState<string>(settings.defaultOriginCity || 'Mumbai');
  const [sheets, setSheets] = useState<QuotationSheetDTO[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // Mode state: 'view' = read-only default sheet, 'wizard' = stepwise create/edit
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Editable draft states for the stepwise wizard
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<SheetType>('ROAD_RAIL');
  const [draftOriginCity, setDraftOriginCity] = useState('');
  const [draftMinQty, setDraftMinQty] = useState(200);
  const [draftIsDefault, setDraftIsDefault] = useState(false);
  const [draftRates, setDraftRates] = useState<QuotationRateItem[]>([]);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);

  // Add line inputs inside step 2
  const [newRegion, setNewRegion] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newMode, setNewMode] = useState<QuotationRateItem['mode']>('BY ROAD');
  const [newTime, setNewTime] = useState('24 HRS');

  // Autocomplete lists
  const knownOriginCities = useMemo(() => sheets.map((s) => s.origin_city).filter(Boolean), [sheets]);
  const knownDestCities = useMemo(
    () => sheets.flatMap((s) => s.rates.map((r) => r.destination)).filter(Boolean),
    [sheets]
  );

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
    setNewMode(activeType === 'AIR' ? 'BY AIR' : 'BY ROAD');
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

  // Open Stepwise Wizard for Editing
  const startEditSheet = () => {
    if (!activeSheet) return;
    setWizardMode('edit');
    setDraftName(activeSheet.name);
    setDraftType(activeSheet.sheet_type);
    setDraftOriginCity(activeSheet.origin_city);
    setDraftMinQty(activeSheet.min_qty_kg);
    setDraftIsDefault(activeSheet.is_default);
    setDraftRates([...activeSheet.rates]);
    setDraftNotes([...activeSheet.notes]);
    setWizardStep(1);
    setWizardError(null);
    setIsWizardOpen(true);
  };

  // Open Stepwise Wizard for Creating New Sheet
  const startNewSheet = () => {
    setWizardMode('create');
    setDraftName(activeType === 'AIR' ? 'Air Rate Sheet' : 'Road & Rail Rate Sheet');
    setDraftType(activeType);
    setDraftOriginCity(activeCity || settings.defaultOriginCity || 'Mumbai');
    setDraftMinQty(200);
    setDraftIsDefault(false);
    setDraftRates(activeType === 'AIR' ? [...SEED_AIR] : [...SEED_ROAD_RAIL]);
    setDraftNotes([...SEED_NOTES[activeType]]);
    setWizardStep(1);
    setWizardError(null);
    setIsWizardOpen(true);
  };

  const closeWizard = () => {
    if (saving) return;
    setIsWizardOpen(false);
    setWizardError(null);
  };

  // Step 2 Rate Management
  const handleAddRate = () => {
    const dest = newCity.trim().toUpperCase();
    const rate = Number(newRate);
    if (!dest) {
      setWizardError('Enter a destination city.');
      return;
    }
    if (!rate || rate <= 0) {
      setWizardError('Enter a valid rate per kg (greater than 0).');
      return;
    }

    setDraftRates((prev) => [
      ...prev,
      {
        region: draftType === 'AIR' ? newRegion.trim() || 'General' : undefined,
        destination: dest,
        ratePerKg: rate,
        mode: draftType === 'AIR' ? 'BY AIR' : newMode,
        deliveryTime: draftType === 'ROAD_RAIL' ? newTime.trim() || '24 HRS' : undefined,
      },
    ]);
    setNewCity('');
    setNewRate('');
    setWizardError(null);
  };

  const handleRemoveRate = (idx: number) => {
    setDraftRates((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRateField = (idx: number, field: keyof QuotationRateItem, value: string | number) => {
    setDraftRates((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // Step 3 Notes Management
  const handleAddNote = () => {
    setDraftNotes((prev) => [...prev, 'New term or condition note']);
  };

  const updateNote = (idx: number, text: string) => {
    setDraftNotes((prev) => {
      const next = [...prev];
      next[idx] = text;
      return next;
    });
  };

  const removeNote = (idx: number) => {
    setDraftNotes((prev) => prev.filter((_, i) => i !== idx));
  };

  // Wizard Step Validation
  const validateAndNext = () => {
    setWizardError(null);
    if (wizardStep === 1) {
      if (!draftName.trim()) {
        setWizardError('Please enter a sheet name.');
        return;
      }
      if (!draftOriginCity.trim()) {
        setWizardError('Please specify the origin booking hub.');
        return;
      }
      if (draftMinQty <= 0) {
        setWizardError('Minimum order quantity must be greater than 0 kg.');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (draftRates.length === 0) {
        setWizardError('Please add at least one destination rate line before continuing.');
        return;
      }
      setWizardStep(3);
    }
  };

  // Save changes / create sheet
  const handleSaveWizard = async () => {
    setSaving(true);
    setWizardError(null);

    const payload = {
      name: draftName.trim(),
      sheet_type: draftType,
      origin_city: draftOriginCity.trim(),
      min_qty_kg: draftMinQty,
      is_default: draftIsDefault,
      rates: draftRates,
      notes: draftNotes.filter((n) => n.trim().length > 0),
    };

    try {
      if (wizardMode === 'edit' && activeSheet) {
        const res = await fetch(`/api/quotations/${activeSheet.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update rate sheet');
        }
        const updated: QuotationSheetDTO = await res.json();
        setSheets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const res = await fetch('/api/quotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create rate sheet');
        }
        const created: QuotationSheetDTO = await res.json();
        setSheets((prev) => [created, ...prev]);
        setActiveSheetId(created.id);
        setActiveType(created.sheet_type);
        setActiveCity(created.origin_city);
      }

      setIsWizardOpen(false);
    } catch (e: any) {
      setWizardError(e.message || 'Failed to save quotation sheet');
    } finally {
      setSaving(false);
    }
  };

  // Quick Action: Set Default Rate Sheet (cannot uncheck active default)
  const handleToggleDefault = async (nextVal: boolean) => {
    if (!activeSheet || !nextVal || activeSheet.is_default) return;
    try {
      const res = await fetch(`/api/quotations/${activeSheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error('Failed to update default rate sheet');
      const updated: QuotationSheetDTO = await res.json();
      setSheets((prev) =>
        prev.map((s) => {
          if (s.sheet_type === updated.sheet_type) {
            return s.id === updated.id ? { ...s, is_default: true } : { ...s, is_default: false };
          }
          return s;
        })
      );
    } catch (e: any) {
      alert(e.message || 'Failed to update default');
    }
  };

  // Quick Action: Delete Sheet
  const handleDeleteSheet = async () => {
    if (!activeSheet) return;
    if (!window.confirm(`Delete quotation sheet "${activeSheet.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/quotations/${activeSheet.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete quotation sheet');
      setSheets((prev) => prev.filter((s) => s.id !== activeSheet.id));
      const remaining = sheets.filter((s) => s.id !== activeSheet.id && s.sheet_type === activeType);
      if (remaining.length > 0) {
        setActiveSheetId(remaining[0].id);
      } else {
        setActiveSheetId('');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete sheet');
    }
  };

  // Download Active Sheet as PDF
  const handleDownload = () => {
    if (!activeSheet) return;
    generateQuotationPDF({
      name: activeSheet.name,
      sheet_type: activeSheet.sheet_type,
      min_qty_kg: activeSheet.min_qty_kg,
      rates: activeSheet.rates,
      notes: activeSheet.notes,
    });
  };

  // Filtered rates for read-only view search
  const displayedRates = useMemo(() => {
    if (!activeSheet) return [];
    if (!searchFilter.trim()) return activeSheet.rates;
    const q = searchFilter.toLowerCase();
    return activeSheet.rates.filter(
      (r) =>
        r.destination.toLowerCase().includes(q) ||
        (r.region && r.region.toLowerCase().includes(q)) ||
        (r.mode && r.mode.toLowerCase().includes(q))
    );
  }, [activeSheet, searchFilter]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Stepwise Wizard Mode (LR Style)
  // ══════════════════════════════════════════════════════════════════════════
  if (isWizardOpen) {
    const STEP_NAMES = ['Sheet Details', 'Rates & Routes', 'Terms & Review'] as const;

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-150">
        {/* Step Navigation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {wizardMode === 'edit' ? 'Edit Rate Sheet' : 'New Rate Sheet'}
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight font-heading mt-0.5">
              Step {wizardStep} of 3: {STEP_NAMES[wizardStep - 1]}
            </h1>
          </div>

          <Button
            variant="outline"
            onClick={closeWizard}
            disabled={saving}
            className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer w-fit"
          >
            Cancel & Exit
          </Button>
        </div>

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs font-semibold">
          {STEP_NAMES.map((name, idx) => {
            const stepNum = (idx + 1) as 1 | 2 | 3;
            const isActive = wizardStep === stepNum;
            const isDone = wizardStep > stepNum;
            return (
              <div
                key={name}
                className={`py-2 px-3 rounded-lg text-center transition-colors flex items-center justify-center gap-1.5 ${
                  isActive
                    ? 'bg-[#0A2030] text-white shadow-xs'
                    : isDone
                    ? 'text-slate-800 bg-white/70 font-medium'
                    : 'text-slate-400'
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">
                    {stepNum}
                  </span>
                )}
                <span className="truncate">{name}</span>
              </div>
            );
          })}
        </div>

        {/* Error Alert */}
        {wizardError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
            <span>{wizardError}</span>
          </div>
        )}

        {/* ── STEP 1: Sheet Details & Hub ── */}
        {wizardStep === 1 && (
          <Card className="p-6 bg-white border border-slate-200/80 shadow-saas rounded-2xl space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-heading">Sheet Details & Origin Hub</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure the rate card name, transport mode, booking hub, and minimum quantity.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Sheet Name *</label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Mumbai - Western Region Rail & Road"
                  className="h-10 text-xs bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Transport Mode Type *</label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as SheetType)}
                  className="w-full text-xs h-10 px-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 font-semibold focus:bg-white focus:border-[#0A2030] focus:outline-none"
                >
                  <option value="ROAD_RAIL">Road & Rail Sheet</option>
                  <option value="AIR">Domestic Air Sheet</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Origin City Hub *</label>
                <CityInput
                  value={draftOriginCity}
                  onChange={setDraftOriginCity}
                  extraCities={knownOriginCities}
                  placeholder="Mumbai"
                  className="h-10 text-xs bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030] font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Minimum Order Quantity (MOQ Kgs) *</label>
                <Input
                  type="number"
                  min={1}
                  value={draftMinQty}
                  onChange={(e) => setDraftMinQty(Number(e.target.value))}
                  className="h-10 text-xs font-mono bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#0A2030]"
                />
              </div>

              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 select-none">
                  <input
                    type="checkbox"
                    checked={draftIsDefault}
                    onChange={(e) => setDraftIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0A2030] focus:ring-[#0A2030] border-slate-300"
                  />
                  <span>Mark as Default rate card for this mode & hub</span>
                </label>
              </div>
            </div>
          </Card>
        )}

        {/* ── STEP 2: Rates & Destinations ── */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            {/* Quick Add Destination Row */}
            <Card className="p-5 bg-white border border-slate-200/80 shadow-saas rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-heading">Add Destination Rate Line</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Specify destination, price per kg, mode and turnaround.</p>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {draftRates.length} destination{draftRates.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end pt-1">
                {draftType === 'AIR' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Region</label>
                    <Input
                      placeholder="South"
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Destination City *</label>
                  <CityInput
                    placeholder="PUNE"
                    value={newCity}
                    onChange={setNewCity}
                    extraCities={knownDestCities}
                    className="text-xs h-9 uppercase bg-slate-50/50 border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Rate / KG (₹) *</label>
                  <Input
                    placeholder="16"
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="text-xs h-9 font-mono bg-slate-50/50 border-slate-200 rounded-xl"
                  />
                </div>
                {draftType === 'ROAD_RAIL' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Mode</label>
                    <select
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as QuotationRateItem['mode'])}
                      className="w-full text-xs h-9 px-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900"
                    >
                      <option value="BY ROAD">BY ROAD</option>
                      <option value="BY RAIL">BY RAIL</option>
                    </select>
                  </div>
                )}
                {draftType === 'ROAD_RAIL' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Delivery Time</label>
                    <Input
                      placeholder="24 HRS"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="text-xs h-9 bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                )}
                <Button
                  onClick={handleAddRate}
                  className="h-9 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </Button>
              </div>
            </Card>

            {/* Editable Rate Table */}
            <Card className="p-0 border border-slate-200/80 shadow-saas rounded-2xl bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    {draftType === 'AIR' && <th className="p-3">Region</th>}
                    <th className="p-3">Destination</th>
                    <th className="p-3">Rate / Kg (₹)</th>
                    {draftType === 'ROAD_RAIL' && <th className="p-3">Mode</th>}
                    {draftType === 'ROAD_RAIL' && <th className="p-3">Delivery Time</th>}
                    <th className="p-3 w-12 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftRates.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      {draftType === 'AIR' && (
                        <td className="p-2">
                          <Input
                            value={r.region || ''}
                            onChange={(e) => updateRateField(idx, 'region', e.target.value)}
                            className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                          />
                        </td>
                      )}
                      <td className="p-2">
                        <Input
                          value={r.destination}
                          onChange={(e) => updateRateField(idx, 'destination', e.target.value.toUpperCase())}
                          className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030] font-semibold text-slate-900"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={r.ratePerKg}
                          onChange={(e) => updateRateField(idx, 'ratePerKg', Number(e.target.value))}
                          className="text-xs h-8 font-mono bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030] text-slate-900 font-semibold"
                        />
                      </td>
                      {draftType === 'ROAD_RAIL' && (
                        <td className="p-2">
                          <select
                            value={r.mode}
                            onChange={(e) => updateRateField(idx, 'mode', e.target.value)}
                            className="w-full text-xs h-8 px-2 border border-slate-200 rounded-lg bg-slate-50/50 text-slate-900 focus:bg-white focus:border-[#0A2030] focus:outline-none"
                          >
                            <option value="BY ROAD">BY ROAD</option>
                            <option value="BY RAIL">BY RAIL</option>
                          </select>
                        </td>
                      )}
                      {draftType === 'ROAD_RAIL' && (
                        <td className="p-2">
                          <Input
                            value={r.deliveryTime || ''}
                            onChange={(e) => updateRateField(idx, 'deliveryTime', e.target.value)}
                            className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                          />
                        </td>
                      )}
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleRemoveRate(idx)}
                          className="w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center transition-colors cursor-pointer mx-auto"
                          title="Remove rate row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draftRates.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                        No rate lines added yet. Add destinations using the bar above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ── STEP 3: Terms, Notes & Final Review ── */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            {/* Footer Notes Card */}
            <Card className="p-5 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-heading">Footer Notes & Terms</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Printed at the bottom of the quotation rate card.</p>
                </div>
                <Button
                  onClick={handleAddNote}
                  variant="outline"
                  className="h-8 px-3 gap-1.5 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Term</span>
                </Button>
              </div>

              <div className="space-y-2 pt-1">
                {draftNotes.map((note, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={note}
                      onChange={(e) => updateNote(idx, e.target.value)}
                      className="text-xs h-8 bg-slate-50/50 border-slate-200 rounded-lg focus:bg-white focus:border-[#0A2030]"
                    />
                    <button
                      onClick={() => removeNote(idx)}
                      className="w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {draftNotes.length === 0 && (
                  <div className="text-xs text-slate-400 py-2">No footer terms defined.</div>
                )}
              </div>
            </Card>

            {/* Summary Review Card */}
            <Card className="p-5 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-4">
              <h3 className="text-sm font-bold text-slate-900 font-heading">Rate Card Summary Review</h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50/80 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Sheet Name</span>
                  <span className="font-semibold text-slate-900">{draftName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Origin Hub</span>
                  <span className="font-semibold text-slate-900">{draftOriginCity}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Transport Type</span>
                  <span className="font-semibold text-slate-900">{draftType === 'AIR' ? 'Domestic Air' : 'Road & Rail'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Covered Routes</span>
                  <span className="font-semibold text-slate-900">{draftRates.length} destinations</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              setWizardError(null);
              setWizardStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2) : 1));
            }}
            disabled={wizardStep === 1 || saving}
            className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          {wizardStep < 3 ? (
            <button
              onClick={validateAndNext}
              className="flex items-center gap-1.5 px-5 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-xs font-bold transition-colors shadow-saas cursor-pointer"
            >
              <span>Next Step</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSaveWizard}
              disabled={saving}
              className="flex items-center gap-1.5 px-6 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-xs font-bold transition-colors shadow-saas cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving Sheet...' : wizardMode === 'edit' ? 'Update Rate Sheet' : 'Create Rate Sheet'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER: Read-Only Default Rate Sheet View
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-heading">Quotation Rate Sheets</h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            View, manage, and download rate cards. The sheet marked Default auto-prices consignments and bills by destination + mode.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleDownload}
            disabled={!activeSheet}
            variant="outline"
            className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </Button>

          <Button
            onClick={startEditSheet}
            disabled={!activeSheet}
            variant="outline"
            className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Sheet</span>
          </Button>

          <Button
            onClick={startNewSheet}
            className="h-9 px-4 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Sheet</span>
          </Button>
        </div>
      </div>

      {/* Mode & Origin Hub Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
          <button
            onClick={() => {
              setActiveType('ROAD_RAIL');
              setSearchFilter('');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-saas cursor-pointer ${
              activeType === 'ROAD_RAIL'
                ? 'bg-[#0A2030] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Road & Rail Rate Sheet
          </button>
          <button
            onClick={() => {
              setActiveType('AIR');
              setSearchFilter('');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-saas cursor-pointer ${
              activeType === 'AIR'
                ? 'bg-[#0A2030] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Domestic Air Rate Sheet
          </button>
        </div>

        {/* Origin City Pills */}
        {citiesForType.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Origin Hub:</span>
            {citiesForType.map((city) => (
              <button
                key={city}
                onClick={() => {
                  setActiveCity(city);
                  setSearchFilter('');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-saas cursor-pointer ${
                  activeCity.toLowerCase() === city.toLowerCase()
                    ? 'bg-[#0A2030] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" /> Loading quotation sheets...
        </div>
      ) : !activeSheet ? (
        /* Empty State */
        <Card className="p-12 text-center border border-dashed border-slate-300 rounded-2xl bg-white space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            No {activeType === 'AIR' ? 'Air' : 'Road/Rail'} quotation sheet yet for {activeCity}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create your first rate card for {activeCity} to enable automatic freight calculation in LR consignments and billing.
          </p>
          <Button
            onClick={startNewSheet}
            className="mt-2 h-9 px-4 text-xs font-bold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Rate Sheet</span>
          </Button>
        </Card>
      ) : (
        /* Read-Only Rate Sheet Presentation */
        <div className="space-y-4">
          {/* Sheet Selector & Meta Toolbar */}
          <Card className="p-5 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <FileSpreadsheet className="w-4 h-4 text-[#0A2030] shrink-0" />
                <select
                  value={activeSheetId}
                  onChange={(e) => {
                    setActiveSheetId(e.target.value);
                    setSearchFilter('');
                  }}
                  className="text-xs font-bold h-9 px-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 focus:bg-white focus:border-[#0A2030] focus:outline-none min-w-[220px]"
                >
                  {sheetsOfType.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>

                <label
                  className={`inline-flex items-center gap-2 text-xs font-semibold select-none border rounded-xl px-3 h-9 transition-colors ${
                    activeSheet.is_default
                      ? 'text-[#0A2030] bg-[#0A2030]/5 border-[#0A2030]/15 cursor-default'
                      : 'text-slate-700 bg-slate-50/60 hover:bg-slate-100/80 border-slate-200 cursor-pointer'
                  }`}
                  title={
                    activeSheet.is_default
                      ? 'Current default rate card. Select another sheet to set it as default.'
                      : 'Mark this rate card as default'
                  }
                >
                  <input
                    type="checkbox"
                    checked={Boolean(activeSheet.is_default)}
                    disabled={Boolean(activeSheet.is_default)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleToggleDefault(true);
                      }
                    }}
                    className={`w-4 h-4 rounded text-[#0A2030] focus:ring-[#0A2030] border-slate-300 accent-[#0A2030] ${
                      activeSheet.is_default ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  />
                  <span>Default Rate Card</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDeleteSheet}
                  variant="outline"
                  className="h-9 px-3 text-xs font-semibold rounded-xl border border-red-200 bg-red-50/40 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300 cursor-pointer gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="text-red-600 font-semibold">Delete Sheet</span>
                </Button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Origin Booking Hub</span>
                <p className="font-semibold text-slate-900 text-sm flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {activeSheet.origin_city}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Minimum Quantity</span>
                <p className="font-semibold text-slate-900 text-sm font-mono">{activeSheet.min_qty_kg} Kgs</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Destinations</span>
                <p className="font-semibold text-slate-900 text-sm flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  {activeSheet.rates.length} active routes
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Created By</span>
                <p className="text-slate-600 text-xs">
                  <strong className="text-slate-800 font-semibold">{activeSheet.created_by_name || 'Staff'}</strong>
                  {activeSheet.updated_at && ` · ${formatCreatedAt(activeSheet.updated_at)}`}
                </p>
              </div>
            </div>
          </Card>

          {/* Rate Lines Table Card */}
          <Card className="p-0 border border-slate-200/80 shadow-saas rounded-2xl bg-white overflow-hidden space-y-0">
            {/* Table Header Filter */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 font-heading">Destination Pricing</h3>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {displayedRates.length} routes
                </span>
              </div>

              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter destinations..."
                  className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0A2030]"
                />
              </div>
            </div>

            {/* Read-Only Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    {activeSheet.sheet_type === 'AIR' && <th className="p-3">Region</th>}
                    <th className="p-3">Destination City</th>
                    <th className="p-3">Rate / Kg</th>
                    <th className="p-3">Transport Mode</th>
                    {activeSheet.sheet_type === 'ROAD_RAIL' && <th className="p-3">Est. Delivery</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRates.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      {activeSheet.sheet_type === 'AIR' && (
                        <td className="p-3 font-medium text-slate-500">{r.region || 'General'}</td>
                      )}
                      <td className="p-3 font-bold text-slate-900">{r.destination}</td>
                      <td className="p-3 font-mono font-bold text-[#0A2030] text-sm">
                        ₹{r.ratePerKg.toLocaleString('en-IN')}/-
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                          {r.mode}
                        </span>
                      </td>
                      {activeSheet.sheet_type === 'ROAD_RAIL' && (
                        <td className="p-3 text-slate-600 font-medium">{r.deliveryTime || '—'}</td>
                      )}
                    </tr>
                  ))}
                  {displayedRates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                        {searchFilter ? `No destinations matching "${searchFilter}"` : 'No rate lines found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Footer Terms & Notes */}
          {activeSheet.notes && activeSheet.notes.length > 0 && (
            <Card className="p-5 border border-slate-200/80 shadow-saas rounded-2xl bg-white space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Terms & Conditions
              </h4>
              <ul className="space-y-1 text-xs text-slate-600 list-disc pl-5 pt-1">
                {activeSheet.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
