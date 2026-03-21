# Receiving Save Logic - Zero Quantity Bug Investigation

## Problem Statement

When users enter receiving quantities (e.g., "4") in the Receiving page UI:
- UI correctly shows "Max 4" placeholder
- User enters "4" in the input field
- Clicks "Save Receiving"
- Database receives records with `received_qty = 0` instead of `4`
- Receiving History shows "No quantity recorded"

## Investigation Summary

### Database Verification

1. **Schema is correct:**
   - `receiving_record_items.received_qty` exists and is type `numeric`
   - Default value is `0`
   - No CHECK constraints blocking values
   - No BEFORE INSERT triggers modifying data

2. **Manual SQL insert works:**
   ```sql
   INSERT INTO receiving_record_items (received_qty, ...) VALUES (42.5, ...);
   -- Result: received_qty = 42.500 ✅
   ```
   This proves the database accepts non-zero values.

3. **RLS policies are correct:**
   - INSERT policy only checks `company_id`
   - Does not restrict or modify quantity fields

### Code Flow Analysis

**Input State Management:**
```typescript
// State holds user inputs
const [receiveQtyByItemId, setReceiveQtyByItemId] = useState<Record<string, string>>({});

// Input onChange handler
function setReceiveQty(itemId: string, value: string) {
  setReceiveQtyByItemId((prev) => ({ ...prev, [itemId]: value }));
}

// Input binding
<input
  value={receiveQtyByItemId[item.id] || ""}
  onChange={(e) => setReceiveQty(item.id, e.target.value)}
/>
```

**Save Logic:**
```typescript
const lines = selectedPOItems
  .map((item) => {
    const raw = receiveQtyByItemId[item.id] || "";  // Read from state
    const qty = Math.max(0, toNumber(raw));          // Convert to number
    return { item, qty };
  })
  .filter((row) => row.qty > 0);  // Only keep rows with qty > 0

// Insert into database
for (const line of lines) {
  await supabase.from("receiving_record_items").insert({
    received_qty: line.qty,  // This should be the user-entered value
    ...
  });
}
```

**Type Conversion Helper:**
```typescript
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
```

### Potential Issues

1. **State not populated:** `receiveQtyByItemId` might be empty when save is clicked
2. **Wrong item IDs:** The item IDs used as keys might not match
3. **Type coercion:** Supabase client might be converting numbers to 0
4. **Race condition:** State might be reset between input and save

## Debug Instrumentation Added

Added comprehensive console logging to trace the exact values:

```typescript
async function handleSaveReceiving() {
  console.log("=== SAVE RECEIVING DEBUG ===");
  console.log("receiveQtyByItemId state:", receiveQtyByItemId);
  console.log("selectedPOItems:", selectedPOItems.map(i => ({ id: i.id, name: i.material_name })));

  const lines = selectedPOItems.map((item) => {
    const raw = receiveQtyByItemId[item.id] || "";
    const qty = Math.max(0, toNumber(raw));
    console.log(`Item ${item.material_name}: raw="${raw}", qty=${qty}`);
    return { item, qty };
  }).filter((row) => row.qty > 0);

  console.log("Lines to save:", lines.map(l => ({ name: l.item.material_name, qty: l.qty })));

  // ...

  for (const line of lines) {
    console.log(`Processing line: ${line.item.material_name}`);
    console.log(`  - line.qty: ${line.qty} (type: ${typeof line.qty})`);

    const insertPayload = {
      received_qty: Number(line.qty),  // Explicit Number() conversion
      ordered_qty: Number(line.item.ordered),
      previously_received_qty: Number(line.item.delivered),
      // ...
    };

    console.log("Insert payload:", insertPayload);
    console.log("received_qty type check:", typeof insertPayload.received_qty, "value:", insertPayload.received_qty);

    const result = await supabase.from("receiving_record_items").insert(insertPayload);

    if (result.error) {
      console.error("Insert error:", result.error);
      throw result.error;
    }

    console.log("Insert successful for:", line.item.material_name);
  }
}
```

```typescript
function setReceiveQty(itemId: string, value: string) {
  console.log(`setReceiveQty called: itemId=${itemId}, value="${value}"`);
  setReceiveQtyByItemId((prev) => {
    const updated = { ...prev, [itemId]: value };
    console.log("Updated receiveQtyByItemId:", updated);
    return updated;
  });
}
```

## Fix Applied

Added explicit `Number()` conversions for all quantity fields in the insert payload:

```typescript
const insertPayload = {
  ordered_qty: Number(line.item.ordered),
  previously_received_qty: Number(line.item.delivered),
  received_qty: Number(line.qty),  // ← Explicit conversion
  unit_cost: toNumber(line.item.unit_rate),
  delivered_cost: Number(toNumber(line.item.unit_rate) * line.qty),
  // ...
};
```

This ensures that even if `line.qty` is somehow not a primitive number, it gets properly converted before being sent to Supabase.

## Testing Instructions

1. **Open browser console** (F12 → Console tab)
2. **Navigate to Receiving page**
3. **Select a PO with balance remaining**
4. **Enter a quantity** (e.g., "4") in one or more input fields
5. **Click "Save Receiving"**
6. **Check console output:**
   - Does `receiveQtyByItemId` show the entered values?
   - Does `lines.map` show correct quantities?
   - Does the insert payload show `received_qty` with the correct value?
   - Is the type check showing `"number"` and the correct value?

## Expected Console Output (Success Case)

```
setReceiveQty called: itemId=7622d84c-7786-4145-a02f-4e491af04716, value="4"
Updated receiveQtyByItemId: { "7622d84c-7786-4145-a02f-4e491af04716": "4" }

=== SAVE RECEIVING DEBUG ===
receiveQtyByItemId state: { "7622d84c-7786-4145-a02f-4e491af04716": "4" }
selectedPOItems: [{ id: "7622d84c-7786-4145-a02f-4e491af04716", name: "Steel Fixing Labor" }, ...]
Item Steel Fixing Labor: raw="4", qty=4
Lines to save: [{ name: "Steel Fixing Labor", qty: 4 }]

Processing line: Steel Fixing Labor
  - line.qty: 4 (type: number)
Insert payload: { received_qty: 4, ordered_qty: 8, previously_received_qty: 4, ... }
received_qty type check: number 4
Insert successful for: Steel Fixing Labor
```

## Possible Diagnostic Outcomes

### Scenario 1: State is Empty
If console shows:
```
receiveQtyByItemId state: {}
```

**Root Cause:** Input values aren't being stored in state.
**Next Steps:** Check if `setReceiveQty` is being called, verify item IDs match.

### Scenario 2: State Has Values But qty is 0
If console shows:
```
Item Steel Fixing Labor: raw="4", qty=0
```

**Root Cause:** `toNumber()` function is failing to convert "4" to 4.
**Next Steps:** Check if input value has unexpected characters.

### Scenario 3: Payload is Correct But DB Gets 0
If console shows correct payload but database still has 0:
```
Insert payload: { received_qty: 4, ... }
```
But database shows `received_qty = 0`

**Root Cause:** Supabase client or RLS policy issue.
**Next Steps:** Test with service role key, check for hidden triggers.

### Scenario 4: Insert Fails Silently
If console shows an error that was previously being swallowed:
```
Insert error: { message: "...", code: "..." }
```

**Root Cause:** Database constraint or permission issue.
**Next Steps:** Fix the specific error shown.

## Files Modified

- `src/pages/ReceivingPage.tsx`
  - Added debug logging to `handleSaveReceiving()`
  - Added debug logging to `setReceiveQty()`
  - Added explicit `Number()` conversions to insert payload
  - Changed insert error from `console.warn` to `console.error` + `throw`

## Next Steps

1. Run the application with the debug version
2. Test the receiving save flow
3. Review console logs to identify the exact point of failure
4. Once root cause is confirmed, clean up debug logging
5. Apply targeted fix based on findings
