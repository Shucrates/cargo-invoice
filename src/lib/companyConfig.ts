export interface SavedPaymentQr {
  id: string;
  label: string;
  /** Account holder or business name that appears in UPI apps (e.g. Google Pay, PhonePe) */
  payeeName?: string;
  gpayNo: string;
  upiId: string;
  qrCodeUrl: string;
}

export interface CompanySettings {
  tradeName: string;
  legalName: string;
  gstin: string;
  address: string;
  phone1: string;
  phone2: string;
  email: string;
  bankName: string;
  branch: string;
  accountNo: string;
  ifsc: string;
  gpayNo: string;
  upiId: string;
  /** Default payee / account holder name for UPI payments */
  payeeName?: string;
  qrCodeUrl: string;
  /** All QR codes the user has saved. The one matching activeQrCodeId is the
   *  one embedded in generated invoices (mirrored into gpayNo/upiId/qrCodeUrl). */
  savedQrCodes: SavedPaymentQr[];
  activeQrCodeId: string;
  terms: string[];
  /** Default origin city used to prefill new LRs and to pick which
   *  quotation sheet (by origin city) prices them automatically. */
  defaultOriginCity: string;
  /** Saved signature image (Data URL / PNG) of booking staff / authorized signatory */
  staffSignatureUrl?: string;
}

const DEFAULT_QR_ID = 'default';

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  tradeName: 'RUDRA CARGO AND TRANSPORT NX',
  legalName: 'RUDRA CARGO AND TRANSPORT NX',
  gstin: '27BHPG1318L1ZJ',
  address: '7/128, Anaji Master Chawl, K G Marg, Dadar, Prabhadevi, Mumbai - 400025',
  phone1: '+91 9821541984',
  phone2: '+91 9321073435',
  email: 'rudracargoandtransportnx@gmail.com',
  bankName: 'Saraswat Bank',
  branch: 'Prabhadevi',
  accountNo: '610000000053400',
  ifsc: 'SRCB0000022',
  gpayNo: '9821541984',
  upiId: '9821541984@okbizaxis',
  payeeName: 'RUDRA CARGO AND TRANSPORT NX',
  qrCodeUrl: '',
  savedQrCodes: [
    {
      id: DEFAULT_QR_ID,
      label: 'Primary GPay',
      payeeName: 'RUDRA CARGO AND TRANSPORT NX',
      gpayNo: '9821541984',
      upiId: '9821541984@okbizaxis',
      qrCodeUrl: '',
    },
  ],
  activeQrCodeId: DEFAULT_QR_ID,
  terms: [
    'Difference, if any, may be notified within 3 days of receipt.',
    'Interest @24% p.a. will be charged if bill is not paid within 15 days.',
    'Whether tax is payable on reversed charge basis: No',
    'Google pay Number: 9821541984',
  ],
  defaultOriginCity: 'Mumbai',
  staffSignatureUrl: '',
};

export const companyConfig = {
  name: 'RUDRA CARGO AND TRANSPORT NX',
  tagline: 'NON-NEGOTIABLE CARGO DOCKET / GST TAX INVOICE',
  address: '7/128, Anaji Master Chawl, K G Marg, Dadar, Prabhadevi, Mumbai - 400025',
  phone: '+91 9821541984, +91 9321073435',
  gstin: '27BHPG1318L1ZJ',
  email: 'rudracargoandtransportnx@gmail.com',
  jurisdiction: 'All Matter are Subject To Mumbai Jurisdiction Only',
};

/** Constructs an NPCI standard UPI Payment URI */
export function buildUpiUri(upiId: string, payeeName?: string, tradeName?: string, note?: string): string {
  const cleanId = (upiId || '').trim();
  if (!cleanId) return '';
  const cleanName = (payeeName || tradeName || 'RUDRA CARGO AND TRANSPORT NX').trim();
  let uri = `upi://pay?pa=${cleanId}&pn=${encodeURIComponent(cleanName)}&cu=INR`;
  if (note) {
    uri += `&tn=${encodeURIComponent(note)}`;
  }
  return uri;
}

/** Resolves the currently active SavedPaymentQr configuration with safe fallbacks */
export function getActivePaymentQr(settings: CompanySettings): SavedPaymentQr {
  if (settings.savedQrCodes && settings.savedQrCodes.length > 0) {
    const found = settings.savedQrCodes.find((q) => q.id === settings.activeQrCodeId);
    if (found) return found;
    return settings.savedQrCodes[0];
  }
  return {
    id: DEFAULT_QR_ID,
    label: 'Primary GPay',
    payeeName: settings.payeeName || settings.tradeName,
    gpayNo: settings.gpayNo,
    upiId: settings.upiId,
    qrCodeUrl: settings.qrCodeUrl,
  };
}

export function getCompanySettings(): CompanySettings {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('cargoflow_company_settings');
    if (saved) {
      try {
        const merged: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS, ...JSON.parse(saved) };
        // Migrate settings saved before multi-QR support existed.
        if (!merged.savedQrCodes || merged.savedQrCodes.length === 0) {
          merged.savedQrCodes = [
            {
              id: DEFAULT_QR_ID,
              label: 'Primary GPay',
              payeeName: merged.payeeName || merged.tradeName,
              gpayNo: merged.gpayNo,
              upiId: merged.upiId,
              qrCodeUrl: merged.qrCodeUrl,
            },
          ];
          merged.activeQrCodeId = DEFAULT_QR_ID;
        } else {
          // Ensure every QR entry has a payeeName
          merged.savedQrCodes = merged.savedQrCodes.map((q) => ({
            ...q,
            payeeName: q.payeeName || merged.payeeName || merged.tradeName || 'RUDRA CARGO AND TRANSPORT NX',
          }));
        }
        if (!merged.payeeName) {
          merged.payeeName = merged.tradeName || DEFAULT_COMPANY_SETTINGS.tradeName;
        }
        return merged;
      } catch (e) {
        console.error('Failed to parse company settings', e);
      }
    }
  }
  return DEFAULT_COMPANY_SETTINGS;
}
