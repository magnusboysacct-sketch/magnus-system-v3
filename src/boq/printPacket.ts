type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: any[];
};

type CompanySettings = {
  name: string;
  logoUrl: string | null;
};

type ProjectInfo = {
  name: string;
  clientName: string;
};

type TakeoffGroup = {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  sortOrder: number;
};

type TakeoffTotals = {
  line_ft: number;
  area_ft2: number;
  volume_yd3: number;
  count_ea: number;
};

export function generateBOQPacket(
  sections: Section[],
  company: CompanySettings,
  project: ProjectInfo,
  userEmail: string
) {
  const takeoffGroupsStr = localStorage.getItem("takeoff_groups");
  const takeoffTotalsStr = localStorage.getItem("takeoff_group_totals");

  const takeoffGroups: TakeoffGroup[] = takeoffGroupsStr ? JSON.parse(takeoffGroupsStr) : [];
  const takeoffTotals: Record<string, TakeoffTotals> = takeoffTotalsStr ? JSON.parse(takeoffTotalsStr) : {};

  let itemNumber = 0;
  const allItems: any[] = [];

  sections.forEach(section => {
    section.items.forEach(item => {
      itemNumber++;
      allItems.push({
        no: itemNumber,
        description: item.item_name || item.description || "",
        unit: getUnitLabel(item.unit_id),
        qty: item.qty || 0,
        rate: item.rate || 0,
        amount: (item.qty || 0) * (item.rate || 0),
      });
    });
  });

  const totalAmount = allItems.reduce((sum, item) => sum + item.amount, 0);

  const sortedGroups = [...takeoffGroups].sort((a, b) => a.sortOrder - b.sortOrder);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>BOQ Packet - ${project.name}</title>
  <style>
    @media print {
      @page {
        margin: 0.75in;
        size: letter;
      }

      body {
        margin: 0;
        padding: 0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 11pt;
        line-height: 1.4;
        color: #1a1a1a;
      }

      .page-break {
        page-break-after: always;
      }

      .cover-page {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 9in;
        text-align: center;
      }

      .logo {
        max-width: 200px;
        max-height: 100px;
        margin-bottom: 2rem;
      }

      .cover-title {
        font-size: 32pt;
        font-weight: bold;
        margin-bottom: 1rem;
        color: #2563eb;
      }

      .cover-subtitle {
        font-size: 18pt;
        margin-bottom: 2rem;
        color: #4b5563;
      }

      .cover-info {
        margin-top: 3rem;
        text-align: left;
        font-size: 12pt;
      }

      .cover-info-row {
        margin-bottom: 0.75rem;
      }

      .cover-info-label {
        font-weight: 600;
        display: inline-block;
        width: 150px;
        color: #6b7280;
      }

      .section-title {
        font-size: 20pt;
        font-weight: bold;
        margin: 2rem 0 1rem 0;
        padding-bottom: 0.5rem;
        border-bottom: 3px solid #2563eb;
        color: #1a1a1a;
      }

      .section-title:first-child {
        margin-top: 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
        font-size: 10pt;
      }

      th {
        background-color: #f3f4f6;
        border: 1px solid #d1d5db;
        padding: 0.5rem;
        text-align: left;
        font-weight: 600;
        color: #374151;
      }

      td {
        border: 1px solid #e5e7eb;
        padding: 0.5rem;
      }

      .text-right {
        text-align: right;
      }

      .text-center {
        text-align: center;
      }

      .total-row {
        font-weight: bold;
        background-color: #f9fafb;
      }

      .terms-content {
        font-size: 10pt;
        line-height: 1.6;
        color: #4b5563;
        margin-top: 1rem;
      }

      .terms-content p {
        margin-bottom: 1rem;
      }

      .header {
        position: running(header);
        text-align: center;
        font-size: 9pt;
        color: #6b7280;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #e5e7eb;
      }

      .footer {
        position: running(footer);
        text-align: center;
        font-size: 9pt;
        color: #6b7280;
        padding-top: 0.5rem;
        border-top: 1px solid #e5e7eb;
      }
    }

    @media screen {
      body {
        padding: 2rem;
        background: #f3f4f6;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .page-break {
        margin: 2rem 0;
        border-top: 2px dashed #d1d5db;
      }
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover-page">
    ${company.logoUrl ? `<img src="${company.logoUrl}" alt="Company Logo" class="logo" />` : ''}
    <div class="cover-title">${company.name}</div>
    <div class="cover-subtitle">Bill of Quantities</div>

    <div class="cover-info">
      <div class="cover-info-row">
        <span class="cover-info-label">Project:</span>
        <span>${project.name}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Client:</span>
        <span>${project.clientName}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Date:</span>
        <span>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
      <div class="cover-info-row">
        <span class="cover-info-label">Prepared By:</span>
        <span>${userEmail}</span>
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <!-- BOQ Summary -->
  <div class="section-title">Bill of Quantities Summary</div>

  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 60px;">Item No.</th>
        <th>Description</th>
        <th class="text-center" style="width: 80px;">Unit</th>
        <th class="text-right" style="width: 100px;">Quantity</th>
        <th class="text-right" style="width: 100px;">Rate</th>
        <th class="text-right" style="width: 120px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${allItems.map(item => `
        <tr>
          <td class="text-center">${item.no}</td>
          <td>${item.description}</td>
          <td class="text-center">${item.unit}</td>
          <td class="text-right">${item.qty.toFixed(2)}</td>
          <td class="text-right">$${item.rate.toFixed(2)}</td>
          <td class="text-right">$${item.amount.toFixed(2)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="5" class="text-right">Total Amount:</td>
        <td class="text-right">$${totalAmount.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="page-break"></div>

  <!-- Takeoff Summary -->
  <div class="section-title">Takeoff Summary</div>

  ${sortedGroups.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Group Name</th>
          <th class="text-right" style="width: 120px;">Line (ft)</th>
          <th class="text-right" style="width: 120px;">Area (ft²)</th>
          <th class="text-right" style="width: 120px;">Volume (yd³)</th>
          <th class="text-right" style="width: 120px;">Count (ea)</th>
        </tr>
      </thead>
      <tbody>
        ${sortedGroups.map(group => {
          const totals = takeoffTotals[group.id] || { line_ft: 0, area_ft2: 0, volume_yd3: 0, count_ea: 0 };
          return `
            <tr>
              <td>${group.name}</td>
              <td class="text-right">${totals.line_ft.toFixed(2)}</td>
              <td class="text-right">${totals.area_ft2.toFixed(2)}</td>
              <td class="text-right">${totals.volume_yd3.toFixed(2)}</td>
              <td class="text-right">${totals.count_ea.toFixed(0)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  ` : '<p style="color: #6b7280; font-style: italic;">No takeoff data available.</p>'}

  <div class="page-break"></div>

  <!-- Terms & Conditions -->
  <div class="section-title">Terms & Conditions</div>

  <div class="terms-content">
    <p><strong>1. General Terms</strong></p>
    <p>This Bill of Quantities is prepared based on the information available at the time of preparation. All quantities are approximate and subject to verification on site.</p>

    <p><strong>2. Pricing</strong></p>
    <p>All prices quoted are valid for 30 days from the date of this document. Prices are subject to change based on market conditions and material availability.</p>

    <p><strong>3. Scope of Work</strong></p>
    <p>The scope of work is limited to items specifically listed in this Bill of Quantities. Any additional work or changes will be subject to change orders and additional charges.</p>

    <p><strong>4. Payment Terms</strong></p>
    <p>Payment terms are net 30 days from the date of invoice. Late payments may be subject to interest charges at the rate of 1.5% per month.</p>

    <p><strong>5. Warranty</strong></p>
    <p>All work is warranted to be free from defects in materials and workmanship for a period of one year from the date of completion.</p>

    <p><strong>6. Governing Law</strong></p>
    <p>This agreement shall be governed by and construed in accordance with the laws of the jurisdiction in which the project is located.</p>
  </div>

</body>
</html>
  `;

  return html;
}

function getUnitLabel(unitId: string | null): string {
  if (!unitId) return "";

  const unitMap: Record<string, string> = {
    "ea": "ea",
    "lf": "lf",
    "sf": "sf",
    "cy": "cy",
    "cf": "cf",
    "ft": "ft",
    "m": "m",
    "kg": "kg",
    "ton": "ton",
    "hr": "hr",
    "day": "day",
  };

  return unitMap[unitId] || unitId;
}

export function printBOQPacket(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = "1px";
  iframe.style.height = "1px";

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Failed to access iframe document");
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  iframe.contentWindow?.focus();

  setTimeout(() => {
    iframe.contentWindow?.print();

    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 500);
}
