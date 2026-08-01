import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CargoDocket } from '@/types/cargo';
import { companyConfig } from '@/lib/companyConfig';

export function generateInvoicePDF(docket: CargoDocket) {
  const doc = new jsPDF();

  // Company Title / Header
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(companyConfig.name.toUpperCase(), 14, 14);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`GST TIN: ${companyConfig.gstin} | ${companyConfig.tagline}`, 14, 19);
  doc.text(`${companyConfig.address}`, 14, 23);
  doc.text(`Ph: ${companyConfig.phone} | Email: ${companyConfig.email}`, 14, 27);
  doc.text(`(${companyConfig.jurisdiction})`, 14, 31);
  
  // Docket Status Badge
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`DOCKET NO: ${docket.docket_no}`, 140, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE: ${docket.booking_date} | MODE: ${docket.transport_mode.toUpperCase()}`, 140, 19);

  if (docket.status === 'voided') {
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('*** VOIDED DOCKET ***', 140, 27);
    doc.setTextColor(0, 0, 0);
  }

  doc.setLineWidth(0.5);
  doc.line(14, 34, 196, 34);

  // Consignor & Consignee Columns
  autoTable(doc, {
    startY: 37,

    head: [['CONSIGNOR (SENDER)', 'CONSIGNEE (RECEIVER)']],
    body: [
      [
        `Name: ${docket.consignor_name}\nAddress: ${docket.consignor_address || 'N/A'}\nPhone: ${docket.consignor_phone || 'N/A'}\nGSTIN: ${docket.consignor_gstin || 'N/A'}`,
        `Name: ${docket.consignee_name}\nAddress: ${docket.consignee_address || 'N/A'}\nPhone: ${docket.consignee_phone || 'N/A'}\nGSTIN: ${docket.consignee_gstin || 'N/A'}`
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] }
  });

  // Shipment Details Table
  const lastY1 = (doc as any).lastAutoTable.finalY || 80;

  autoTable(doc, {
    startY: lastY1 + 5,
    head: [['From', 'To', 'Packages', 'Invoice No.', 'Actual Wt', 'Charged Wt', 'Description']],
    body: [
      [
        docket.from_city,
        docket.to_city,
        docket.package_count.toString(),
        docket.invoice_no || '-',
        `${docket.actual_weight_kg || 0} kg`,
        `${docket.charged_weight_kg || 0} kg`,
        docket.goods_description || 'General Goods'
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [71, 85, 105] }
  });

  // Charges Breakdown Table
  const lastY2 = (doc as any).lastAutoTable.finalY || 120;

  autoTable(doc, {
    startY: lastY2 + 5,
    head: [['Charge Particulars', 'Amount (INR)']],
    body: [
      ['Freight Amount', `Rs. ${(docket.freight_amount || 0).toFixed(2)}`],
      ['Handling Charge', `Rs. ${(docket.handling_charge || 0).toFixed(2)}`],
      ['Risk Charge / FOV', `Rs. ${(docket.risk_charge || 0).toFixed(2)}`],
      ['Docket & Doc Charges', `Rs. ${(docket.docket_charge || 0).toFixed(2)}`],
      ['Pickup & Delivery Charges', `Rs. ${(docket.pickup_delivery_charge || 0).toFixed(2)}`],
      ['Other Charges', `Rs. ${(docket.other_charge || 0).toFixed(2)}`],
      ['Subtotal', `Rs. ${(docket.subtotal || 0).toFixed(2)}`],
      [`GST (${docket.gst_percentage || 18}%)`, `Rs. ${(docket.gst_amount || 0).toFixed(2)}`],
      ['GRAND TOTAL (' + docket.payment_mode.toUpperCase() + ')', `Rs. ${(docket.grand_total || 0).toFixed(2)}`]
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold' }
    }
  });

  // Footer / Signatures
  const lastY3 = (doc as any).lastAutoTable.finalY || 200;
  doc.setFontSize(8);
  doc.text('Consignor Signature: __________________', 14, lastY3 + 25);
  doc.text('Authorized Signatory: __________________', 130, lastY3 + 25);

  doc.save(`${docket.docket_no}.pdf`);
}
