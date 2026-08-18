export interface SavedPaymentQr {
  id: string;
  label: string;
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
  qrCodeUrl: string;
  /** All QR codes the user has saved. The one matching activeQrCodeId is the
   *  one embedded in generated invoices (mirrored into gpayNo/upiId/qrCodeUrl). */
  savedQrCodes: SavedPaymentQr[];
  activeQrCodeId: string;
  terms: string[];
  /** Default origin city used to prefill new LRs and to pick which
   *  quotation sheet (by origin city) prices them automatically. */
  defaultOriginCity: string;
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
  upiId: '9821541984@upi',
  qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?data=upi://pay?pa=9821541984@upi%26pn=RUDRA%20CARGO%20AND%20TRANSPORT%20NX%26cu=INR&size=200x200',
  savedQrCodes: [
    {
      id: DEFAULT_QR_ID,
      label: 'Primary GPay',
      gpayNo: '9821541984',
      upiId: '9821541984@upi',
      qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?data=upi://pay?pa=9821541984@upi%26pn=RUDRA%20CARGO%20AND%20TRANSPORT%20NX%26cu=INR&size=200x200',
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
              gpayNo: merged.gpayNo,
              upiId: merged.upiId,
              qrCodeUrl: merged.qrCodeUrl,
            },
          ];
          merged.activeQrCodeId = DEFAULT_QR_ID;
        }
        return merged;
      } catch (e) {
        console.error('Failed to parse company settings', e);
      }
    }
  }
  return DEFAULT_COMPANY_SETTINGS;
}
