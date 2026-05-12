// Worker Tax Configuration Integration Testing
// PHASE 2B STEP 4 INTEGRATION TESTING ONLY — NOT ACTIVE PAYROLL

import { fetchWorkerTaxInfo, upsertWorkerTaxInfo, validateNISNumber, validateTRN, sanitizePayrollCountry } from './payroll';
import type { WorkerTaxInfo } from './payroll';

export interface WorkerTaxTestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

export class WorkerTaxTester {
  private companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
  }

  // Test 1: Verify fetchWorkerTaxInfo works with existing workers
  async testFetchExistingWorker(workerId: string): Promise<WorkerTaxTestResult> {
    try {
      console.log(`Testing fetchWorkerTaxInfo for worker: ${workerId}`);
      const taxInfo = await fetchWorkerTaxInfo(workerId);
      
      if (!taxInfo) {
        return {
          testName: 'Fetch Existing Worker Tax Info',
          passed: true,
          message: 'No existing tax info found (expected for new workers)',
          details: { workerId, taxInfo: null }
        };
      }

      // Verify required US fields exist
      const requiredUSFields = ['filing_status', 'federal_allowances', 'is_exempt_federal'];
      const missingUSFields = requiredUSFields.filter(field => !(field in taxInfo));
      
      if (missingUSFields.length > 0) {
        return {
          testName: 'Fetch Existing Worker Tax Info',
          passed: false,
          message: `Missing required US fields: ${missingUSFields.join(', ')}`,
          details: { workerId, missingUSFields, taxInfo }
        };
      }

      // Verify Jamaican fields are optional (can be null/undefined)
      const jamaicanFields = ['nis_number', 'tax_file_number', 'trn', 'payroll_country', 'jamaican_payroll_enabled'];
      const jamaianFieldStatus = jamaicanFields.map(field => ({
        field,
        value: taxInfo[field as keyof WorkerTaxInfo],
        isNull: taxInfo[field as keyof WorkerTaxInfo] == null
      }));

      return {
        testName: 'Fetch Existing Worker Tax Info',
        passed: true,
        message: 'Successfully fetched tax info with proper field structure',
        details: { 
          workerId, 
          taxInfo,
          jamaianFieldStatus,
          hasUSFields: requiredUSFields.every(field => field in taxInfo)
        }
      };

    } catch (error) {
      return {
        testName: 'Fetch Existing Worker Tax Info',
        passed: false,
        message: `Error fetching tax info: ${error}`,
        details: { workerId, error }
      };
    }
  }

  // Test 2: Verify upsertWorkerTaxInfo persists Jamaican fields
  async testUpsertJamaicanFields(workerId: string): Promise<WorkerTaxTestResult> {
    try {
      console.log(`Testing upsertWorkerTaxInfo for worker: ${workerId}`);
      
      const testData = {
        // US fields (preserve existing)
        filing_status: 'single' as const,
        federal_allowances: 1,
        additional_federal_withholding: 0,
        state_allowances: 0,
        additional_state_withholding: 0,
        health_insurance: 0,
        retirement_401k_percent: 0,
        retirement_401k_fixed: 0,
        is_exempt_federal: false,
        is_exempt_state: false,
        is_exempt_fica: false,
        
        // Jamaican fields (test persistence)
        nis_number: '1234567',
        tax_file_number: '123-456-789',
        trn: 'TEMP-123',
        payroll_country: 'JM',
        jamaican_payroll_enabled: true,
        is_exempt_nis: false,
        is_exempt_nht: true,
        is_exempt_education_tax: false,
        is_exempt_paye: false,
        statutory_notes: 'Test statutory notes for integration testing',
      };

      console.log('Upserting test data:', testData);
      const savedTaxInfo = await upsertWorkerTaxInfo(workerId, this.companyId, testData);
      
      // Verify all fields were saved correctly
      const verificationErrors: string[] = [];
      
      // Check US fields
      if (savedTaxInfo.federal_allowances !== testData.federal_allowances) {
        verificationErrors.push(`federal_allowances: expected ${testData.federal_allowances}, got ${savedTaxInfo.federal_allowances}`);
      }
      
      // Check Jamaican fields
      if (savedTaxInfo.nis_number !== testData.nis_number) {
        verificationErrors.push(`nis_number: expected ${testData.nis_number}, got ${savedTaxInfo.nis_number}`);
      }
      
      if (savedTaxInfo.payroll_country !== testData.payroll_country) {
        verificationErrors.push(`payroll_country: expected ${testData.payroll_country}, got ${savedTaxInfo.payroll_country}`);
      }
      
      if (savedTaxInfo.jamaican_payroll_enabled !== testData.jamaican_payroll_enabled) {
        verificationErrors.push(`jamaican_payroll_enabled: expected ${testData.jamaican_payroll_enabled}, got ${savedTaxInfo.jamaican_payroll_enabled}`);
      }

      if (verificationErrors.length > 0) {
        return {
          testName: 'Upsert Jamaican Fields',
          passed: false,
          message: `Field verification failed: ${verificationErrors.join(', ')}`,
          details: { workerId, testData, savedTaxInfo, verificationErrors }
        };
      }

      // Test fetch after upsert to verify persistence
      const fetchedTaxInfo = await fetchWorkerTaxInfo(workerId);
      
      if (!fetchedTaxInfo) {
        return {
          testName: 'Upsert Jamaican Fields',
          passed: false,
          message: 'Failed to fetch tax info after upsert',
          details: { workerId, savedTaxInfo }
        };
      }

      const persistenceErrors: string[] = [];
      
      if (fetchedTaxInfo.nis_number !== testData.nis_number) {
        persistenceErrors.push(`nis_number persistence failed`);
      }
      
      if (fetchedTaxInfo.payroll_country !== testData.payroll_country) {
        persistenceErrors.push(`payroll_country persistence failed`);
      }

      if (persistenceErrors.length > 0) {
        return {
          testName: 'Upsert Jamaican Fields',
          passed: false,
          message: `Persistence verification failed: ${persistenceErrors.join(', ')}`,
          details: { workerId, testData, fetchedTaxInfo, persistenceErrors }
        };
      }

      return {
        testName: 'Upsert Jamaican Fields',
        passed: true,
        message: 'Successfully upserted and verified Jamaican field persistence',
        details: { workerId, testData, savedTaxInfo, fetchedTaxInfo }
      };

    } catch (error) {
      return {
        testName: 'Upsert Jamaican Fields',
        passed: false,
        message: `Error upserting tax info: ${error}`,
        details: { workerId, error }
      };
    }
  }

  // Test 3: Verify validation helpers work correctly
  testValidationHelpers(): WorkerTaxTestResult[] {
    const results: WorkerTaxTestResult[] = [];

    // Test NIS validation
    const nisTests = [
      { input: '1234567', expected: true, description: 'Valid NIS (7 digits)' },
      { input: '123456', expected: false, description: 'Invalid NIS (6 digits)' },
      { input: '12345678', expected: false, description: 'Invalid NIS (8 digits)' },
      { input: 'abc1234', expected: false, description: 'Invalid NIS (contains letters)' },
      { input: '', expected: true, description: 'Empty NIS (optional field)' },
      { input: null, expected: true, description: 'Null NIS (optional field)' },
    ];

    nisTests.forEach(test => {
      const result = validateNISNumber(test.input);
      const passed = result.valid === test.expected;
      
      results.push({
        testName: `NIS Validation - ${test.description}`,
        passed,
        message: passed ? 'Validation passed' : `Expected ${test.expected}, got ${result.valid}`,
        details: { input: test.input, expected: test.expected, actual: result.valid, error: result.error }
      });
    });

    // Test TRN validation
    const trnTests = [
      { input: '123-456-789', expected: true, description: 'Valid TRN (with dashes)' },
      { input: '123456789', expected: true, description: 'Valid TRN (without dashes)' },
      { input: '12345678', expected: false, description: 'Invalid TRN (8 digits)' },
      { input: '1234567890', expected: false, description: 'Invalid TRN (10 digits)' },
      { input: 'abc-456-789', expected: false, description: 'Invalid TRN (contains letters)' },
      { input: '', expected: true, description: 'Empty TRN (optional field)' },
      { input: null, expected: true, description: 'Null TRN (optional field)' },
    ];

    trnTests.forEach(test => {
      const result = validateTRN(test.input);
      const passed = result.valid === test.expected;
      
      results.push({
        testName: `TRN Validation - ${test.description}`,
        passed,
        message: passed ? 'Validation passed' : `Expected ${test.expected}, got ${result.valid}`,
        details: { input: test.input, expected: test.expected, actual: result.valid, error: result.error }
      });
    });

    // Test country sanitization
    const countryTests = [
      { input: 'US', expected: 'US', description: 'US (already valid)' },
      { input: 'USA', expected: 'US', description: 'USA (normalized)' },
      { input: 'us', expected: 'US', description: 'us (case normalized)' },
      { input: 'JM', expected: 'JM', description: 'JM (already valid)' },
      { input: 'Jamaica', expected: 'JM', description: 'Jamaica (normalized)' },
      { input: 'jamaica', expected: 'JM', description: 'jamaica (case normalized)' },
      { input: '', expected: 'US', description: 'Empty (default to US)' },
      { input: null, expected: 'US', description: 'Null (default to US)' },
      { input: 'CA', expected: 'CA', description: 'CA (unrecognized, returned as-is)' },
    ];

    countryTests.forEach(test => {
      const result = sanitizePayrollCountry(test.input);
      const passed = result === test.expected;
      
      results.push({
        testName: `Country Sanitization - ${test.description}`,
        passed,
        message: passed ? 'Sanitization passed' : `Expected ${test.expected}, got ${result}`,
        details: { input: test.input, expected: test.expected, actual: result }
      });
    });

    return results;
  }

  // Test 4: Verify backward compatibility with workers without Jamaican fields
  async testBackwardCompatibility(workerId: string): Promise<WorkerTaxTestResult> {
    try {
      console.log(`Testing backward compatibility for worker: ${workerId}`);
      
      // First, save only US fields (simulate existing worker)
      const usOnlyData = {
        filing_status: 'married' as const,
        federal_allowances: 2,
        additional_federal_withholding: 50,
        state_allowances: 1,
        additional_state_withholding: 25,
        health_insurance: 200,
        retirement_401k_percent: 5,
        retirement_401k_fixed: 100,
        is_exempt_federal: false,
        is_exempt_state: false,
        is_exempt_fica: true,
        // Jamaican fields omitted (simulate existing worker)
      };

      console.log('Saving US-only data:', usOnlyData);
      const savedTaxInfo = await upsertWorkerTaxInfo(workerId, this.companyId, usOnlyData);
      
      // Verify US fields are saved
      if (savedTaxInfo.federal_allowances !== usOnlyData.federal_allowances) {
        return {
          testName: 'Backward Compatibility',
          passed: false,
          message: 'US fields not saved correctly',
          details: { workerId, usOnlyData, savedTaxInfo }
        };
      }

      // Verify Jamaican fields are null/undefined (not set)
      const jamaicanFields = ['nis_number', 'tax_file_number', 'trn', 'payroll_country', 'jamaican_payroll_enabled'];
      const nonNullJamaicanFields = jamaicanFields.filter(field => 
        savedTaxInfo[field as keyof WorkerTaxInfo] != null
      );

      if (nonNullJamaicanFields.length > 0) {
        return {
          testName: 'Backward Compatibility',
          passed: false,
          message: `Unexpected Jamaican fields set: ${nonNullJamaicanFields.join(', ')}`,
          details: { workerId, usOnlyData, savedTaxInfo, nonNullJamaicanFields }
        };
      }

      // Test fetch works correctly
      const fetchedTaxInfo = await fetchWorkerTaxInfo(workerId);
      
      if (!fetchedTaxInfo) {
        return {
          testName: 'Backward Compatibility',
          passed: false,
          message: 'Failed to fetch US-only tax info',
          details: { workerId, savedTaxInfo }
        };
      }

      // Verify US fields are preserved in fetch
      if (fetchedTaxInfo.federal_allowances !== usOnlyData.federal_allowances) {
        return {
          testName: 'Backward Compatibility',
          passed: false,
          message: 'US fields not preserved in fetch',
          details: { workerId, usOnlyData, fetchedTaxInfo }
        };
      }

      // Test that adding Jamaican fields later works
      const mixedData = {
        ...usOnlyData,
        nis_number: '7654321',
        payroll_country: 'JM',
        jamaican_payroll_enabled: true,
      };

      console.log('Adding Jamaican fields to existing worker:', mixedData);
      const mixedTaxInfo = await upsertWorkerTaxInfo(workerId, this.companyId, mixedData);

      if (mixedTaxInfo.nis_number !== mixedData.nis_number) {
        return {
          testName: 'Backward Compatibility',
          passed: false,
          message: 'Failed to add Jamaican fields to existing worker',
          details: { workerId, mixedData, mixedTaxInfo }
        };
      }

      return {
        testName: 'Backward Compatibility',
        passed: true,
        message: 'Successfully tested backward compatibility with US-only workers',
        details: { 
          workerId, 
          usOnlyData, 
          savedTaxInfo, 
          fetchedTaxInfo, 
          mixedData, 
          mixedTaxInfo 
        }
      };

    } catch (error) {
      return {
        testName: 'Backward Compatibility',
        passed: false,
        message: `Error testing backward compatibility: ${error}`,
        details: { workerId, error }
      };
    }
  }

  // Run all integration tests
  async runAllTests(workerId: string): Promise<WorkerTaxTestResult[]> {
    console.log(`Starting Worker Tax Configuration integration tests for worker: ${workerId}`);
    
    const results: WorkerTaxTestResult[] = [];
    
    // Test 1: Fetch existing worker
    results.push(await this.testFetchExistingWorker(workerId));
    
    // Test 2: Upsert Jamaican fields
    results.push(await this.testUpsertJamaicanFields(workerId));
    
    // Test 3: Validation helpers
    results.push(...this.testValidationHelpers());
    
    // Test 4: Backward compatibility
    results.push(await this.testBackwardCompatibility(workerId));
    
    console.log(`Completed ${results.length} integration tests`);
    console.log('Results:', results);
    
    return results;
  }

  // Generate test report
  generateTestReport(results: WorkerTaxTestResult[]): string {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    let report = `Worker Tax Configuration Integration Test Report\n`;
    report += `================================================\n`;
    report += `Total Tests: ${results.length}\n`;
    report += `Passed: ${passed}\n`;
    report += `Failed: ${failed}\n`;
    report += `Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n\n`;
    
    if (failed > 0) {
      report += `FAILED TESTS:\n`;
      report += `-------------\n`;
      results.filter(r => !r.passed).forEach(result => {
        report += `❌ ${result.testName}\n`;
        report += `   Message: ${result.message}\n`;
        if (result.details) {
          report += `   Details: ${JSON.stringify(result.details, null, 2)}\n`;
        }
        report += `\n`;
      });
    }
    
    report += `PASSED TESTS:\n`;
    report += `-------------\n`;
    results.filter(r => r.passed).forEach(result => {
      report += `✅ ${result.testName}\n`;
      report += `   Message: ${result.message}\n`;
      report += `\n`;
    });
    
    return report;
  }
}
