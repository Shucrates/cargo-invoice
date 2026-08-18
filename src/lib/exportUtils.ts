import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CargoDocket } from '@/types/cargo';
import { companyConfig } from '@/lib/companyConfig';

/** Quotes a value for CSV, escaping embedded quotes. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Builds a CSV and downloads it via a Blob URL.
 *
 * A `data:` URI cannot be used here: browsers cap its length (breaking large
 * exports) and `encodeURI` leaves `#` intact, which truncates the file at the
 * first address or note containing one.
 */
export function downloadCSV(headers: string[], rows: unknown[][], filename: string) {
  // UTF-8 BOM so Excel opens rupee symbols and Indian names correctly.
  const csvContent =
    '﻿' +
    [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export array of cargo dockets to a CSV file (Excel-compatible with UTF-8 BOM)
 */
export function exportToCSV(dockets: CargoDocket[], filename: string = 'cargo_dockets_export.csv') {
  if (!dockets || dockets.length === 0) {
    alert('No docket records to export.');
    return;
  }

  const headers = [
    'Docket No',
    'Booking Date',
    'From (Origin)',
    'To (Destination)',
    'Transport Mode',
    'Delivery Status',
    'Consignor Name',
    'Consignor Phone',
    'Consignor GSTIN',
    'Consignee Name',
    'Consignee Phone',
    'Consignee GSTIN',
    'Packages',
    'Goods Description',
    'Actual Wt (kg)',
    'Charged Wt (kg)',
    'Invoice No',
    'Invoice Value (₹)',
    'Subtotal (₹)',
    'GST Amount (₹)',
    'Grand Total (₹)',
    'Payment Mode',
    'Payment Method',
    'Status'
  ];

  const escapeCSVCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = dockets.map(d => [
    escapeCSVCell(d.docket_no),
    escapeCSVCell(d.booking_date),
    escapeCSVCell(d.from_city),
    escapeCSVCell(d.to_city),
    escapeCSVCell(d.transport_mode),
    escapeCSVCell(d.delivery_status || 'booked'),
    escapeCSVCell(d.consignor_name),
    escapeCSVCell(d.consignor_phone || ''),
    escapeCSVCell(d.consignor_gstin || ''),
    escapeCSVCell(d.consignee_name),
    escapeCSVCell(d.consignee_phone || ''),
    escapeCSVCell(d.consignee_gstin || ''),
    escapeCSVCell(d.package_count),
    escapeCSVCell(d.goods_description || ''),
    escapeCSVCell(d.actual_weight_kg || 0),
    escapeCSVCell(d.charged_weight_kg || 0),
    escapeCSVCell(d.invoice_no || ''),
    escapeCSVCell(d.invoice_value || 0),
    escapeCSVCell((d.subtotal || 0).toFixed(2)),
    escapeCSVCell((d.gst_amount || 0).toFixed(2)),
    escapeCSVCell((d.grand_total || 0).toFixed(2)),
    escapeCSVCell(d.payment_mode),
    escapeCSVCell(d.payment_method || (d.payment_mode === 'Paid' ? 'Cash' : '')),
    escapeCSVCell(d.status === 'voided' ? `VOIDED (${d.void_reason || ''})` : 'ISSUED')
  ]);

  // Include UTF-8 Byte Order Mark (\uFEFF) so Excel opens it with proper encoding
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export summary audit report to a multi-page PDF document
 */
export function exportSummaryPDF(dockets: CargoDocket[], filterLabel: string = 'All Records') {
  if (!dockets || dockets.length === 0) {
    alert('No docket records to generate PDF report.');
    return;
  }

  const doc = new jsPDF('landscape');

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(companyConfig.name.toUpperCase(), 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`CARGO DOCKET AUDIT REPORT — ${filterLabel.toUpperCase()}`, 14, 21);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | Total Records: ${dockets.length}`, 14, 26);

  // Summary Metrics Calculation
  const totalGrandTotal = dockets.reduce((sum, d) => sum + (d.grand_total || 0), 0);
  const totalGST = dockets.reduce((sum, d) => sum + (d.gst_amount || 0), 0);
  const totalWeight = dockets.reduce((sum, d) => sum + (d.charged_weight_kg || 0), 0);
  const issuedCount = dockets.filter(d => d.status === 'issued').length;
  const voidedCount = dockets.filter(d => d.status === 'voided').length;

  // Summary Metrics Banner Box
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 30, 269, 14, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Active Dockets: ${issuedCount}  |  Voided: ${voidedCount}  |  Total Charged Wt: ${totalWeight} kg  |  Total GST: Rs. ${totalGST.toFixed(2)}  |  Total Revenue: Rs. ${totalGrandTotal.toFixed(2)}`, 18, 39);

  // Data Table
  const tableData = dockets.map(d => [
    d.docket_no,
    d.courier_partner || 'Self',
    d.booking_date,
    d.transport_mode,
    `${d.created_by_name || 'Staff'}`,
    `${d.consignor_name.slice(0, 14)}...`,
    `${d.consignee_name.slice(0, 14)}...`,
    `${d.from_city} -> ${d.to_city}`,
    `${d.charged_weight_kg || 0} kg`,
    `Rs. ${(d.grand_total || 0).toFixed(2)}`,
    d.payment_mode,
    d.status === 'voided' ? `VOIDED (${d.void_reason || ''})` : d.status.toUpperCase()
  ]);

  autoTable(doc, {
    startY: 48,
    head: [['Docket No', 'Courier', 'Date', 'Mode', 'Created By', 'Consignor', 'Consignee', 'Route', 'Charged Wt', 'Grand Total', 'Payment', 'Status']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' }
    }
  });

  const sanitizeFilename = filterLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`cargo_summary_report_${sanitizeFilename}.pdf`);
}
