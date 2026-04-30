/**
 * Invoice Scanner Service
 * 
 * Main service for processing supplier invoices with specialized OCR
 * Routes invoice documents through dedicated preprocessing and extraction
 */

import { createWorker } from 'tesseract.js';
import { InvoicePreprocessor, type PreprocessingResult } from './InvoicePreprocessor';
import { InvoiceDataExtractor, type InvoiceData } from './InvoiceDataExtractor';
import { RegionBasedOCR, type MergedInvoiceData } from './RegionBasedOCR';

export interface InvoiceScanResult {
  success: boolean;
  invoiceData: InvoiceData | null;
  preprocessing: PreprocessingResult | null;
  ocrConfidence: number;
  processingTime: number;
  error?: string;
}

export interface InvoiceScannerConfig {
  ocrLanguage: string;
  preprocessing: boolean;
  maxProcessingTime: number;
  enableLineItems: boolean;
  useRegionBasedOCR: boolean;
}

export class InvoiceScanner {
  private static readonly DEFAULT_CONFIG: InvoiceScannerConfig = {
    ocrLanguage: 'eng',
    preprocessing: true,
    maxProcessingTime: 15000, // 15 seconds
    enableLineItems: true,
    useRegionBasedOCR: true
  };

  /**
   * Process invoice image with specialized invoice OCR
   */
  static async processInvoice(
    imageFile: File, 
    config: Partial<InvoiceScannerConfig> = {}
  ): Promise<InvoiceScanResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    console.log('INVOICE_SCANNER: Starting specialized invoice processing', {
      fileName: imageFile.name,
      fileSize: imageFile.size,
      config: finalConfig
    });

    try {
      // Step 1: Convert image to data URL
      const imageUrl = await this.fileToDataUrl(imageFile);

      // Step 2: First pass - Standard preprocessing
      let preprocessing: PreprocessingResult | null = null;
      let processedImageUrl = imageUrl;
      let ocrResult = { text: '', confidence: 0 };

      if (finalConfig.preprocessing) {
        preprocessing = await InvoicePreprocessor.preprocessInvoice(imageUrl);
        processedImageUrl = preprocessing.processedImage;
        
        // Step 3: First OCR pass
        ocrResult = await this.performInvoiceOCR(processedImageUrl, finalConfig);
        
        console.log('INVOICE_OCR_FIRST_PASS:', {
          confidence: ocrResult.confidence,
          textLength: ocrResult.text.length,
          preprocessing: preprocessing.processingSteps
        });

        // Step 4: Second pass if confidence is low
        if (ocrResult.confidence < 0.7) {
          console.log('INVOICE_OCR_LOW_CONFIDENCE: Running second pass with strong preprocessing');
          
          const strongPreprocessing = await InvoicePreprocessor.preprocessStrong(imageUrl);
          const strongProcessedImageUrl = strongPreprocessing.processedImage;
          
          const secondPassResult = await this.performInvoiceOCR(strongProcessedImageUrl, finalConfig);
          
          console.log('INVOICE_OCR_SECOND_PASS:', {
            confidence: secondPassResult.confidence,
            textLength: secondPassResult.text.length,
            preprocessing: strongPreprocessing.processingSteps
          });

          // Use the better result
          if (secondPassResult.confidence > ocrResult.confidence) {
            ocrResult = secondPassResult;
            preprocessing = strongPreprocessing;
            console.log('INVOICE_OCR_USING_SECOND_PASS: Better confidence achieved');
          } else {
            console.log('INVOICE_OCR_USING_FIRST_PASS: Second pass did not improve confidence');
          }
        }
      } else {
        // No preprocessing - direct OCR
        ocrResult = await this.performInvoiceOCR(imageUrl, finalConfig);
      }

      // Step 5: Extract invoice-specific data
      let invoiceData: InvoiceData;

      if (finalConfig.useRegionBasedOCR) {
        console.log('INVOICE_SCANNER: Using region-based OCR extraction');
        
        // Use region-based OCR on the best processed image
        const regionBasedData = await RegionBasedOCR.processInvoiceRegions(
          processedImageUrl,
          preprocessing?.processingSteps.includes('Strong thresholding') ? 'strong' : 'standard'
        );

        // Convert region-based result to InvoiceData format
        const rawText = regionBasedData.supplierRecovery?.recovered 
          ? `Region-based extraction from: ${regionBasedData.sourceRegions.join(', ')}\nSupplier recovery: ${regionBasedData.supplierRecovery.recoveryReason}`
          : `Region-based extraction from: ${regionBasedData.sourceRegions.join(', ')}`;

        invoiceData = {
          vendorName: regionBasedData.vendorName,
          invoiceNumber: regionBasedData.invoiceNumber,
          invoiceDate: regionBasedData.invoiceDate,
          dueDate: null,
          grandTotal: regionBasedData.grandTotal,
          subtotal: regionBasedData.subtotal,
          taxAmount: regionBasedData.taxAmount,
          taxRate: null,
          amountDue: regionBasedData.amountDue,
          currency: 'JMD', // Default to JMD for Jamaican invoices
          lineItems: [], // Line items ignored in region-based approach
          confidence: regionBasedData.confidence,
          extractionMethod: regionBasedData.supplierRecovery?.recovered ? 'region_based_ocr_with_supplier_recovery' : 'region_based_ocr',
          rawText: rawText
        };

        console.log('REGION_BASED_EXTRACTION_COMPLETE:', {
          vendor: invoiceData.vendorName,
          invoiceNumber: invoiceData.invoiceNumber,
          total: invoiceData.grandTotal,
          confidence: invoiceData.confidence,
          sourceRegions: regionBasedData.sourceRegions,
          supplierRecovery: regionBasedData.supplierRecovery?.recovered || false,
          originalVendor: regionBasedData.supplierRecovery?.originalVendor,
          recoveredVendor: regionBasedData.supplierRecovery?.recoveredVendor,
          recoveryReason: regionBasedData.supplierRecovery?.recoveryReason
        });

      } else {
        // Use traditional full-page OCR
        invoiceData = InvoiceDataExtractor.extractInvoiceData(
          ocrResult.text,
          ocrResult.confidence
        );
      }

      const processingTime = Date.now() - startTime;

      console.log('INVOICE_SCANNER_COMPLETE:', {
        success: true,
        vendor: invoiceData.vendorName,
        invoiceNumber: invoiceData.invoiceNumber,
        total: invoiceData.grandTotal,
        confidence: invoiceData.confidence,
        ocrConfidence: ocrResult.confidence,
        processingTime,
        preprocessing: preprocessing?.processingSteps || []
      });

      return {
        success: true,
        invoiceData,
        preprocessing,
        ocrConfidence: ocrResult.confidence,
        processingTime,
        error: undefined
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('INVOICE_SCANNER_ERROR:', {
        error: errorMessage,
        processingTime,
        fileName: imageFile.name
      });

      return {
        success: false,
        invoiceData: null,
        preprocessing: null,
        ocrConfidence: 0,
        processingTime,
        error: errorMessage
      };
    }
  }

  /**
   * Convert file to data URL
   */
  private static async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Perform OCR with invoice-optimized settings
   */
  private static async performInvoiceOCR(
    imageUrl: string, 
    config: InvoiceScannerConfig
  ): Promise<{ text: string; confidence: number }> {
    console.log('INVOICE_OCR: Starting Tesseract processing');

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error('OCR processing timeout'));
      }, config.maxProcessingTime);

      createWorker(config.ocrLanguage, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log('INVOICE_OCR_PROGRESS:', `${Math.round(m.progress * 100)}%`);
          }
        }
      })
        .then(worker => {
          return worker
            .recognize(imageUrl)
            .then(({ data: { text, confidence } }) => {
              clearTimeout(timeoutId);
              worker.terminate();

              console.log('INVOICE_OCR_COMPLETE:', {
                confidence: confidence,
                textLength: text.length
              });

              resolve({
                text: text,
                confidence: confidence / 100 // Normalize to 0-1
              });
            })
            .catch(error => {
              clearTimeout(timeoutId);
              worker.terminate();
              reject(error);
            });
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Check if image is likely an invoice
   */
  static async isInvoiceImage(imageFile: File): Promise<{
    isInvoice: boolean;
    confidence: number;
    reasoning: string;
  }> {
    try {
      // Quick OCR check for invoice keywords
      const imageUrl = await this.fileToDataUrl(imageFile);
      const ocrResult = await this.performQuickOCR(imageUrl);

      const invoiceKeywords = [
        'invoice', 'tax invoice', 'bill', 'statement', 'account',
        'vendor', 'supplier', 'seller', 'provider',
        'invoice #', 'bill #', 'ref #',
        'total', 'subtotal', 'tax', 'vat', 'gst',
        'due date', 'payment due', 'amount due'
      ];

      const text = ocrResult.text.toLowerCase();
      const foundKeywords = invoiceKeywords.filter(keyword => text.includes(keyword));
      
      const confidence = Math.min(foundKeywords.length / 5, 1); // Cap at 5 keywords
      const isInvoice = confidence > 0.3; // Require at least 2 keywords

      const reasoning = isInvoice 
        ? `Found ${foundKeywords.length} invoice keywords: ${foundKeywords.slice(0, 3).join(', ')}`
        : `Only found ${foundKeywords.length} invoice keywords (need at least 2)`;

      console.log('INVOICE_DETECTION:', {
        isInvoice,
        confidence,
        foundKeywords,
        reasoning
      });

      return {
        isInvoice,
        confidence,
        reasoning
      };

    } catch (error) {
      console.error('INVOICE_DETECTION_ERROR:', error);
      return {
        isInvoice: false,
        confidence: 0,
        reasoning: 'Error during invoice detection'
      };
    }
  }

  /**
   * Quick OCR for invoice detection
   */
  private static async performQuickOCR(imageUrl: string): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Quick OCR timeout'));
      }, 5000); // 5 second timeout for quick check

      createWorker('eng', 1)
        .then(worker => {
          return worker
            .recognize(imageUrl)
            .then(({ data: { text, confidence } }) => {
              clearTimeout(timeoutId);
              worker.terminate();
              resolve({
                text: text,
                confidence: confidence / 100
              });
            })
            .catch(error => {
              clearTimeout(timeoutId);
              worker.terminate();
              reject(error);
            });
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Get processing statistics
   */
  static getProcessingStats(result: InvoiceScanResult): {
    success: boolean;
    ocrQuality: 'excellent' | 'good' | 'fair' | 'poor';
    preprocessingEffective: boolean;
    dataCompleteness: number;
  } {
    if (!result.success || !result.invoiceData) {
      return {
        success: false,
        ocrQuality: 'poor',
        preprocessingEffective: false,
        dataCompleteness: 0
      };
    }

    const { invoiceData, ocrConfidence, preprocessing } = result;

    // OCR Quality assessment
    let ocrQuality: 'excellent' | 'good' | 'fair' | 'poor';
    if (ocrConfidence > 0.9) ocrQuality = 'excellent';
    else if (ocrConfidence > 0.8) ocrQuality = 'good';
    else if (ocrConfidence > 0.6) ocrQuality = 'fair';
    else ocrQuality = 'poor';

    // Preprocessing effectiveness
    const preprocessingEffective = preprocessing ? 
      preprocessing.quality.sharpness > 0.5 && preprocessing.quality.contrast > 0.5 : false;

    // Data completeness
    const fields = [
      invoiceData.vendorName,
      invoiceData.invoiceNumber,
      invoiceData.invoiceDate,
      invoiceData.grandTotal
    ];
    const dataCompleteness = fields.filter(Boolean).length / fields.length;

    return {
      success: true,
      ocrQuality,
      preprocessingEffective,
      dataCompleteness
    };
  }
}
