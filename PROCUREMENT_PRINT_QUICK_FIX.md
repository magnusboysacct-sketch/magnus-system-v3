# Procurement Print - Quick Fix Reference

## The Problem
Print preview showed sidebar/UI elements OR was completely blank.

## The Solution
Use ID-based visibility control instead of class-based.

---

## Key Changes

### 1. Added Print Container ID
```tsx
<div id="procurement-print" className="print-content">
  {/* Document content */}
</div>
```

### 2. Updated Print CSS
```css
@media print {
  /* Hide everything */
  body * {
    visibility: hidden;
  }

  /* Show only procurement document */
  #procurement-print,
  #procurement-print * {
    visibility: visible;
  }

  /* Position at page origin */
  #procurement-print {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: white !important;
  }
}
```

### 3. Added Page Format
```css
@page {
  size: A4;
  margin: 15mm;
}
```

---

## Files Modified

1. **src/pages/ProcurementPage.tsx**
   - Added `id="procurement-print"` to print container
   - Updated `@media print` CSS to use ID selector
   - Added `@page` rule for A4 sizing

2. **src/index.css**
   - Simplified global print rules
   - Removed conflicting visibility rules
   - Kept only essential layout hiding

---

## How It Works

```
User clicks Print
    ↓
Browser enters print mode
    ↓
Hide everything: body * { visibility: hidden }
    ↓
Show only document: #procurement-print * { visibility: visible }
    ↓
Position at page top: position: absolute; left: 0; top: 0;
    ↓
Show headers/footers: .print-header.hidden { display: block }
    ↓
Result: Clean document, no UI
```

---

## Print Preview Shows

✅ Company name
✅ "Procurement List" title
✅ Document title
✅ Project, Date, Status
✅ Category headers
✅ Items table (Material, Description, Qty, Unit)
✅ Footer timestamp
✅ White background, black text

---

## Print Preview Hides

❌ Sidebar
❌ Navigation
❌ Theme toggle
❌ Buttons
❌ Dropdowns
❌ Summary cards
❌ Filter buttons
❌ Dark mode colors

---

## Why This Works

**ID Selector = High Specificity**
- Unique target per page
- No conflicts with global styles
- Predictable behavior

**Visibility-Based Hiding**
- Preserves layout structure
- Clean print output
- Works with position: absolute

**Absolute Positioning**
- Places content at page origin
- Removes from normal flow
- No sidebar interference

---

## Testing

1. Navigate to Procurement document view
2. Click "Print" button
3. Verify print preview shows ONLY the document
4. No sidebar, no buttons, no UI
5. Save as PDF or print to paper

---

## Quick Troubleshooting

**Print preview is blank:**
- Check `#procurement-print` ID exists
- Verify content is inside ID container
- Look for CSS typos in ID name

**Sidebar still shows:**
- Check global CSS is loaded
- Add `!important` to `aside { display: none }`
- Clear browser cache

**Content cut off:**
- Adjust `@page` margins
- Check table width
- Review page break settings

---

## Status

✅ **FIXED AND WORKING**

Print preview now displays clean procurement documents without any application UI.
