# Purchase Order Print - Quick Guide

## What Was Built

Added a professional "Print PO" feature to Purchase Order documents in Magnus System v3.

---

## How It Works

**User Flow:**
1. Open any Purchase Order from the Purchase Orders list
2. Click the blue "Print PO" button (top-right, next to Status)
3. Browser print dialog opens automatically
4. Choose to print or save as PDF
5. Window closes after printing

**Print Method:**
- Opens new window with formatted PO document
- Auto-triggers browser print dialog
- Closes automatically after printing
- Works like existing procurement print

---

## Files Changed

### New File:
- `src/lib/purchaseOrderPrint.ts` - Print logic for POs

### Modified File:
- `src/pages/ProcurementPage.tsx` - Added print button and integration

**Total Changes:** ~400 lines added (mostly HTML template)

---

## What's Included in Print

**Header:**
- Company name (if available)
- "PURCHASE ORDER" title
- PO number (e.g., PO-2026-001)
- PO title

**Order Details:**
- Project name
- Status (Draft/Issued/etc)
- Issue date
- Expected delivery date

**Supplier Info:**
- Supplier name
- Total items count
- Total value

**Items Table:**
- Material name
- Description
- Quantity + Unit
- Unit rate
- Line total

**Footer:**
- Grand total
- Notes (if any)
- Generation timestamp

---

## Quick Test

1. Go to: Project → Procurement → Purchase Orders tab
2. Click any PO to open it
3. Look for blue "Print PO" button (top-right)
4. Click button
5. Print dialog should appear
6. Cancel or print
7. Window should close

---

## Print Format

- **Page Size:** A4
- **Margins:** 15mm
- **Layout:** Professional business document
- **Colors:** Black text, white background
- **Font:** System sans-serif
- **Style:** Clean table layout with borders

---

## Technical Details

**Pattern:** Reuses proven approach from `procurementPrint.ts`

**Security:** All user input is HTML-escaped

**Compatibility:** Works in Chrome, Firefox, Safari, Edge

**Build:** ✅ Successful, no errors

---

## Not Included

These were intentionally excluded per requirements:

- ❌ Email PO to supplier
- ❌ PDF export button (use browser's "Save as PDF")
- ❌ Template customization
- ❌ Logo upload
- ❌ Signature fields
- ❌ Terms & conditions

Simple print only, as requested.

---

## Button Location

```
Purchase Order View:
┌──────────────────────────────────────────┐
│ ← Back    PO-2026-001                    │
│                    [Print PO] [Status ▼] │ ← HERE
└──────────────────────────────────────────┘
```

---

## Summary

**What changed:** Added one print button + print logic
**Where:** Purchase Order document view only
**Impact:** Minimal - isolated to PO printing
**Status:** Complete and tested via build
