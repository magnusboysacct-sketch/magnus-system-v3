# AI Assistant Integration Guide

## Quick Start

### Adding AI Assistant to a Page

**1. Import the Component**

```typescript
import AIAssistantPanel from "../components/AIAssistantPanel";
```

**2. Add to Your Page**

```tsx
<AIAssistantPanel
  context="boq"
  currentData={myData}
  projectId={currentProject?.id}
  onAction={handleAIAction}
/>
```

**3. Handle Actions**

```typescript
function handleAIAction(action: string, data: any) {
  if (action === "Browse Smart Library") {
    navigate(data.route);
  } else if (action === "Create Assembly") {
    navigate(data.route);
  }
  // Add more action handlers as needed
}
```

## Context Types

Choose the appropriate context for your page:

| Context | Use Case | Example Pages |
|---------|----------|---------------|
| `"estimating"` | Creating/editing estimates | EstimatesPage |
| `"boq"` | BOQ Builder workflows | BOQPage |
| `"procurement"` | Procurement & PO management | ProcurementPage |
| `"daily_log"` | Daily site logging | FieldOpsPage |
| `"expense"` | Expense entry | ExpensesPage |
| `"takeoff"` | Takeoff measurements | TakeoffPage |
| `"general"` | General purpose | Any page |

## Current Data Examples

Provide context-specific data to get relevant suggestions:

### BOQ Context

```typescript
const currentData = {
  itemCount: boqItems.length,
  missingUnits: boqItems.filter(i => !i.unit).length,
  hasContingency: boqItems.some(i =>
    i.item_name.toLowerCase().includes("contingency")
  )
};
```

### Procurement Context

```typescript
const currentData = {
  hasUnlinkedItems: items.filter(i => !i.supplier_id).length > 0,
  pendingPOs: purchaseOrders.filter(p => p.status === "pending").length
};
```

### Daily Log Context

```typescript
const currentData = {
  hasLogToday: !!todayLog,
  consecutiveDaysWithoutLog: calculateConsecutiveDays(logs)
};
```

### Expense Context

```typescript
const currentData = {
  missingCostCodes: expenses.filter(e => !e.cost_code).length,
  duplicateWarning: detectPossibleDuplicate(expenses, currentExpense)
};
```

### Estimating Context

```typescript
const currentData = {
  hasItems: estimate.items?.length > 0,
  hasContingency: estimate.items?.some(i =>
    i.description.toLowerCase().includes("contingency")
  )
};
```

## Action Handling

Suggestions can include actions. Handle them in your `onAction` callback:

```typescript
function handleAIAction(action: string, data: any) {
  switch (action) {
    case "Browse Smart Library":
      navigate("/rates");
      break;

    case "Create Assembly":
      navigate("/assemblies");
      break;

    case "Create Daily Log":
      setShowLogModal(true);
      break;

    case "Export to BOQ":
      handleExportToBOQ();
      break;

    default:
      console.log("Unhandled action:", action, data);
  }
}
```

## Styling & Positioning

The AI Assistant uses fixed positioning and appears in the bottom-right corner:

- **Z-index:** 50 (above most content)
- **Position:** Fixed, bottom: 24px, right: 24px
- **Width:** 384px (24rem)
- **Max Height:** 600px with scroll

### Avoiding Conflicts

If your page has other fixed/absolute elements in the bottom-right:

```tsx
// Option 1: Hide assistant on certain pages
{!isFullScreenMode && (
  <AIAssistantPanel context="boq" currentData={data} />
)}

// Option 2: Adjust Z-index if needed
// (Modify AIAssistantPanel component)
```

## Best Practices

### DO ✅

**Update Current Data**
```typescript
useEffect(() => {
  setCurrentData({
    itemCount: items.length,
    missingUnits: items.filter(i => !i.unit).length
  });
}, [items]);
```

**Provide Rich Context**
```typescript
const currentData = {
  // Specific, actionable data
  missingUnits: 5,
  itemCount: 75,
  hasContingency: false,
  // Not just booleans
};
```

**Handle All Actions**
```typescript
function handleAIAction(action: string, data: any) {
  // Always log unknown actions for debugging
  console.log("AI Action:", action, data);

  // Handle known actions
  if (action === "known-action") {
    // Handle it
  }
}
```

### DON'T ❌

**Don't Block Rendering**
```typescript
// Bad: Waiting for suggestions
const suggestions = await generateSuggestions(...);
return <div>{renderWithSuggestions(suggestions)}</div>;

// Good: Component handles it internally
return (
  <>
    <YourContent />
    <AIAssistantPanel context="boq" currentData={data} />
  </>
);
```

**Don't Pass Sensitive Data**
```typescript
// Bad: Sensitive data in suggestions
const currentData = {
  userPassword: "secret",
  apiKey: "key123"
};

// Good: Only workflow-relevant data
const currentData = {
  itemCount: items.length,
  missingData: checkMissing(items)
};
```

**Don't Overwhelm Users**
```typescript
// Bad: Too many contexts
<AIAssistantPanel context="general" />
<AIAssistantPanel context="boq" />
<AIAssistantPanel context="procurement" />

// Good: One per page, appropriate context
<AIAssistantPanel context="boq" currentData={data} />
```

## Complete Example

```tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AIAssistantPanel from "../components/AIAssistantPanel";

export default function BOQPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [currentData, setCurrentData] = useState({});

  useEffect(() => {
    // Update AI context data when items change
    setCurrentData({
      itemCount: items.length,
      missingUnits: items.filter(i => !i.unit).length,
      hasContingency: items.some(i =>
        i.item_name.toLowerCase().includes("contingency")
      )
    });
  }, [items]);

  function handleAIAction(action: string, data: any) {
    console.log("AI suggested action:", action, data);

    if (action === "Create Assembly") {
      navigate("/assemblies");
    } else if (action === "Browse Smart Library") {
      navigate("/rates");
    } else if (data.route) {
      navigate(data.route);
    }
  }

  return (
    <div className="page-container">
      {/* Your page content */}
      <h1>BOQ Builder</h1>

      {/* BOQ content here */}

      {/* AI Assistant - always last */}
      <AIAssistantPanel
        context="boq"
        currentData={currentData}
        projectId={currentProject?.id}
        onAction={handleAIAction}
      />
    </div>
  );
}
```

## Customizing Suggestions

To add new suggestions for a context, edit `src/lib/aiAssistant.ts`:

```typescript
function getBOQSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  // Add your custom suggestion
  if (data.currentData?.customCondition) {
    suggestions.push({
      id: "boq-custom-1",
      context: "boq",
      type: "recommendation",
      title: "Custom Suggestion",
      description: "Your custom suggestion text here.",
      action: {
        label: "Take Action",
        data: { route: "/custom-page" }
      },
      priority: "medium"
    });
  }

  return suggestions;
}
```

## Suggestion Types

| Type | Use Case | Icon | Color |
|------|----------|------|-------|
| `warning` | Urgent issues, data problems | ⚠️ | Yellow |
| `recommendation` | Workflow improvements | 💡 | Blue (high) / Slate |
| `insight` | Tips, best practices | 📈 | Slate |
| `completion` | Next steps | ℹ️ | Slate |

## Priority Levels

| Priority | When to Use | Badge | Sort Order |
|----------|-------------|-------|------------|
| `high` | Urgent, blocking issues | Red badge | First |
| `medium` | Important improvements | None | Second |
| `low` | Optional tips | None | Last |

## Testing Your Integration

**1. Check Visibility**
```
- FAB appears bottom-right
- Badge shows for high-priority items
- Panel opens on click
```

**2. Verify Suggestions**
```
- Relevant to current context
- Accurate count/data
- Actions work correctly
```

**3. Test Interactions**
```
- Open/close panel
- Click action buttons
- Navigate to correct pages
- No console errors
```

**4. Mobile Testing**
```
- FAB accessible on mobile
- Panel scrolls properly
- Touch targets large enough
- No layout overlap
```

## Troubleshooting

**No Suggestions Showing**

Check:
1. Is `currentData` provided?
2. Are conditions met for suggestions?
3. Check console for errors
4. Verify context is correct

**Action Buttons Not Working**

Check:
1. Is `onAction` callback provided?
2. Is action handler implemented?
3. Check console for action logs
4. Verify data.route or data.action exists

**Panel Position Issues**

Check:
1. Other fixed elements in bottom-right?
2. Z-index conflicts?
3. Mobile viewport?
4. Sidebar open/closed states?

**Performance Issues**

Check:
1. Is `currentData` changing too often?
2. Memoize `currentData` object
3. Debounce rapid updates
4. Limit suggestion count

## Future Features

Coming in future releases:

- [ ] AI Chat Interface
- [ ] Natural Language Queries
- [ ] Voice Commands
- [ ] Custom User Suggestions
- [ ] Machine Learning Predictions
- [ ] Suggestion Preferences
- [ ] Multi-language Support
- [ ] Keyboard Shortcuts

## Support

For questions or issues:
1. Check AI_SUPPLIER_INTELLIGENCE_SYSTEM.md for details
2. Review source code in `src/lib/aiAssistant.ts`
3. Check component code in `src/components/AIAssistantPanel.tsx`
4. Contact development team

---

**Last Updated:** Step 8 Implementation
**Version:** 1.0
**Status:** Production Ready (Foundation)
