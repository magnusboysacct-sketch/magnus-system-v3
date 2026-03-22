# TakeoffPage - Quick Reference Guide

## Panel Controls

### Toggle Left Panel (Pages)
**Button:** Panel toggle icon in toolbar (left)
**Shortcut:** Click PanelLeftClose/PanelLeftOpen icon
**Saves:** Auto-saves to localStorage

### Toggle Right Panel (Groups)
**Button:** Panel toggle icon in toolbar (right)
**Shortcut:** Click PanelRightClose/PanelRightOpen icon
**Saves:** Auto-saves to localStorage

### Benefits
- More workspace when panels hidden
- Preferences persist between sessions
- Instant show/hide

## Calibration Input Formats

### Feet Only
```
12      →  12 feet
12'     →  12 feet
12.5    →  12.5 feet
```

### Inches Only
```
6"      →  6 inches (0.5 feet)
6.5"    →  6.5 inches
1/2"    →  0.5 inches
6 1/2"  →  6.5 inches
```

### Feet + Inches
```
12'6"       →  12 feet 6 inches
12'6 1/2"   →  12 feet 6.5 inches
12' 6"      →  12 feet 6 inches (space ok)
```

### Tips
- Apostrophe (') for feet
- Quote (") for inches
- Fractions supported (1/2, 1/4, 1/8, etc.)
- Mixed numbers supported (6 1/2)
- Space between feet/inches optional

## Zoom Controls

### Browser Zoom - BLOCKED ✅
When cursor is over workspace:
- Ctrl + Wheel → Only workspace zooms
- Browser page does NOT zoom
- Point under cursor stays stable

### Workspace Zoom Methods
1. **Ctrl + Mouse Wheel** (over workspace)
   - Scroll up = Zoom in
   - Scroll down = Zoom out
   - Anchors to cursor

2. **Zoom Buttons** (toolbar)
   - + button = Zoom in
   - - button = Zoom out
   - Fit button = Fit to screen
   - Reset button = 100% + center

3. **Current Zoom**
   - Displayed as percentage in toolbar
   - Range: 25% to 400%

## Pan Controls

### Method 1: Middle Mouse
- Hold middle mouse button
- Drag anywhere
- Works in any tool mode

### Method 2: Spacebar
- Hold spacebar
- Left click + drag
- Works in any tool mode

### Method 3: Hand Tool
- Select Hand tool from toolbar
- Left click + drag
- Dedicated pan mode

## Tool Icons

**Select** - MousePointer icon - Select/edit measurements
**Hand** - Hand icon - Pan around workspace
**Calibrate** - Ruler icon - Set scale
**Line** - Ruler icon - Measure distances
**Area** - Square icon - Measure areas
**Count** - MapPin icon - Count items
**Volume** - Box icon - Calculate volumes

## Measurement Input

### Volume Depth
When Volume tool is active:
- Input field in toolbar (Box icon)
- Enter depth value
- Shows in real-time HUD
- Calculates: Area × Depth = Volume

### Units
- ft (feet)
- in (inches)
- m (meters)

Calibrate first for accurate measurements!

## Page Navigation

### Multi-Page PDFs
- ChevronLeft button = Previous page
- ChevronRight button = Next page
- Current page shown in center
- Thumbnails in left panel

### Thumbnails
- Click any page thumbnail
- Shows measurement count per page
- Visual preview of each page

## Keyboard Shortcuts

### Pan
- **Spacebar** + drag = Pan

### Tools
- Click tool button in toolbar
- Icons indicate each tool

## Tips & Tricks

1. **Maximize Workspace**
   - Hide both panels for full workspace
   - Great for detailed work
   - Panels remember state

2. **Calibration**
   - Calibrate once per page
   - Use a known dimension
   - Enter using natural format (12'6")
   - All measurements auto-update

3. **Zoom**
   - Ctrl + wheel for precision
   - Fit button to see whole page
   - Zoom in for detail work

4. **Groups**
   - Organize by trade/category
   - Color-coded for visibility
   - Live totals in right panel

5. **Export**
   - Send to BOQ for estimates
   - Export CSV for spreadsheets
   - Auto-saves all work

## Common Workflows

### Starting a Takeoff
1. Upload PDF
2. Calibrate with known dimension
3. Create groups for organization
4. Select measurement tool
5. Start measuring

### Measuring Lines
1. Select Line tool (Ruler icon)
2. Click start point
3. Click along path
4. Double-click to finish
5. Measurement auto-calculated

### Measuring Areas
1. Select Area tool (Square icon)
2. Click corners of shape
3. Close polygon
4. Double-click to finish
5. Area auto-calculated

### Measuring Volume
1. Set depth in toolbar
2. Select Volume tool (Box icon)
3. Draw base area
4. Volume = Area × Depth

### Multiple Pages
1. Navigate with chevrons or thumbnails
2. Each page can have own calibration
3. Measurements grouped by page
4. Export combines all pages

## Troubleshooting

**Browser zooms instead of workspace?**
- Make sure cursor is over the PDF/workspace
- Native listener blocks browser zoom when over workspace

**Calibration not working?**
- Check input format (see formats above)
- Make sure two points are set
- Distance must be positive number

**Panel won't toggle?**
- Button is in main toolbar
- Look for panel icons (left/right side)
- State saves automatically

**Measurements not accurate?**
- Calibrate the page first
- Use reliable known dimension
- Re-calibrate if needed

## Support

For issues or questions:
- Check this guide first
- Review TAKEOFF_PAGE_UPGRADE_COMPLETE.md
- Review TAKEOFF_CTRL_WHEEL_ZOOM_FIX.md

All features tested and production-ready!
