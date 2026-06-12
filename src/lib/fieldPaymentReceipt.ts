import type { FieldPayment, FieldPaymentSignature } from "./fieldPayments";

interface FieldPaymentReceiptData {
  payment: FieldPayment;
  signatures: FieldPaymentSignature[];
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  receiptNumber: string;
  receiptType: "payment_acknowledgment" | "company_receipt" | "payroll_entry";
}

export function generateFieldPaymentReceiptHTML(data: FieldPaymentReceiptData): string {
  const { payment, signatures, companyName, companyAddress, companyPhone, receiptNumber, receiptType } = data;

  // Find signatures
  const workerSignature = signatures.find(s => s.signature_type === "worker");
  const supervisorSignature = signatures.find(s => s.signature_type === "supervisor");

  // Format currency
  const formatCurrency = (amount: number) => 
    amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Get receipt title based on type
  const getReceiptTitle = () => {
    switch (receiptType) {
      case "payment_acknowledgment":
        return "Worker Payment Acknowledgment";
      case "company_receipt":
        return "Company Payment Receipt";
      case "payroll_entry":
        return "Payroll Entry Record";
      default:
        return "Payment Receipt";
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${getReceiptTitle()} - ${receiptNumber}</title>
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
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
    }

    .company-info {
      margin-bottom: 10px;
    }

    .company-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .company-contact {
      font-size: 14px;
      color: #666;
    }

    .receipt-title {
      font-size: 20px;
      font-weight: bold;
      margin: 20px 0 10px 0;
      color: #333;
    }

    .receipt-number {
      font-size: 16px;
      color: #666;
      margin-bottom: 5px;
    }

    .receipt-date {
      font-size: 14px;
      color: #666;
    }

    .payment-details {
      margin: 30px 0;
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #ddd;
    }

    .section-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #333;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .detail-label {
      font-weight: 600;
      color: #555;
      font-size: 14px;
    }

    .detail-value {
      font-weight: normal;
      color: #000;
      font-size: 14px;
      text-align: right;
    }

    .amount-section {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #333;
    }

    .total-amount {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      font-weight: bold;
    }

    .signatures {
      margin-top: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }

    .signature-box {
      text-align: center;
    }

    .signature-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }

    .signature-image {
      width: 100%;
      height: 80px;
      border: 1px solid #ccc;
      border-radius: 4px;
      margin-bottom: 10px;
      background: #fff;
    }

    .signature-name {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }

    .signature-date {
      font-size: 11px;
      color: #999;
    }

    .notes-section {
      margin-top: 30px;
      padding: 15px;
      background: #f0f0f0;
      border-radius: 4px;
    }

    .notes-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 5px;
      color: #333;
    }

    .notes-content {
      font-size: 13px;
      color: #666;
      white-space: pre-wrap;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      text-align: center;
      font-size: 12px;
      color: #999;
    }

    @media print {
      .container {
        margin: 0;
        padding: 0;
        max-width: none;
      }
      
      body {
        margin: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">${companyName}</div>
        ${companyAddress ? `<div class="company-contact">${companyAddress}</div>` : ""}
        ${companyPhone ? `<div class="company-contact">Phone: ${companyPhone}</div>` : ""}
      </div>
      
      <div class="receipt-title">${getReceiptTitle()}</div>
      <div class="receipt-number">Receipt #: ${receiptNumber}</div>
      <div class="receipt-date">Date: ${formatDate(payment.created_at)}</div>
    </div>

    <!-- Worker Information -->
    <div class="payment-details">
      <div class="section-title">Worker Information</div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Name:</span>
          <span class="detail-value">${payment.worker_name}</span>
        </div>
        ${payment.worker_nickname ? `
        <div class="detail-item">
          <span class="detail-label">Nickname:</span>
          <span class="detail-value">${payment.worker_nickname}</span>
        </div>
        ` : ""}
        ${payment.worker_id_number ? `
        <div class="detail-item">
          <span class="detail-label">ID Number:</span>
          <span class="detail-value">${payment.worker_id_number}</span>
        </div>
        ` : ""}
        ${payment.worker_phone ? `
        <div class="detail-item">
          <span class="detail-label">Phone:</span>
          <span class="detail-value">${payment.worker_phone}</span>
        </div>
        ` : ""}
        ${payment.worker_address ? `
        <div class="detail-item" style="grid-column: 1 / -1;">
          <span class="detail-label">Address:</span>
          <span class="detail-value">${payment.worker_address}</span>
        </div>
        ` : ""}
      </div>
    </div>

    <!-- Work Details -->
    <div class="payment-details">
      <div class="section-title">Work Details</div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Work Type:</span>
          <span class="detail-value">${payment.work_type}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Work Date:</span>
          <span class="detail-value">${formatDate(payment.work_date)}</span>
        </div>
        ${payment.hours_worked ? `
        <div class="detail-item">
          <span class="detail-label">Hours Worked:</span>
          <span class="detail-value">${payment.hours_worked}</span>
        </div>
        ` : ""}
        ${payment.days_worked ? `
        <div class="detail-item">
          <span class="detail-label">Days Worked:</span>
          <span class="detail-value">${payment.days_worked}</span>
        </div>
        ` : ""}
        ${payment.rate_per_hour ? `
        <div class="detail-item">
          <span class="detail-label">Rate per Hour:</span>
          <span class="detail-value">$${formatCurrency(payment.rate_per_hour)}</span>
        </div>
        ` : ""}
        ${payment.rate_per_day ? `
        <div class="detail-item">
          <span class="detail-label">Rate per Day:</span>
          <span class="detail-value">$${formatCurrency(payment.rate_per_day)}</span>
        </div>
        ` : ""}
        ${payment.location ? `
        <div class="detail-item">
          <span class="detail-label">Location:</span>
          <span class="detail-value">${payment.location}</span>
        </div>
        ` : ""}
        ${payment.weather_conditions ? `
        <div class="detail-item">
          <span class="detail-label">Weather:</span>
          <span class="detail-value">${payment.weather_conditions}</span>
        </div>
        ` : ""}
      </div>
    </div>

    <!-- Payment Details -->
    <div class="payment-details">
      <div class="section-title">Payment Details</div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Payment Method:</span>
          <span class="detail-value">${payment.payment_method.replace("_", " ").toUpperCase()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${payment.status.replace("_", " ").toUpperCase()}</span>
        </div>
      </div>
      
      <div class="amount-section">
        <div class="total-amount">
          <span>Total Amount Paid:</span>
          <span>$${formatCurrency(payment.total_amount)}</span>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      ${workerSignature ? `
      <div class="signature-box">
        <div class="signature-title">Worker Signature</div>
        <img src="${workerSignature.signature_data}" alt="Worker Signature" class="signature-image" />
        <div class="signature-name">${workerSignature.signed_by || payment.worker_name}</div>
        <div class="signature-date">Signed: ${formatDate(workerSignature.signed_at)}</div>
      </div>
      ` : `
      <div class="signature-box">
        <div class="signature-title">Worker Signature</div>
        <div class="signature-image" style="display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">
          Not signed
        </div>
      </div>
      `}
      
      ${supervisorSignature ? `
      <div class="signature-box">
        <div class="signature-title">Supervisor Signature</div>
        <img src="${supervisorSignature.signature_data}" alt="Supervisor Signature" class="signature-image" />
        <div class="signature-name">${supervisorSignature.signed_by || payment.supervisor_name || "Supervisor"}</div>
        <div class="signature-date">Signed: ${formatDate(supervisorSignature.signed_at)}</div>
      </div>
      ` : `
      <div class="signature-box">
        <div class="signature-title">Supervisor Signature</div>
        <div class="signature-image" style="display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">
          Not signed
        </div>
      </div>
      `}
    </div>

    <!-- Notes -->
    ${(payment.notes || payment.payment_notes) ? `
    <div class="notes-section">
      <div class="notes-title">Notes</div>
      <div class="notes-content">
        ${payment.notes || ""}
        ${payment.notes && payment.payment_notes ? "\n\n" : ""}
        ${payment.payment_notes || ""}
      </div>
    </div>
    ` : ""}

    <!-- Footer -->
    <div class="footer">
      <div>This is a legally binding payment acknowledgment.</div>
      <div>Generated by Magnus System v3 on ${formatDate(new Date().toISOString())}</div>
      <div>Receipt #: ${receiptNumber}</div>
    </div>
  </div>
</body>
</html>`;
}

export async function generatePDFFromHTML(htmlContent: string): Promise<Blob> {
  // Create a temporary iframe to render the HTML
  const iframe = document.createElement("iframe");
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.width = "210mm"; // A4 width
  iframe.style.height = "297mm"; // A4 height
  document.body.appendChild(iframe);

  return new Promise((resolve, reject) => {
    iframe.onload = () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          reject(new Error("Could not access iframe document"));
          return;
        }

        // Wait for images to load
        const images = iframeDoc.getElementsByTagName("img");
        const imagePromises = Array.from(images).map(img => {
          return new Promise((imgResolve) => {
            if (img.complete) {
              imgResolve(img);
            } else {
              img.onload = () => imgResolve(img);
              img.onerror = () => imgResolve(img); // Continue even if image fails
            }
          });
        });

        Promise.all(imagePromises).then(() => {
          // Use window.print() to generate PDF
          iframe.contentWindow?.print();
          
          // For now, return HTML as blob (in production, you'd use a PDF library)
          const blob = new Blob([htmlContent], { type: "text/html" });
          resolve(blob);
          
          // Clean up
          document.body.removeChild(iframe);
        }).catch(reject);
      } catch (error) {
        reject(error);
        document.body.removeChild(iframe);
      }
    };

    iframe.srcdoc = htmlContent;
  });
}

// Alternative: Simple HTML to PDF conversion using browser print
export function downloadFieldPaymentReceipt(data: FieldPaymentReceiptData) {
  const htmlContent = generateFieldPaymentReceiptHTML(data);
  
  // Create a new window and print
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    };
  }
}

// WhatsApp sharing function
export function shareViaWhatsApp(payment: FieldPayment, companyName: string) {
  const message = `Payment Receipt - ${companyName}\n` +
    `Worker: ${payment.worker_name}\n` +
    `Amount: $${payment.total_amount.toFixed(2)}\n` +
    `Date: ${new Date(payment.work_date).toLocaleDateString()}\n` +
    `Payment Method: ${payment.payment_method.replace("_", " ").toUpperCase()}\n` +
    `Status: ${payment.status.replace("_", " ").toUpperCase()}\n\n` +
    `Generated by Magnus System v3`;
  
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");
}
