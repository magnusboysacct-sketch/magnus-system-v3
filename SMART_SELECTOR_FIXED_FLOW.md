# Smart Item Selector - Fixed Flow Diagram

## Complete Flow: Type → Category → Item → Variant → Confirm

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 1: TYPE SELECTION                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                      │
│  [Search type...]                                                    │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │ Material                                → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Labor                                   → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Equipment                               → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Subcontract                             → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Other                                   → │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Cancel]                                                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Material"
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 2: CATEGORY SELECTION                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Breadcrumb: Material                                               │
│                                                                      │
│  [Search category...]                                                │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │ Cement & Concrete Products             → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Blocks & Bricks                        → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Steel & Rebar                          → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Lumber & Wood                          → │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Back]                                                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Cement & Concrete Products"
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 3: ITEM SELECTION                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Breadcrumb: Material → Cement & Concrete Products                  │
│                                                                      │
│  [Search item...]                                                    │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │ Blocks                                 → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Ready Mix Concrete                     → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Portland Cement                        → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ Concrete Admixtures                    → │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Back]                                                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Ready Mix Concrete"
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 4A: VARIANT SELECTION (variants exist)                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Breadcrumb: Material → Cement... → Ready Mix Concrete              │
│                                                                      │
│  [Search variant...]                                                 │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │ 3000 PSI                               → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ 3500 PSI                               → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ 4000 PSI                               → │                     │
│  ├────────────────────────────────────────────┤                     │
│  │ 5000 PSI                               → │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Back]                                                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "3000 PSI"
                              ↓

OR if no variants exist:

┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 4B: VARIANT SELECTION (no variants)                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Breadcrumb: Material → Cement... → Portland Cement                 │
│                                                                      │
│  No variants found for this item.                                   │
│  Continue with no variant.                                          │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │ No variant                                 │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Back]                                                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "No variant" or variant
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  STEP 5: CONFIRM SELECTION                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Breadcrumb: Material → Cement... → Ready Mix... → 3000 PSI         │
│                                                                      │
│  ┌────────────────────────────────────────────┐                     │
│  │  Selected Item                             │                     │
│  │                                            │                     │
│  │  Type:        Material                     │                     │
│  │  Category:    Cement & Concrete Products   │                     │
│  │  Item:        Ready Mix Concrete           │                     │
│  │  Variant:     3000 PSI                     │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
│  [Back]                          [✓ Confirm Selection]              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks "Confirm Selection"
                              ↓
                    Item added to BOQ with:
                    - pick_type: "Material"
                    - pick_category: "Cement & Concrete Products"
                    - pick_item: "Ready Mix Concrete"
                    - pick_variant: "3000 PSI"
                    - cost_item_id: "abc-123..."
                    - unit_id: (from matched item)
                    - rate: (from matched item)
```

## Search Functionality at Each Step

### Step 1: Type
```
Before search:
> Material
> Labor
> Equipment
> Subcontract
> Other

After typing "mat":
> Material
```

### Step 2: Category
```
Before search:
> Cement & Concrete Products
> Blocks & Bricks
> Steel & Rebar
> Lumber & Wood

After typing "concrete":
> Cement & Concrete Products
```

### Step 3: Item
```
Before search:
> Blocks
> Ready Mix Concrete
> Portland Cement
> Concrete Admixtures

After typing "ready":
> Ready Mix Concrete
```

### Step 4: Variant
```
Before search:
> 3000 PSI
> 3500 PSI
> 4000 PSI
> 5000 PSI

After typing "4000":
> 4000 PSI
```

## Data Filtering Logic

```typescript
// All data loaded once on mount
const [items, setItems] = useState<CostItemRow[]>([]);

// Step 1: Extract unique types
typeOptions = unique(items.map(item => item.item_type))
// Result: ["Material", "Labor", "Equipment", "Subcontract", "Other"]

// Step 2: Filter by type, extract unique categories
itemsForType = items.filter(item => item.item_type === selectedType)
categoryOptions = unique(itemsForType.map(item => item.category))
// Result: ["Cement & Concrete Products", "Blocks & Bricks", ...]

// Step 3: Filter by type + category, extract unique item names
itemsForTypeAndCategory = itemsForType.filter(item =>
  item.category === selectedCategory
)
itemOptions = unique(itemsForTypeAndCategory.map(item => item.item_name))
// Result: ["Blocks", "Ready Mix Concrete", "Portland Cement", ...]

// Step 4: Filter by type + category + item, extract variants
itemsForTypeAndCategoryAndItem = itemsForTypeAndCategory.filter(item =>
  item.item_name === selectedItem
)
variantOptions = itemsForTypeAndCategoryAndItem.map(item => item.variant)
// Result: ["3000 PSI", "3500 PSI", "4000 PSI", ...] or []

// Step 5: Find exact match
matchedItem = items.find(item =>
  item.item_type === selectedType &&
  item.category === selectedCategory &&
  item.item_name === selectedItem &&
  (!selectedVariant || item.variant === selectedVariant)
)
// Result: Complete item record with id, unit, rate, etc.
```

## Empty State Handling

```
No Types Found:
┌────────────────────────┐
│ No type found          │
└────────────────────────┘

No Categories Found:
┌────────────────────────┐
│ No category found      │
└────────────────────────┘

No Items Found:
┌────────────────────────┐
│ No item found          │
└────────────────────────┘

No Variants Found:
┌────────────────────────────────┐
│ No variants found for this     │
│ item. Continue with no variant.│
│                                │
│ [No variant]                   │
└────────────────────────────────┘

No Search Matches:
┌────────────────────────────────┐
│ No [type/category/item/variant]│
│ matches your search            │
└────────────────────────────────┘
```

## Back Button Navigation

```
Step 1 (Type):      [Cancel]
Step 2 (Category):  [Back] → Type step (clears category, item, variant)
Step 3 (Item):      [Back] → Category step (clears item, variant)
Step 4 (Variant):   [Back] → Item step (clears variant)
Step 5 (Confirm):   [Back] → Variant step
```

## State Management

```typescript
// State
const [step, setStep] = useState<SelectionStep>('type');
const [search, setSearch] = useState('');
const [selection, setSelection] = useState({
  type: '',
  category: '',
  item: '',
  variant: '',
});

// Moving forward clears downstream selections
handleTypeSelect(type) {
  selection = { type, category: '', item: '', variant: '' }
  step = 'category'
}

handleCategorySelect(category) {
  selection = { ...selection, category, item: '', variant: '' }
  step = 'item'
}

handleItemSelect(item) {
  selection = { ...selection, item, variant: '' }
  step = 'variant'
}

handleVariantSelect(variant) {
  selection = { ...selection, variant }
  step = 'confirm'
}
```

## Integration with BOQPage

```typescript
// When user confirms selection
handleConfirm() {
  const result = {
    type: 'Material',
    category: 'Cement & Concrete Products',
    item: 'Ready Mix Concrete',
    variant: '3000 PSI',
    costItemId: 'abc-123...',
    itemName: 'Ready Mix Concrete',
    unit: 'yd³',
    currentRate: 125.50
  };

  onSelect(result);
}

// BOQPage receives and processes
handleSmartSelection(selection) {
  updateItem(sectionId, rowId, {
    pick_type: selection.type,           // "Material"
    pick_category: selection.category,   // "Cement & Concrete Products"
    pick_item: selection.item,           // "Ready Mix Concrete"
    pick_variant: selection.variant,     // "3000 PSI"
    item_name: selection.itemName,       // "Ready Mix Concrete"
    cost_item_id: selection.costItemId,  // "abc-123..."
    unit_id: matchedUnitId,              // Resolved from unit
    rate: selection.currentRate          // 125.50
  });
}
```

## Comparison with Original BOQ Picker

Both pickers now follow the EXACT same flow:

### Original Picker (BOQPage lines 1247-1436)
```typescript
Type → Category → Item → Variant → Finalize

typeOptions → categoryOptions(type) → itemOptions(type, category) →
variantOptions(type, category, item) → findFinalRateItem() → applyRateItem()
```

### Smart Selector (SmartItemSelector.tsx)
```typescript
Type → Category → Item → Variant → Confirm

typeOptions → categoryOptions(type) → itemOptions(type, category) →
variantOptions(type, category, item) → findMatchedItem() → onSelect()
```

**Result:** Both pickers provide identical functionality with the same data source and filtering logic.
