import type { ProcurementHeaderWithItems, ProcurementItemWithSource } from "./procurement";

interface PrintData {
  document: ProcurementHeaderWithItems;
  projectName: string;
  companyName: string;
}

export function generatePrintHTML(data: PrintData): string {
  const { document, projectName, companyName } = data;

  const groupedItems = document.items.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ProcurementItemWithSource[]>);

  const categoryHTML = Object.entries(groupedItems)
    .map(
      ([category, items]) => `
    <div class="category-section">
      <div class="category-header">
        <h3>${escapeHTML(category)}</h3>
        <div class="item-count">${items.length} item${items.length !== 1 ? 's' : ''}</div>
      </div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td class="material-name">${escapeHTML(item.material_name)}</td>
              <td class="description">${escapeHTML(item.description || item.notes || "-")}</td>
              <td class="quantity">${Number(item.quantity).toFixed(2)}</td>
              <td class="unit">${escapeHTML(item.unit || "-")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Procurement List - ${escapeHTML(document.title)}</title>
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
    }

    .company-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 0.5rem;
      color: #000;
    }

    .document-type {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #000;
    }

    .document-title {
      font-size: 18px;
      color: #333;
      margin-bottom: 1rem;
    }

    .document-info {
      display: flex;
      justify-content: space-between;
      border-top: 2px solid #d1d5db;
      border-bottom: 2px solid #d1d5db;
      padding: 0.75rem 0;
      font-size: 14px;
      color: #555;
    }

    .document-info strong {
      color: #000;
      font-weight: 600;
    }

    .category-section {
      margin-bottom: 2rem;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .category-header {
      background: #f3f4f6;
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-bottom: 2px solid #d1d5db;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .category-header h3 {
      font-size: 16px;
      font-weight: 600;
      color: #000;
    }

    .item-count {
      font-size: 12px;
      color: #666;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #d1d5db;
      border-top: none;
    }

    .items-table thead {
      background: #f9fafb;
    }

    .items-table th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 13px;
      font-weight: 600;
      color: #000;
      border-bottom: 2px solid #d1d5db;
    }

    .items-table td {
      padding: 0.625rem 1rem;
      font-size: 13px;
      color: #000;
      border-bottom: 1px solid #e5e7eb;
    }

    .items-table tbody tr:last-child td {
      border-bottom: none;
    }

    .material-name {
      font-weight: 500;
    }

    .description {
      color: #555;
    }

    .quantity {
      font-weight: 500;
      text-align: right;
    }

    .unit {
      color: #555;
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

      .category-section {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .items-table {
        page-break-inside: auto;
      }

      .items-table tr {
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
      <div class="document-type">Procurement List</div>
      <div class="document-title">${escapeHTML(document.title)}</div>
      <div class="document-info">
        <div><strong>Project:</strong> ${escapeHTML(projectName)}</div>
        <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
        <div><strong>Status:</strong> ${document.status.toUpperCase()}</div>
      </div>
    </div>

    ${categoryHTML}

    <div class="footer">
      Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
    </div>
  </div>
</body>
</html>`;
}

export function printProcurementDocument(data: PrintData): void {
  const html = generatePrintHTML(data);

  // Remove any existing print containers
  const existingContainer = document.getElementById('procurement-print-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create a hidden container for the print content
  const printContainer = document.createElement('div');
  printContainer.id = 'procurement-print-container';
  printContainer.style.position = 'fixed';
  printContainer.style.top = '0';
  printContainer.style.left = '0';
  printContainer.style.width = '100%';
  printContainer.style.height = '100%';
  printContainer.style.zIndex = '9999';
  printContainer.style.backgroundColor = 'white';
  printContainer.style.overflow = 'auto';
  printContainer.innerHTML = html;

  // Add print-specific styles
  const style = document.createElement('style');
  style.textContent = `
    @media screen {
      body:has(#procurement-print-container) > *:not(#procurement-print-container) {
        display: none !important;
      }
    }
    @media print {
      body > *:not(#procurement-print-container) {
        display: none !important;
      }
      #procurement-print-container {
        position: static !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
      }
    }
  `;
  printContainer.appendChild(style);

  // Append to body
  document.body.appendChild(printContainer);

  // Trigger print after a short delay to ensure rendering
  setTimeout(() => {
    window.print();

    // Clean up after print
    const cleanup = () => {
      printContainer.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
  }, 100);
}

function escapeHTML(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
