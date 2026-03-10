import type { PurchaseOrderWithItems } from "./purchaseOrders";

interface POPrintData {
  purchaseOrder: PurchaseOrderWithItems;
  projectName: string;
  companyName: string;
}

export function generatePOPrintHTML(data: POPrintData): string {
  const { purchaseOrder, projectName, companyName } = data;

  const itemsHTML = purchaseOrder.items
    .map(
      (item) => `
    <tr>
      <td class="material-name">${escapeHTML(item.material_name)}</td>
      <td class="description">${escapeHTML(item.description || "-")}</td>
      <td class="quantity">${Number(item.quantity).toFixed(2)}</td>
      <td class="unit">${escapeHTML(item.unit || "-")}</td>
      <td class="unit-rate">$${Number(item.unit_rate).toFixed(2)}</td>
      <td class="total">$${Number(item.total_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
    </tr>
  `
    )
    .join("");

  const statusLabel = getStatusLabel(purchaseOrder.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order - ${escapeHTML(purchaseOrder.po_number)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A4;
      margin: 15mm;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
    }

    .print-document {
      max-width: 100%;
      margin: 0 auto;
      background: white;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #d1d5db;
    }

    .company-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 0.5rem;
      color: #000;
    }

    .document-type {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #000;
    }

    .po-number {
      font-size: 16px;
      color: #333;
      margin-bottom: 0.25rem;
    }

    .po-title {
      font-size: 14px;
      color: #555;
    }

    .info-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .info-block {
      border: 1px solid #d1d5db;
      padding: 1rem;
      background: #f9fafb;
    }

    .info-block-title {
      font-size: 12px;
      font-weight: 600;
      color: #000;
      text-transform: uppercase;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 0.5rem;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 13px;
    }

    .info-row:last-child {
      margin-bottom: 0;
    }

    .info-label {
      color: #666;
      font-weight: 500;
    }

    .info-value {
      color: #000;
      font-weight: 600;
    }

    .items-section {
      margin-bottom: 2rem;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #d1d5db;
    }

    .items-table thead {
      background: #f3f4f6;
    }

    .items-table th {
      text-align: left;
      padding: 0.75rem 0.5rem;
      font-size: 12px;
      font-weight: 600;
      color: #000;
      border-bottom: 2px solid #d1d5db;
      text-transform: uppercase;
    }

    .items-table td {
      padding: 0.625rem 0.5rem;
      font-size: 13px;
      color: #000;
      border-bottom: 1px solid #e5e7eb;
    }

    .items-table tbody tr:last-child td {
      border-bottom: 1px solid #d1d5db;
    }

    .material-name {
      font-weight: 600;
    }

    .description {
      color: #555;
      font-size: 12px;
    }

    .quantity {
      text-align: right;
      font-weight: 500;
    }

    .unit {
      color: #555;
      text-align: center;
    }

    .unit-rate {
      text-align: right;
      font-weight: 500;
    }

    .total {
      text-align: right;
      font-weight: 600;
    }

    .total-row {
      background: #f3f4f6;
      border-top: 2px solid #000;
    }

    .total-row td {
      padding: 1rem 0.5rem;
      font-size: 14px;
      font-weight: 700;
      color: #000;
      border-bottom: none;
    }

    .notes-section {
      margin-bottom: 2rem;
      padding: 1rem;
      border: 1px solid #d1d5db;
      background: #fefefe;
    }

    .notes-title {
      font-size: 12px;
      font-weight: 600;
      color: #000;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .notes-content {
      font-size: 13px;
      color: #333;
      white-space: pre-wrap;
    }

    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #d1d5db;
      text-align: center;
      font-size: 11px;
      color: #666;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .items-table {
        page-break-inside: auto;
      }

      .items-table tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .notes-section {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="print-document">
    <div class="header">
      ${companyName ? `<div class="company-name">${escapeHTML(companyName)}</div>` : ""}
      <div class="document-type">Purchase Order</div>
      <div class="po-number">${escapeHTML(purchaseOrder.po_number)}</div>
      <div class="po-title">${escapeHTML(purchaseOrder.title)}</div>
    </div>

    <div class="info-section">
      <div class="info-block">
        <div class="info-block-title">Order Details</div>
        <div class="info-row">
          <span class="info-label">Project:</span>
          <span class="info-value">${escapeHTML(projectName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value">${statusLabel}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Issue Date:</span>
          <span class="info-value">${purchaseOrder.issue_date ? new Date(purchaseOrder.issue_date).toLocaleDateString() : "Not set"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Expected Date:</span>
          <span class="info-value">${purchaseOrder.expected_date ? new Date(purchaseOrder.expected_date).toLocaleDateString() : "Not set"}</span>
        </div>
      </div>

      <div class="info-block">
        <div class="info-block-title">Supplier</div>
        <div class="info-row">
          <span class="info-label">Name:</span>
          <span class="info-value">${escapeHTML(purchaseOrder.supplier_name)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total Items:</span>
          <span class="info-value">${purchaseOrder.itemCount}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total Value:</span>
          <span class="info-value">$${purchaseOrder.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>

    <div class="items-section">
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 22%;">Material</th>
            <th style="width: 26%;">Description</th>
            <th style="width: 10%;">Quantity</th>
            <th style="width: 8%;">Unit</th>
            <th style="width: 12%;">Unit Rate</th>
            <th style="width: 12%;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="5" style="text-align: right;">GRAND TOTAL</td>
            <td style="text-align: right;">$${purchaseOrder.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${
      purchaseOrder.notes
        ? `
    <div class="notes-section">
      <div class="notes-title">Notes</div>
      <div class="notes-content">${escapeHTML(purchaseOrder.notes)}</div>
    </div>
    `
        : ""
    }

    <div class="footer">
      Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
    </div>
  </div>
</body>
</html>`;
}

export function printPurchaseOrder(data: POPrintData): void {
  const html = generatePOPrintHTML(data);

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Unable to open print window. Please check your popup blocker settings.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.addEventListener("load", () => {
    setTimeout(() => {
      printWindow.print();

      printWindow.addEventListener("afterprint", () => {
        printWindow.close();
      });
    }, 250);
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "issued":
      return "Issued";
    case "part_delivered":
      return "Part Delivered";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function escapeHTML(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
