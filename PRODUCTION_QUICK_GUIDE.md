# Production-Ready Quick Reference Guide

## Error Handling

### Log Errors
```typescript
import { errorLogger } from './lib/errorLogger';

// Database error
errorLogger.logDatabaseError('save item', error, { itemId: '123' });

// Network error
errorLogger.logNetworkError('/api/items', error);

// User error
errorLogger.logUserError('submit form', 'Invalid email');
```

### Handle Database Queries
```typescript
import { handleDatabaseQuery } from './lib/apiHelpers';
import { toast } from './lib/toast';

const { data, error } = await handleDatabaseQuery(
  () => supabase.from('items').select('*'),
  'load items'
);

if (error) {
  toast.error(error);
  return;
}

// Use data...
```

### Add Error Boundary
```typescript
import { ErrorBoundary } from './components/ErrorBoundary';

<ErrorBoundary context="My Module">
  <MyComponent />
</ErrorBoundary>
```

## Loading States

### Skeleton Loaders
```typescript
import { LoadingSkeleton, TableSkeleton, CardSkeleton } from './components/common';

// Single skeleton
<LoadingSkeleton className="h-10 w-full" />

// Table skeleton
<TableSkeleton rows={5} columns={4} />

// Card skeleton
<CardSkeleton count={3} />
```

### Virtual Table (Large Datasets)
```typescript
import { VirtualTable } from './components/common';

<VirtualTable
  data={items}
  rowHeight={60}
  renderHeader={() => <tr><th>Name</th></tr>}
  renderRow={(item, index) => (
    <tr key={item.id}><td>{item.name}</td></tr>
  )}
/>
```

## Performance Monitoring

### Track Performance
```typescript
import { measureAsync, markStart, markEnd } from './lib/performance';

// Async operation
const data = await measureAsync('loadBOQ', async () => {
  return await fetchData();
});

// Manual timing
markStart('operation');
doSomething();
markEnd('operation'); // Logs if >500ms
```

### View Metrics
```typescript
import { logAllMetrics, getMetrics } from './lib/performance';

// Console: Show all metrics
logAllMetrics();

// Get specific metrics
const metrics = getMetrics('loadBOQ');
// { count: 5, avg: 234ms, max: 456ms, min: 123ms }
```

## User Notifications

### Toast Notifications
```typescript
import { toast } from './lib/toast';

toast.success('Item saved successfully');
toast.error('Failed to save item');
toast.warning('Unsaved changes will be lost');
toast.info('Processing your request...');

// Custom duration
toast.success('Done!', 3000); // 3 seconds
```

## UI Consistency

### Use Standard Spacing
```typescript
import { SPACING, TYPOGRAPHY, COLORS } from './lib/uiConstants';

<div className={SPACING.page.padding}>
  <h1 className={TYPOGRAPHY.pageTitle}>Dashboard</h1>

  <div className={SPACING.section.gap}>
    <button className={`${COLORS.primary.bg} ${COLORS.primary.bgHover}`}>
      Save
    </button>
  </div>
</div>
```

### Available Constants
```typescript
// Spacing
SPACING.page.padding      // p-6
SPACING.section.gap       // gap-4
SPACING.card.padding      // p-6

// Colors
COLORS.primary.bg         // bg-blue-600
COLORS.success.bg         // bg-green-600
COLORS.danger.bg          // bg-red-600

// Typography
TYPOGRAPHY.pageTitle      // text-2xl font-bold
TYPOGRAPHY.sectionTitle   // text-lg font-semibold
TYPOGRAPHY.label          // text-sm font-medium
```

## Utilities

### Debounce (Search, Inputs)
```typescript
import { debounce } from './lib/apiHelpers';

const debouncedSearch = debounce((query) => {
  searchItems(query);
}, 300); // 300ms delay
```

### Throttle (Scroll, Resize)
```typescript
import { throttle } from './lib/apiHelpers';

const throttledScroll = throttle(() => {
  handleScroll();
}, 100); // Max once per 100ms
```

## Common Patterns

### Form Submission with Error Handling
```typescript
async function handleSubmit(formData) {
  const { data, error } = await handleDatabaseQuery(
    () => supabase.from('items').insert(formData),
    'create item',
    { userId: user.id }
  );

  if (error) {
    toast.error(error);
    return;
  }

  toast.success('Item created successfully');
  onClose();
}
```

### Data Fetching with Loading State
```typescript
const [loading, setLoading] = useState(true);
const [items, setItems] = useState([]);

useEffect(() => {
  loadItems();
}, []);

async function loadItems() {
  setLoading(true);

  const { data, error } = await handleDatabaseQuery(
    () => supabase.from('items').select('*'),
    'load items'
  );

  if (error) {
    toast.error(error);
  } else {
    setItems(data);
  }

  setLoading(false);
}

return (
  <>
    {loading ? (
      <TableSkeleton rows={5} columns={4} />
    ) : (
      <table>...</table>
    )}
  </>
);
```

### Performance-Monitored Operation
```typescript
async function loadBOQ() {
  const data = await measureAsync('loadBOQ', async () => {
    const { data } = await supabase
      .from('boq_items')
      .select('*')
      .eq('project_id', projectId);

    return processBOQData(data);
  });

  setBOQData(data);
}
```

## Debugging

### View Error Logs
```typescript
import { errorLogger } from './lib/errorLogger';

// Browser console
errorLogger.getLogs()           // All logs
errorLogger.getRecentLogs(10)   // Last 10
errorLogger.clearLogs()         // Clear all
```

### View Performance Metrics
```typescript
import { logAllMetrics } from './lib/performance';

// Browser console
logAllMetrics()  // Shows all tracked operations
```

## Build & Deploy

### Build for Production
```bash
npm run build
```

### Check Build Output
- Build time: Should be <15s
- Bundle size: ~394 KB gzipped
- No TypeScript errors
- No warnings (except chunk size)

### Deploy Checklist
- [ ] Environment variables set
- [ ] Build successful
- [ ] Database migrations applied
- [ ] Supabase configured
- [ ] Test on staging first

## Performance Best Practices

1. **Use VirtualTable for 1,000+ rows**
2. **Add loading skeletons to all async operations**
3. **Debounce search inputs (300ms)**
4. **Throttle scroll handlers (100ms)**
5. **Monitor slow operations (>500ms)**
6. **Wrap errors in handleDatabaseQuery**
7. **Show toast notifications for user actions**
8. **Use ErrorBoundary for critical modules**

## Common Issues & Solutions

### Issue: App crashes on error
**Solution:** Add ErrorBoundary
```typescript
<ErrorBoundary context="Module Name">
  <MyComponent />
</ErrorBoundary>
```

### Issue: Slow table rendering
**Solution:** Use VirtualTable
```typescript
<VirtualTable data={largeDataset} ... />
```

### Issue: Users don't see feedback
**Solution:** Add toast notifications
```typescript
toast.success('Action completed');
toast.error('Action failed');
```

### Issue: Poor loading UX
**Solution:** Add loading skeletons
```typescript
{loading ? <TableSkeleton /> : <Table />}
```

### Issue: Confusing error messages
**Solution:** Use handleDatabaseQuery
```typescript
const { error } = await handleDatabaseQuery(...);
// Automatically converts to user-friendly message
```

## Next Steps

1. **Add Sentry** for production error tracking
2. **Add Analytics** for user behavior insights
3. **Add Tests** for critical paths
4. **Monitor Performance** in production
5. **Gather User Feedback** and iterate
