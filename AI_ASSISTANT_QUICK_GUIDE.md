# AI Assistant Quick Reference Guide

## Overview

Magnus System v3 includes intelligent AI assistance across key workflows. All AI features are:
- ✅ **Optional** - Can be ignored completely
- ✅ **Non-destructive** - Never auto-overwrites data
- ✅ **Editable** - Full control before accepting
- ✅ **Fast** - Instant processing, no API delays
- ✅ **Private** - All processing happens locally

## Feature Summary

| Feature | Location | Purpose | Time Saved |
|---------|----------|---------|------------|
| AI Assistant Panel | BOQ, Expenses, Field Ops | Context-aware suggestions | Varies |
| Daily Log Enhancer | Field Ops → Daily Log | Transform notes into professional logs | 80% |
| Receipt Categorizer | Expenses → Add Expense | Auto-categorize receipts | 90% |

## 1. AI Assistant Panel

**Available On:**
- BOQ Builder page
- Expenses page
- Field Ops page

**How to Use:**
1. Look for floating sparkle button (bottom-right corner)
2. Badge shows count of high-priority suggestions
3. Click to expand panel
4. Review suggestions
5. Click action buttons to navigate/open modals
6. Close panel when done

**What It Does:**
- Detects current page context
- Analyzes your data
- Generates relevant suggestions
- Provides actionable next steps
- Color-coded by priority (yellow=warning, blue=important)

**Examples:**

**BOQ Page:**
- "Help me build my BOQ" (when empty)
- "Import from Takeoff" → Opens import modal
- "Missing Units" warning (if items lack units)
- "Export to Procurement" (when ready)

**Expenses Page:**
- "Explain this expense" (when adding new)
- "Upload Receipt" → Opens expense form
- "Assign Cost Codes" warning (if missing)
- "Track Against Budget" → View finance page

**Field Ops Page:**
- "Summarize daily log" (create today's log)
- "Capture Photos" → Opens photo modal
- "Logging Gap Detected" (3+ days without logs)
- "Document Delays" (weather/issues detected)

## 2. Daily Log Enhancer

**Location:** Field Ops → Daily Log → Quick Notes section

**When to Use:**
- You have rough notes from the field
- You want professional formatting
- You need to organize scattered thoughts
- You're in a hurry

**How to Use:**

1. Open daily log form
2. Type rough notes in "Quick Notes" field:
   ```
   installed drywall bedroom
   lumber delivered
   rain delay 2hr
   waiting electrician
   ```
3. Click "Enhance with AI" button (gradient purple-blue)
4. Review organized sections:
   - Work Performed: "Installed drywall bedroom."
   - Deliveries: "Lumber delivered."
   - Issues: "Rain delay 2hr."
   - Notes: "Waiting electrician."
5. Click Edit button if you want to change anything
6. Edit any section in the textareas
7. Click "Accept & Apply"
8. Form fields auto-populate
9. Add weather, worker count, etc.
10. Click "Save Log"

**Tips:**
- Write naturally, any format works
- Separate different topics with line breaks
- AI detects keywords like "install", "deliver", "problem"
- Confidence badge shows how sure AI is (green=high)
- Edit mode lets you tweak suggestions
- Original notes preserved (can re-enhance)

**Keywords AI Recognizes:**

**Work:** install, complete, finish, build, frame, pour, demo
**Deliveries:** deliver, arrived, received, shipment
**Issues:** issue, problem, delay, rain, snow, wait

## 3. Receipt Categorizer

**Location:** Expenses → Add Expense → After OCR acceptance

**When to Use:**
- After uploading receipt photo
- After OCR extracts vendor/amount
- You want smart category suggestions
- You're processing multiple receipts

**How to Use:**

1. Open Expenses → Add Expense
2. Upload receipt image
3. Wait for OCR processing
4. Review OCR preview (vendor, date, amount)
5. Click "Accept OCR Data"
6. **AI Categorizer opens automatically**
7. Review detected information:
   - Vendor Type (if recognized)
   - Suggested Category (dropdown)
   - Description (editable)
   - Confidence score
   - Reasoning explanation
8. Edit category dropdown if needed
9. Edit description if needed
10. Click "Apply Categorization"
11. Complete remaining fields
12. Click "Create Expense"

**Recognized Vendors:**

| Vendor | Type | Category |
|--------|------|----------|
| Home Depot | Materials Supplier | Materials |
| Lowe's | Materials Supplier | Materials |
| Menards | Materials Supplier | Materials |
| 84 Lumber | Lumber Supplier | Materials |
| Ace Hardware | Hardware Store | Materials |
| Grainger | Industrial Supplier | Equipment |
| United Rentals | Equipment Rental | Equipment Rental |
| Sunbelt Rentals | Equipment Rental | Equipment Rental |
| Sherwin Williams | Paint Supplier | Materials |
| Ferguson | Plumbing Supplier | Materials |
| Fastenal | Industrial Supplier | Materials |

**Keyword Detection:**

**Materials:** lumber, concrete, drywall, paint, steel, rebar, plywood
**Equipment:** drill, saw, hammer, equipment, rental, tool, machinery
**Labor:** crew, workers, labor, subcontractor, carpenter, electrician
**Permits:** permit, inspection, fee, license, approval
**Utilities:** electric, water, gas, power, utility
**Safety:** ppe, safety, harness, helmet, gloves, boots
**Supplies:** supplies, hardware, fasteners, screws, nails

**Smart Defaults:**
- Amount <$50 → Office Supplies (50% confidence)
- Amount >$1000 → Materials (60% confidence)
- Unknown vendor + no keywords → Miscellaneous (30% confidence)

## Confidence Scores

**How to Interpret:**

| Score | Color | Meaning | Action |
|-------|-------|---------|--------|
| 90%+ | Green | Very confident | Trust and accept |
| 70-89% | Green | Confident | Review and likely accept |
| 50-69% | Yellow | Moderate | Review carefully, maybe edit |
| 30-49% | Gray | Low | Review closely, likely edit |
| <30% | Gray | Very low | Probably ignore |

**What Affects Confidence:**

**Daily Log:**
- Number of sections populated (more = higher)
- Keyword matches (more = higher)
- Text length (longer = higher)

**Receipt:**
- Known vendor (90%)
- Keyword match (70%)
- Amount-based guess (30-60%)
- Unknown with no keywords (30%)

## Common Workflows

### Morning Site Check

```
1. Arrive on site
2. Take mental notes during walkthrough
3. Open Field Ops → Daily Log
4. Type rough notes in Quick Notes
5. Click "Enhance with AI"
6. Review and accept
7. Add weather and crew count
8. Save log

Total time: 30 seconds
```

### Receipt Processing

```
1. Collect receipts during day
2. At end of day, open Expenses
3. For each receipt:
   a. Add Expense
   b. Upload photo
   c. Accept OCR
   d. Review AI category
   e. Apply categorization
   f. Select project
   g. Create expense

Time per receipt: 15 seconds
Total for 10 receipts: 2.5 minutes
```

### Weekly Review

```
1. Open AI Assistant panel on any page
2. Review suggestions
3. Follow action buttons:
   - "Missing Units" → Fix BOQ items
   - "Assign Cost Codes" → Update expenses
   - "Logging Gap" → Create missing logs
4. Clear all high-priority items
5. Close panel

Total time: 5-10 minutes
```

## Troubleshooting

### Daily Log Enhancer

**Problem:** "Enhance with AI" button is disabled
- **Cause:** Less than 10 characters in Quick Notes
- **Solution:** Type at least 10 characters

**Problem:** AI didn't categorize correctly
- **Cause:** Unclear keywords or mixed content
- **Solution:** Click Edit button, manually fix sections

**Problem:** Confidence is low (30%)
- **Cause:** No recognizable keywords
- **Solution:** Either edit suggestions or type directly in form fields

**Problem:** Modal won't close
- **Cause:** Click outside modal or use X button
- **Solution:** Click "Ignore" or X button

### Receipt Categorizer

**Problem:** Wrong category suggested
- **Cause:** Vendor not recognized or misleading keywords
- **Solution:** Select correct category from dropdown

**Problem:** Description is generic
- **Cause:** OCR didn't extract detailed text
- **Solution:** Edit description textarea before applying

**Problem:** Vendor type not detected
- **Cause:** Vendor not in known vendor database
- **Solution:** Normal, still works - just no badge shown

**Problem:** Category not in dropdown
- **Cause:** Category not active in company settings
- **Solution:** Go to Settings → Expense Categories to add

### AI Assistant Panel

**Problem:** Panel is empty (no suggestions)
- **Cause:** No high-priority items detected
- **Solution:** Normal - shows "All Set!" message

**Problem:** Badge count seems wrong
- **Cause:** Only counts high-priority suggestions
- **Solution:** Open panel to see all suggestions

**Problem:** Action button does nothing
- **Cause:** Navigation or modal trigger issue
- **Solution:** Refresh page and try again

## Best Practices

### Daily Logs

✅ **Do:**
- Write naturally in Quick Notes
- Use line breaks to separate topics
- Include delivery details (what, from where)
- Mention any delays or issues
- Note pending items

❌ **Don't:**
- Try to format text perfectly (AI does this)
- Skip Quick Notes section (it's faster than manual)
- Worry about capitalization or punctuation
- Include sensitive information

### Receipt Categorization

✅ **Do:**
- Always review AI suggestions
- Override category if wrong
- Edit description to add project specifics
- Check OCR text preview for details
- Accept when confidence is 70%+

❌ **Don't:**
- Blindly accept low confidence (<50%)
- Skip reviewing vendor and amount
- Forget to select project
- Leave description generic

### AI Assistant Panel

✅ **Do:**
- Check panel regularly (once per session)
- Address high-priority items (yellow/blue)
- Use action buttons for quick navigation
- Close panel to reduce clutter

❌ **Don't:**
- Leave high-priority items unresolved
- Ignore warnings (missing units, cost codes)
- Expect panel to auto-popup (it doesn't)

## Keyboard Shortcuts

Currently none implemented. Coming in Phase 3:
- `Alt+A` - Toggle AI Assistant panel
- `Alt+E` - Enhance daily log (when in Quick Notes)
- `Alt+C` - Open categorizer (when receipt ready)
- `Esc` - Close any AI modal

## Privacy & Security

**What AI Can See:**
- Current page context (BOQ, Expenses, Field Ops)
- Data you explicitly provide (quick notes, OCR results)
- Project information (if selected)
- Company categories (from database)

**What AI Cannot See:**
- Other users' data
- Other projects' data
- Passwords or credentials
- Financial totals or reports
- Anything you don't explicitly provide

**Where Processing Happens:**
- 100% client-side (in your browser)
- No data sent to external servers
- No OpenAI or Claude API calls
- All algorithms run locally
- Complete privacy

**Data Storage:**
- AI suggestions are not stored
- Only data you manually save goes to database
- No tracking of AI usage (yet)
- No analytics sent anywhere

## FAQ

**Q: Is AI required to use Magnus System?**
A: No. All AI features are optional enhancements.

**Q: Does AI cost extra?**
A: No. Phase 1 & 2 use rule-based AI (no API costs).

**Q: Can I disable AI features?**
A: Yes. Simply don't click the AI buttons. They won't interfere.

**Q: How accurate is the AI?**
A: 70-90% for recognized vendors, 50-70% for keywords, 30-50% for unknowns.

**Q: Can AI learn from my corrections?**
A: Not yet. Planned for Phase 3.

**Q: Does AI work offline?**
A: Yes. All processing is local, no internet required.

**Q: What if AI suggests something wrong?**
A: Edit the suggestion before accepting, or ignore it entirely.

**Q: Can I re-enhance after accepting?**
A: Yes. Quick Notes are preserved, enhance again if needed.

**Q: How many receipts can I process at once?**
A: Currently one at a time. Batch processing planned for Phase 3.

**Q: What languages does AI support?**
A: Currently English only. Multi-language planned for future.

## Getting Help

**In-App:**
- Hover over AI features for tooltips (coming soon)
- Check confidence scores for trust level
- Review reasoning text in categorizer

**Documentation:**
- AI_ASSISTANT_PHASE1_COMPLETE.md - Technical details
- AI_ASSISTANT_PHASE2_COMPLETE.md - Implementation guide
- AI_ASSISTANT_INTEGRATION_GUIDE.md - Developer guide

**Support:**
- Contact your system administrator
- Report issues through standard support channel
- Suggest improvements via feedback form

---

**Last Updated:** Phase 2 Complete
**Version:** 2.0
**Features:** AI Panel, Daily Log Enhancer, Receipt Categorizer
