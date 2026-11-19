'use client';

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  Building2,
  QrCode,
  FileText,
  Save,
  CheckCircle,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { Input } from '@/components/ui/input';
import { CompanySettings, DEFAULT_COMPANY_SETTINGS, SavedPaymentQr, getCompanySettings, getActivePaymentQr } from '@/lib/companyConfig';

const UPI_PROVIDERS = [
  { label: 'GPay Axis', handle: '@okaxis' },
  { label: 'GPay HDFC', handle: '@okhdfcbank' },
  { label: 'GPay SBI', handle: '@oksbi' },
  { label: 'GPay ICICI', handle: '@okicici' },
  { label: 'GPay Biz', handle: '@okbizaxis' },
  { label: 'PhonePe', handle: '@ybl' },
  { label: 'Paytm', handle: '@paytm' },
];

export interface CompanySettingsViewHandle {
  isDirty: boolean;
  save: () => void;
  discard: () => void;
}

export interface CompanySettingsViewProps {}

const CompanySettingsView = forwardRef<CompanySettingsViewHandle, CompanySettingsViewProps>(
  function CompanySettingsView(_props, ref) {
    const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
    const [draft, setDraft] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
    const [isEditing, setIsEditing] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);

    useEffect(() => {
      const loaded = getCompanySettings();
      setSettings(loaded);
      setDraft(loaded);
    }, []);

    const handleStartEdit = () => {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setIsEditing(true);
    };

    const handleCancelEdit = () => {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setIsEditing(false);
    };

    const handleSave = () => {
      localStorage.setItem('cargoflow_company_settings', JSON.stringify(draft));
      setSettings(draft);
      setIsEditing(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    };

    const isDirty = isEditing && JSON.stringify(draft) !== JSON.stringify(settings);

    useImperativeHandle(ref, () => ({
      isDirty,
      save: handleSave,
      discard: handleCancelEdit,
    }));

    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;

    useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!isDirtyRef.current) return;
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

  const updateQrEntry = (id: string, patch: Partial<SavedPaymentQr>) => {
    const updatedList = draft.savedQrCodes.map((q) => {
      if (q.id !== id) return q;
      return { ...q, ...patch };
    });
    const next: CompanySettings = { ...draft, savedQrCodes: updatedList };
    if (draft.activeQrCodeId === id) {
      const entry = updatedList.find((q) => q.id === id)!;
      next.gpayNo = entry.gpayNo;
      next.upiId = entry.upiId;
      next.payeeName = entry.payeeName;
      next.qrCodeUrl = entry.qrCodeUrl;
    }
    setDraft(next);
  };

  const setActiveQr = (id: string) => {
    const entry = (isEditing ? draft : settings).savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    const current = isEditing ? draft : settings;
    const next = {
      ...current,
      activeQrCodeId: id,
      gpayNo: entry.gpayNo,
      upiId: entry.upiId,
      payeeName: entry.payeeName || current.tradeName,
      qrCodeUrl: entry.qrCodeUrl,
    };
    if (isEditing) {
      setDraft(next);
    } else {
      localStorage.setItem('cargoflow_company_settings', JSON.stringify(next));
      setSettings(next);
      setDraft(next);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const addQrEntry = async () => {
    const id = `qr_${Date.now()}`;
    const defaultPayee = draft.tradeName || 'RUDRA CARGO AND TRANSPORT NX';
    const entry: SavedPaymentQr = {
      id,
      label: `QR ${draft.savedQrCodes.length + 1}`,
      payeeName: defaultPayee,
      gpayNo: '',
      upiId: '',
      qrCodeUrl: '',
    };
    setDraft({ ...draft, savedQrCodes: [...draft.savedQrCodes, entry] });
  };

  const removeQrEntry = (id: string) => {
    if (draft.savedQrCodes.length <= 1) return;
    const remaining = draft.savedQrCodes.filter((q) => q.id !== id);
    const next: CompanySettings = { ...draft, savedQrCodes: remaining };
    if (draft.activeQrCodeId === id) {
      const fallback = remaining[0];
      next.activeQrCodeId = fallback.id;
      next.gpayNo = fallback.gpayNo;
      next.upiId = fallback.upiId;
      next.payeeName = fallback.payeeName;
      next.qrCodeUrl = fallback.qrCodeUrl;
    }
    setDraft(next);
  };

  /** Max size for an uploaded QR image; settings live in browser storage, which is small. */
  const MAX_QR_BYTES = 1024 * 1024;

  /**
   * Sets or clears a QR image. While editing it goes into the draft like any
   * other field; otherwise it is saved straight away, so uploading a QR never
   * requires entering edit mode first.
   */
  const setQrImage = (id: string, qrCodeUrl: string) => {
    if (isEditing) {
      updateQrEntry(id, { qrCodeUrl });
      return;
    }
    const savedQrCodes = settings.savedQrCodes.map((q) => (q.id === id ? { ...q, qrCodeUrl } : q));
    const next: CompanySettings = { ...settings, savedQrCodes };
    if (settings.activeQrCodeId === id) next.qrCodeUrl = qrCodeUrl;
    try {
      localStorage.setItem('cargoflow_company_settings', JSON.stringify(next));
    } catch {
      notify('Could not save the QR image — browser storage is full. Try a smaller image.');
      return;
    }
    setSettings(next);
    setDraft(next);
    notify(qrCodeUrl ? 'QR code saved. It will print on new bills and LRs.' : 'QR code removed.', 'success');
  };

  const handleQrFile = (id: string, file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      notify('Upload the QR code as a PNG, JPG or WebP image.');
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      notify('That image is over 1 MB. Use a smaller screenshot or crop of the QR code.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') setQrImage(id, event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const [dragOverQrId, setDragOverQrId] = useState<string | null>(null);

  const applyProviderHandle = (id: string, handle: string) => {
    const entry = draft.savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    let base = entry.upiId || entry.gpayNo || '';
    if (base.includes('@')) {
      base = base.split('@')[0];
    }
    const newUpiId = `${base}${handle}`;
    updateQrEntry(id, { upiId: newUpiId });
  };

  const updateTerm = (index: number, val: string) => {
    const updated = [...draft.terms];
    updated[index] = val;
    setDraft({ ...draft, terms: updated });
  };

  const activeState = isEditing ? draft : settings;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Company & Payment Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            {isEditing
              ? 'Edit company details, payment QR codes, or terms below, then click Save.'
              : 'Company details, payment QR codes, and bank account information.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold animate-in fade-in duration-200">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Saved Successfully</span>
            </div>
          )}

          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                className="text-xs font-bold gap-1.5 border-slate-300 hover:bg-slate-100 cursor-pointer h-9 px-3.5 rounded-xl"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                className="text-xs font-bold gap-1.5 bg-[#0A2030] hover:bg-[#071520] text-white cursor-pointer h-9 px-4 rounded-xl shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={handleStartEdit}
              className="text-xs font-bold gap-1.5 bg-[#0A2030] hover:bg-[#071520] text-white cursor-pointer h-9 px-4 rounded-xl shadow-xs"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Information</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
            isEditing ? 'border-slate-300 ring-2 ring-slate-400/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-[#0A2030]" />
            <span>Company Identification</span>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="companysettingsview-trade-display-name" className="text-xs font-semibold text-slate-700">Trade / Display Name</label>
              <Input id="companysettingsview-trade-display-name"
                disabled={!isEditing}
                value={activeState.tradeName}
                onChange={(e) => setDraft({ ...draft, tradeName: e.target.value })}
                className={`mt-1 text-xs font-semibold transition-all ${
                  isEditing
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div>
              <label htmlFor="companysettingsview-legal-entity-name" className="text-xs font-semibold text-slate-700">Legal Entity Name</label>
              <Input id="companysettingsview-legal-entity-name"
                disabled={!isEditing}
                value={activeState.legalName}
                onChange={(e) => setDraft({ ...draft, legalName: e.target.value })}
                className={`mt-1 text-xs font-semibold transition-all ${
                  isEditing
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="companysettingsview-gstin-number" className="text-xs font-semibold text-slate-700">GSTIN Number</label>
                <Input id="companysettingsview-gstin-number"
                  disabled={!isEditing}
                  value={activeState.gstin}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
                  className={`mt-1 text-xs font-mono font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="companysettingsview-official-email" className="text-xs font-semibold text-slate-700">Official Email</label>
                <Input id="companysettingsview-official-email"
                  disabled={!isEditing}
                  value={activeState.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className={`mt-1 text-xs transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="companysettingsview-primary-phone" className="text-xs font-semibold text-slate-700">Primary Phone</label>
                <Input id="companysettingsview-primary-phone"
                  disabled={!isEditing}
                  value={activeState.phone1}
                  onChange={(e) => setDraft({ ...draft, phone1: e.target.value })}
                  className={`mt-1 text-xs font-mono font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="companysettingsview-secondary-phone" className="text-xs font-semibold text-slate-700">Secondary Phone</label>
                <Input id="companysettingsview-secondary-phone"
                  disabled={!isEditing}
                  value={activeState.phone2}
                  onChange={(e) => setDraft({ ...draft, phone2: e.target.value })}
                  className={`mt-1 text-xs font-mono font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="companysettingsview-registered-office-address" className="text-xs font-semibold text-slate-700">Registered Office Address</label>
              <textarea id="companysettingsview-registered-office-address"
                disabled={!isEditing}
                rows={3}
                value={activeState.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                className={`mt-1 w-full text-xs font-medium rounded-md border p-2 leading-relaxed transition-all resize-none ${
                  isEditing
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030] focus:ring-1 focus:ring-[#0A2030] outline-hidden'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div>
              <label htmlFor="companysettingsview-default-origin-city" className="text-xs font-semibold text-slate-700">Default Origin City</label>
              <Input id="companysettingsview-default-origin-city"
                disabled={!isEditing}
                value={activeState.defaultOriginCity}
                onChange={(e) => setDraft({ ...draft, defaultOriginCity: e.target.value })}
                placeholder="e.g. Mumbai"
                className={`mt-1 text-xs font-semibold transition-all ${
                  isEditing
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>
          </div>
        </Card>

        <Card
          className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
            isEditing ? 'border-slate-300 ring-2 ring-slate-400/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
              <QrCode className="w-4 h-4 text-[#0A2030]" />
              <span>Payment QR Codes & UPI Routing</span>
            </div>
            {isEditing && (
              <Button
                type="button"
                size="sm"
                onClick={addQrEntry}
                className="h-7 text-[11px] font-bold gap-1 bg-[#0A2030] hover:bg-[#071520] text-white rounded-lg cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add QR</span>
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {activeState.savedQrCodes.map((qr) => {
              const isActive = activeState.activeQrCodeId === qr.id;
              const hasQrImage = Boolean(qr.qrCodeUrl);
              return (
                <div
                  key={qr.id}
                  className={`p-3.5 rounded-xl border space-y-3.5 transition-all ${
                    isActive ? 'bg-slate-50/90 border-slate-300 ring-1 ring-slate-300/80 shadow-xs' : 'bg-slate-50/40 border-slate-200'
                  }`}
                >
                  {/* Header: label, status and card actions */}
                  <div className="flex items-center gap-2">
                    <Input
                      disabled={!isEditing}
                      value={qr.label}
                      onChange={(e) => updateQrEntry(qr.id, { label: e.target.value })}
                      placeholder="Label (e.g. Primary GPay / Branch QR)"
                      aria-label="QR label"
                      className={`h-8 text-sm font-bold transition-all disabled:opacity-100 ${
                        isEditing ? 'bg-white border-slate-300 text-slate-900' : 'bg-transparent border-transparent text-slate-900 cursor-default px-0'
                      }`}
                    />
                    {isActive ? (
                      <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Active
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveQr(qr.id)}
                        className="h-7 shrink-0 text-[11px] font-bold rounded-lg"
                      >
                        Set Active
                      </Button>
                    )}
                    {isEditing && draft.savedQrCodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQrEntry(qr.id)}
                        aria-label={`Delete ${qr.label}`}
                        title="Delete this QR"
                        className="shrink-0 w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* QR image — the main action of this card */}
                  {hasQrImage ? (
                    <div className="flex items-center gap-4 p-3 bg-white border border-slate-200 rounded-xl">
                      <div className="w-28 h-28 shrink-0 rounded-lg border border-slate-100 p-1.5 flex items-center justify-center">
                        <img src={qr.qrCodeUrl} alt={`${qr.label} QR code`} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 space-y-2.5">
                        <p className="text-xs text-slate-600 leading-snug">
                          {isActive
                            ? 'Printed on new bills and LRs.'
                            : 'Set this QR active to print it on bills and LRs.'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer focus-within:ring-2 focus-within:ring-[#0A2030]/30">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) => {
                                handleQrFile(qr.id, e.target.files?.[0]);
                                e.target.value = '';
                              }}
                              className="sr-only"
                            />
                            <Upload className="w-3.5 h-3.5" />
                            Replace
                          </label>
                          <button
                            type="button"
                            onClick={() => setQrImage(qr.id, '')}
                            className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverQrId(qr.id);
                      }}
                      onDragLeave={() => setDragOverQrId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverQrId(null);
                        handleQrFile(qr.id, e.dataTransfer.files?.[0]);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-6 text-center rounded-xl border-2 border-dashed cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#0A2030]/30 ${
                        dragOverQrId === qr.id
                          ? 'border-[#0A2030] bg-[#0A2030]/5'
                          : 'border-slate-300 bg-white hover:border-[#0A2030]/60 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          handleQrFile(qr.id, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                      <span className="w-11 h-11 rounded-full bg-[#0A2030] text-white flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </span>
                      <span className="text-sm font-bold text-slate-900">Upload your payment QR code</span>
                      <span className="text-xs text-slate-500 leading-snug max-w-xs">
                        Click to choose, or drop the QR image from your bank or UPI app here. PNG, JPG or WebP, up to 1 MB.
                      </span>
                      <span className="mt-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                        Bills and LRs print without a QR until you upload one
                      </span>
                    </label>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700">
                        Account / Payee Name <span className="text-slate-500 font-normal">(printed on bills)</span>
                      </label>
                      <Input
                        disabled={!isEditing}
                        value={qr.payeeName ?? ''}
                        onChange={(e) => updateQrEntry(qr.id, { payeeName: e.target.value })}
                        placeholder="e.g. Rudra Cargo / Mahesh Patel"
                        className={`mt-1 h-7 text-xs font-semibold transition-all ${
                          isEditing
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                            : 'bg-white/80 border-slate-200 text-slate-800 cursor-default'
                        }`}
                      />
                    </div>

                    <div>
                      <label htmlFor="companysettingsview-google-pay-mobile-no" className="text-[11px] font-bold text-slate-700">Google Pay Mobile No.</label>
                      <Input id="companysettingsview-google-pay-mobile-no"
                        disabled={!isEditing}
                        value={qr.gpayNo}
                        onChange={(e) => updateQrEntry(qr.id, { gpayNo: e.target.value })}
                        placeholder="e.g. 9821541984"
                        className={`mt-1 h-7 text-xs font-mono font-bold transition-all ${
                          isEditing
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                            : 'bg-white/80 border-slate-200 text-slate-800 cursor-default'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700">
                      UPI VPA Address <span className="text-slate-400 font-normal">(e.g. 9821541984@okbizaxis, name@okhdfcbank)</span>
                    </label>
                    <Input
                      disabled={!isEditing}
                      value={qr.upiId}
                      onChange={(e) => updateQrEntry(qr.id, { upiId: e.target.value })}
                      placeholder="9821541984@okbizaxis"
                      className={`mt-1 h-7 text-xs font-mono font-bold transition-all ${
                        isEditing
                          ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                          : 'bg-white/80 border-slate-200 text-slate-800 cursor-default'
                      }`}
                    />

                    {isEditing && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[11px] font-bold text-slate-400 mr-0.5">Quick Handles:</span>
                        {UPI_PROVIDERS.map((p) => (
                          <button
                            key={p.handle}
                            type="button"
                            onClick={() => applyProviderHandle(qr.id, p.handle)}
                            className="text-[11px] font-mono font-semibold px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded text-slate-700 cursor-pointer transition-all"
                            title={`Append ${p.handle} (${p.label})`}
                          >
                            {p.handle}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="companysettingsview-bank-name" className="text-xs font-semibold text-slate-700">Bank Name</label>
                <Input id="companysettingsview-bank-name"
                  disabled={!isEditing}
                  value={activeState.bankName}
                  onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                  className={`mt-1 text-xs font-semibold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="companysettingsview-branch" className="text-xs font-semibold text-slate-700">Branch</label>
                <Input id="companysettingsview-branch"
                  disabled={!isEditing}
                  value={activeState.branch}
                  onChange={(e) => setDraft({ ...draft, branch: e.target.value })}
                  className={`mt-1 text-xs font-semibold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="companysettingsview-account-number" className="text-xs font-semibold text-slate-700">Account Number</label>
                <Input id="companysettingsview-account-number"
                  disabled={!isEditing}
                  value={activeState.accountNo}
                  onChange={(e) => setDraft({ ...draft, accountNo: e.target.value })}
                  className={`mt-1 text-xs font-mono font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label htmlFor="companysettingsview-ifsc-code" className="text-xs font-semibold text-slate-700">IFSC Code</label>
                <Input id="companysettingsview-ifsc-code"
                  disabled={!isEditing}
                  value={activeState.ifsc}
                  onChange={(e) => setDraft({ ...draft, ifsc: e.target.value })}
                  className={`mt-1 text-xs font-mono uppercase font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Booking Staff Authorized Signature Card */}
      <Card
        className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
          isEditing ? 'border-slate-300 ring-2 ring-slate-400/10' : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <Edit3 className="w-4 h-4 text-[#0A2030]" />
            <span>Booking Staff Official Signature</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Appears on generated LRs when staff signature toggle is ON
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current Saved Signature */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Current Saved Signature</label>
            <div className="h-36 border border-slate-200 rounded-xl bg-slate-50/80 flex items-center justify-center p-3 relative overflow-hidden">
              {draft.staffSignatureUrl ? (
                <img
                  src={draft.staffSignatureUrl}
                  alt="Booking Staff Signature"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-center text-xs text-slate-400 font-medium">
                  No signature saved yet.<br />Draw or upload a signature below.
                </div>
              )}
            </div>
            {isEditing && draft.staffSignatureUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft({ ...draft, staffSignatureUrl: '' })}
                className="text-xs text-red-600 border-red-200 hover:bg-red-50"
              >
                Remove Signature
              </Button>
            )}
          </div>

          {/* Interactive Signature Studio */}
          {isEditing ? (
            <SignaturePad
              onSaveSignature={(dataUrl) => {
                setDraft({ ...draft, staffSignatureUrl: dataUrl });
              }}
            />
          ) : (
            <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400">
              Click &ldquo;Edit Information&rdquo; at the top to draw or upload a signature.
            </div>
          )}
        </div>
      </Card>

      {/* Invoice Terms & Conditions Card */}
      <Card
        className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
          isEditing ? 'border-slate-300 ring-2 ring-slate-400/10' : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <FileText className="w-4 h-4 text-[#0A2030]" />
            <span>Default Invoice Terms & Conditions</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {activeState.terms.map((term, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 font-bold w-4">{idx + 1}.</span>
              <Input
                disabled={!isEditing}
                value={term}
                onChange={(e) => updateTerm(idx, e.target.value)}
                className={`text-xs flex-1 font-medium transition-all ${
                  isEditing
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-[#0A2030]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
});

export default CompanySettingsView;

function SignaturePad({ onSaveSignature }: { onSaveSignature: (dataUrl: string) => void }) {
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }, [activeTab]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0A2030';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawn(false);
  };

  const handleSaveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onSaveSignature(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('draw')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'draw' ? 'bg-[#0A2030] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Draw Signature
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'upload' ? 'bg-[#0A2030] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Upload Image File
        </button>
      </div>

      {activeTab === 'draw' ? (
        <div className="space-y-2">
          <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white relative overflow-hidden">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-28 touch-none cursor-crosshair"
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 font-medium">
                Draw signature here with mouse or touchpad
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={clearCanvas} className="text-xs">
              Clear Canvas
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!hasDrawn}
              onClick={handleSaveCanvas}
              className="bg-[#0A2030] hover:bg-[#071520] text-white text-xs font-semibold"
            >
              Use Drawn Signature
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 text-center space-y-2">
            <p className="text-xs text-slate-600 font-medium">
              Upload scanned signature or official stamp (PNG / JPG)
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0A2030] file:text-white hover:file:bg-[#071520] cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
