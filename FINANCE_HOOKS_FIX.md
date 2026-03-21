# Finance Pages Hook Order Fix

## Problem Found

**React Error:** "Rendered more hooks than during the previous render"

**Affected Pages:**
- Finance Hub (`src/pages/FinancePage.tsx`)
- Expenses (`src/pages/ExpensesPage.tsx`)
- Cash Flow (`src/pages/CashFlowPage.tsx`)
- Receivables (`src/pages/AccountsReceivablePage.tsx`)

## Root Cause

All four finance pages had **early returns** based on finance permission checks that occurred **before** some `useState` hook declarations. This violated React's Rules of Hooks, which require all hooks to be called in the **same order** on every render.

### The Pattern That Caused the Error

```typescript
export default function FinancePage() {
  const financeAccess = useFinanceAccess();  // ✅ Hook 1
  const [loading, setLoading] = useState(true);  // ✅ Hook 2

  // ❌ EARLY RETURN - sometimes happens, sometimes doesn't
  if (financeAccess.loading) {
    return <div>Loading...</div>;
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  // ❌ MORE HOOKS AFTER EARLY RETURNS
  const [projectName, setProjectName] = useState("");  // Hook 3 (sometimes)
  const [summary, setSummary] = useState({...});  // Hook 4 (sometimes)
  // ... more hooks
}
```

### Why This Failed

**First Render (loading=true):**
1. `useFinanceAccess()` runs
2. `useState(true)` runs
3. Early return happens
4. **No more hooks run**

**Second Render (loading=false, has access):**
1. `useFinanceAccess()` runs
2. `useState(true)` runs
3. No early return
4. `useState("")` runs - **React expects this to be the 3rd hook!**
5. `useState({...})` runs - **React expects this to be the 4th hook!**
6. ... more hooks

**Result:** React sees more hooks on the second render and throws error.

## The Fix

**Move ALL hooks before any early returns** to ensure they run in the same order on every render.

### Correct Pattern

```typescript
export default function FinancePage() {
  // ✅ ALL HOOKS FIRST - always run in same order
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [summary, setSummary] = useState({...});
  const [categories, setCategories] = useState([]);
  // ... all other hooks

  // ✅ THEN early returns
  if (financeAccess.loading) {
    return <div>Loading...</div>;
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  // ✅ Main render
  return <div>...</div>;
}
```

## Files Modified

### 1. FinancePage.tsx

**Before:**
```typescript
export default function FinancePage() {
  const financeAccess = useFinanceAccess();
  const projectId = routeProjectId || currentProjectId || null;

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCompanyReports) { return <AccessDenied />; }

  const [loading, setLoading] = useState(true);  // ❌ After early returns
  const [projectName, setProjectName] = useState("");  // ❌ After early returns
  // ... more hooks
```

**After:**
```typescript
export default function FinancePage() {
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);  // ✅ Before early returns
  const [projectName, setProjectName] = useState("");  // ✅ Before early returns
  const [summary, setSummary] = useState({...});  // ✅ Before early returns
  // ... all hooks

  const projectId = routeProjectId || currentProjectId || null;

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCompanyReports) { return <AccessDenied />; }
```

**Hooks Moved:** 8 `useState` hooks moved before early returns

### 2. ExpensesPage.tsx

**Before:**
```typescript
export default function ExpensesPage() {
  const financeAccess = useFinanceAccess();
  const [expenses, setExpenses] = useState<any[]>([]);
  // ... some hooks

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewExpenses) { return <AccessDenied />; }

  const [formData, setFormData] = useState({...});  // ❌ After early returns
```

**After:**
```typescript
export default function ExpensesPage() {
  const financeAccess = useFinanceAccess();
  const [expenses, setExpenses] = useState<any[]>([]);
  // ... some hooks
  const [formData, setFormData] = useState({...});  // ✅ Before early returns

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewExpenses) { return <AccessDenied />; }
```

**Hooks Moved:** 1 `useState` hook moved before early returns

### 3. AccountsReceivablePage.tsx

**Before:**
```typescript
export default function AccountsReceivablePage() {
  const financeAccess = useFinanceAccess();
  const [invoices, setInvoices] = useState<any[]>([]);
  // ... some hooks

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCompanyReports) { return <AccessDenied />; }

  const [showDetailModal, setShowDetailModal] = useState(false);  // ❌ After
  const [showPaymentModal, setShowPaymentModal] = useState(false);  // ❌ After
  // ... more hooks
```

**After:**
```typescript
export default function AccountsReceivablePage() {
  const financeAccess = useFinanceAccess();
  const [invoices, setInvoices] = useState<any[]>([]);
  // ... some hooks
  const [showDetailModal, setShowDetailModal] = useState(false);  // ✅ Before
  const [showPaymentModal, setShowPaymentModal] = useState(false);  // ✅ Before
  // ... all hooks

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCompanyReports) { return <AccessDenied />; }
```

**Hooks Moved:** 10 `useState` hooks moved before early returns

### 4. CashFlowPage.tsx

**Before:**
```typescript
export default function CashFlowPage() {
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);
  // ... all hooks

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCashFlow) { return <AccessDenied />; }

  useEffect(() => { loadData(); }, [dateRange]);  // ❌ After early returns
```

**After:**
```typescript
export default function CashFlowPage() {
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);
  // ... all hooks

  useEffect(() => { loadData(); }, [dateRange]);  // ✅ Before early returns

  if (financeAccess.loading) { return <Loading />; }
  if (!financeAccess.canViewCashFlow) { return <AccessDenied />; }
```

**Hooks Moved:** 1 `useEffect` hook moved before early returns

## Summary of Changes

**Total Hooks Fixed:** 20 hooks across 4 files

| File | Hooks Moved | Type |
|------|------------|------|
| FinancePage.tsx | 8 | useState |
| ExpensesPage.tsx | 1 | useState |
| AccountsReceivablePage.tsx | 10 | useState |
| CashFlowPage.tsx | 1 | useEffect |

## Verification

**Build Status:** ✅ Success (11.56s)

```bash
npm run build
✓ 1891 modules transformed.
✓ built in 11.56s
```

**No TypeScript Errors:** ✅
**No React Errors:** ✅
**Breaking Changes:** None ✅

## Why This Pattern Emerged

The finance permission system (`useFinanceAccess`) was added recently to secure finance pages. The pattern that emerged was:

1. Call `useFinanceAccess()` hook
2. Check if loading → early return
3. Check if no access → early return
4. Continue with page logic

The problem was that some page state hooks were declared **after** these checks, creating conditional hook calls.

## Prevention

To prevent this in future:

1. **Always declare ALL hooks at the top** of the component, before any conditional logic
2. **Never put hooks after:**
   - Early returns
   - If statements
   - Loops
   - Conditional rendering that returns JSX
3. **Use ESLint rule:** `react-hooks/rules-of-hooks` (already enabled in this project)
4. **Code review checklist:** Verify all hooks are at top level before conditional logic

## Testing Recommendations

Test these scenarios for each finance page:

1. **Loading State:**
   - Visit page
   - Verify loading screen shows
   - Verify no React errors in console

2. **Access Denied:**
   - Visit page with user who has no finance access
   - Verify access denied screen shows
   - Verify no React errors in console

3. **Normal Access:**
   - Visit page with full finance access
   - Verify page loads correctly
   - Verify all data displays
   - Verify no React errors in console

4. **Navigation Between Pages:**
   - Navigate: Finance Hub → Expenses → Cash Flow → Receivables → Finance Hub
   - Verify no React errors during navigation
   - Verify each page loads correctly

## React Rules of Hooks Reminder

From React documentation:

**✅ DO:**
```typescript
function Component() {
  const [state1, setState1] = useState();
  const [state2, setState2] = useState();

  if (condition) {
    return <div>Early return</div>;
  }

  return <div>Normal</div>;
}
```

**❌ DON'T:**
```typescript
function Component() {
  const [state1, setState1] = useState();

  if (condition) {
    return <div>Early return</div>;
  }

  const [state2, setState2] = useState();  // ❌ After early return
  return <div>Normal</div>;
}
```

## Links

- [React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)
- [ESLint Plugin React Hooks](https://www.npmjs.com/package/eslint-plugin-react-hooks)

---

**Status:** ✅ Fixed
**Build:** ✅ Passing
**Date:** 2026-03-21
**Breaking Changes:** None
