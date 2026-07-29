// src/pages/HelpCenterPage.tsx - Help Center: role-based training guides,
// editable in-app by directors/admins. Articles are seeded from
// DEFAULT_ARTICLES into the help_articles table on first load if empty.
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  Search, BookOpen, ChevronRight, Play,
  ArrowLeft, Edit, Plus, Trash2, Save,
  Home, Layers, FileText, DollarSign,
  BarChart, Settings, HardHat, Ruler
} from "lucide-react";

// ─── Default articles seeded into DB ────────────────────────────────────────
const DEFAULT_ARTICLES = [
  // GETTING STARTED
  {
    module: "getting-started",
    title: "Welcome to Magnus Boys ERP",
    slug: "welcome",
    sort_order: 1,
    roles: ["director","admin","project_manager","site_supervisor","estimator","procurement","accounts","viewer"],
    content: `# Welcome to Magnus Boys Construction ERP

Magnus Boys ERP is a complete construction management system built specifically for Magnus Boys Construction Limited. It manages everything from the first client meeting to the final payment.

## What this system does

- **Projects** — Create and manage all your construction projects in one place
- **Takeoff** — Measure quantities directly from PDF plans
- **BOQ Builder** — Build your Bill of Quantities with real rates
- **Estimates** — Generate professional cost proposals for clients
- **Contracts** — Create legal contracts with e-signature support
- **Finance** — Track all money in and out per project
- **Field Payments** — Pay workers on site with digital receipts
- **Procurement** — Manage purchase orders and suppliers
- **Reports** — See how every project is performing

## The flow from start to finish

\`\`\`
1. Create Project
2. Upload Plans → Takeoff measurements
3. Build BOQ → Generate Estimate
4. Client approves → Create Contract
5. Client pays deposit → Record payment
6. Work begins → Field payments to workers
7. Purchase materials → Purchase orders
8. Track budget → Project dashboard
9. Project complete → Final payment
10. Generate reports
\`\`\`

## Your role

Each user has a role that controls what they can see and do:

| Role | What they do |
|---|---|
| Director | Full access to everything |
| Admin | Full access except billing |
| Project Manager | Manage assigned projects |
| Estimator | BOQ, estimates, rate library |
| Site Supervisor | Field payments, workers |
| Accounts | Finance and invoicing |
| Viewer | Read-only access |

## Getting help

Use the **❓ Help** button in the sidebar at any time to find guides for the page you are on.`,
    video_url: "",
  },
  {
    module: "getting-started",
    title: "Navigating the System",
    slug: "navigation",
    sort_order: 2,
    roles: ["director","admin","project_manager","site_supervisor","estimator","procurement","accounts","viewer"],
    content: `# Navigating Magnus Boys ERP

## The Sidebar

The left sidebar is your main navigation. It shows different items depending on your role.

- **Dashboard** — Overview of all active projects
- **CRM** — Clients and contacts
- **Estimating** — Estimates, Contracts, BOQ Builder, Takeoff, Assemblies, Rate Library
- **Procurement** — Purchase orders and suppliers
- **Finance** — Accounting, expenses, invoices (director/accounts only)
- **People** — Workers and field payments
- **Reports** — Project and financial reports
- **Settings** — Company settings (director only)

## Project Switcher

At the top of the sidebar you will see the current project name. Click it to switch between projects. All modules (BOQ, Takeoff, Finance etc.) automatically switch to show data for the selected project.

## Light and Dark Mode

At the bottom of the sidebar click **Light mode** or **Dark mode** to switch themes.

## Mobile vs Desktop

- On **desktop** — full sidebar always visible
- On **mobile** — tap the ☰ menu button to open the sidebar
- Most pages work on mobile. Takeoff drawing works best on desktop.`,
    video_url: "",
  },

  // PROJECTS
  {
    module: "projects",
    title: "Creating a New Project",
    slug: "create-project",
    sort_order: 1,
    roles: ["director","admin","project_manager"],
    content: `# Creating a New Project

## When to create a project

Create a project as soon as you have a new job — even before the estimate is done. The project ties everything together: takeoff, BOQ, estimate, contract, payments, and reports.

## Steps

1. Click **Projects** in the sidebar
2. Click **+ New Project** (top right)
3. Fill in:
   - **Project name** — e.g. "Smith Residence - Phase 1"
   - **Client** — pick from your client list or add new
   - **Status** — set to Planning to start
4. Click **Save**

## Project statuses

| Status | Meaning |
|---|---|
| Planning | Not started yet |
| Active | Work in progress |
| On Hold | Temporarily stopped |
| Completed | Work finished |
| Cancelled | Project cancelled |

## Assigning team members

After creating the project:
1. Hover over the project card
2. Click the 👥 **Team** button
3. Select staff from the dropdown
4. Set their project role
5. Click **+ Add to Project**

Staff who are assigned will see this project in their sidebar. Staff not assigned will not see it.

## ⚠️ Important

Only **Directors** and **Admins** can create and delete projects. Project Managers can edit assigned projects.`,
    video_url: "",
  },
  {
    module: "projects",
    title: "Project Dashboard Overview",
    slug: "project-dashboard",
    sort_order: 2,
    roles: ["director","admin","project_manager","site_supervisor","estimator"],
    content: `# Project Dashboard
The Project Dashboard is your command centre for a single project. Access it by clicking any project from the Projects page.

## Tabs

### Overview
Shows key stats at a glance:
- Milestones completed
- Tasks status
- Money spent
- Team size
- **Project balance** (green/yellow/red indicator)

### Milestones
Break the project into phases:
- Add milestones (e.g. Foundation, Structure, Roof, Finishes)
- Set planned start and end dates
- Enter planned costs (labour, materials, equipment)
- Track actual costs as work progresses
- Link to contract payment amounts

### Tasks
Smaller work items within each milestone:
- Assign to team members
- Set due dates
- Track completion

### Financials
Real money tracking:
- **Available balance** — what you can spend right now
- **Received from client** — payments received
- **Spent** — field payments + purchase orders + expenses
- **Weekly forecast** — will funds last the week?
- **Director view** — estimated profit (director only)

### Cost Plan
Plan overhead costs:
- Set project duration
- Assign staff (PM, supervisor) with their monthly rates
- Add vehicle costs
- Set company overhead %
- See break-even price and recommended selling price

### Team
List of workers assigned to this project.

### Activity
Feed of recent purchase orders and expenses.

### Messages
Chat with the client through the client portal.`,
    video_url: "",
  },

  // BOQ
  {
    module: "boq",
    title: "Building a BOQ",
    slug: "building-boq",
    sort_order: 1,
    roles: ["director","admin","estimator","project_manager"],
    content: `# Building a Bill of Quantities (BOQ)

## What is a BOQ?

A Bill of Quantities lists every material, labour item, and service needed for a project with quantities and rates. It is the foundation of your estimate.

## Opening the BOQ Builder

1. Select your project from the sidebar
2. Click **BOQ Builder** in the Estimating menu
3. If no BOQ exists, one will be created automatically

## Adding sections

A BOQ is organized into sections (e.g. Foundation, Blockwork, Roofing):
1. Click **+ Add Section**
2. Choose a category from the dropdown (or type a new one)
3. Add items to the section

## Adding items manually

1. Click **+ Add Item** in a section
2. Click **Find Item** to search the Rate Library
3. The rate auto-fills from the library
4. Enter the quantity
5. The amount calculates automatically

## Using assemblies

Assemblies are pre-built groups of items (e.g. a column includes rebar, concrete, formwork):
1. Click **+ Assembly**
2. Pick an assembly from the list
3. Enter the measurement (e.g. column height = 3m)
4. All components explode automatically with calculated quantities

## Measurement modal

Click the 📐 icon on any item to enter detailed measurements:
- Add multiple rows (e.g. each wall separately)
- Deduct openings (windows, doors) with the **–** button
- System totals everything automatically

## Saving and approving

- Click **Save Draft** regularly
- When complete, click **Approve** (director/estimator only)
- Approved BOQ can then generate an Estimate

## ⚠️ Important

You must **Save** and **Approve** the BOQ before you can generate an Estimate or Procurement document.`,
    video_url: "",
  },
  {
    module: "boq",
    title: "Assembly Wizard",
    slug: "assembly-wizard",
    sort_order: 2,
    roles: ["director","admin","estimator"],
    content: `# Assembly Wizard

## What is an Assembly?

An assembly is a template for a structural element (like a column or block wall) that contains all the component materials and labour with automatic quantity formulas. Instead of adding each item one by one, you set up the assembly once and reuse it on every job.

## Creating an assembly

1. Go to **Assemblies** in the sidebar
2. Click **+ New Assembly**
3. The **Smart Assembly Wizard** opens
4. Pick a structural element:

### Structural
Square Column, Rect. Column, Ground Beam, Ring Beam, Tie Beam, Lintel, Slab, Pad Footing, Strip Footing, Retaining Wall, Staircase, Blinding, Setting Out, Excavation

### Masonry
Block Wall (with horizontal bars)

### Finishes
Rough Render, Float Coat, Skim Coat, Floor Screed, Waterproof Render, Tyrolean, Plastering, Tiling, Wall Tiling, Painting, Ceiling, Roofing

### Partitions
Drywall Partition, Drywall Painting

### Plumbing
Water Supply, Drainage Piping, Bathroom Fitout

### Electrical
Electrical Wiring, Electrical Fitout

### Doors & Windows
Solid Door, Aluminum Window, Louvre Window

### Structural Steel
Roof Truss

### External
Chain Link Fence, Ground Floor Slab, Paving, Septic Tank, Drain/Gutter

5. Fill in the guided form (dimensions, bar sizes, etc.)
6. See a preview of all components and quantities
7. Click **Save Assembly**

## Using assemblies in BOQ

1. In BOQ Builder click **+ Assembly**
2. Pick your assembly
3. Click 📐 **Measure** on the assembly row
4. Enter the measurement (e.g. wall length = 12m, height = 3m)
5. All component quantities calculate automatically

## 💡 Tips

- Build your standard assemblies once at the start of a project
- Assemblies inherit your Rate Library prices automatically
- You can duplicate assemblies and modify them`,
    video_url: "",
  },

  // ESTIMATES
  {
    module: "estimates",
    title: "Generating an Estimate",
    slug: "generating-estimate",
    sort_order: 1,
    roles: ["director","admin","estimator","project_manager"],
    content: `# Generating an Estimate

## What is an Estimate?

An estimate is the cost proposal you send to the client. It is generated from your approved BOQ and includes your markup and contingency. The client never sees your cost breakdown or profit margin.

## Prerequisites

Before generating an estimate you need:
- ✅ A completed BOQ
- ✅ BOQ must be **Approved**
- ✅ Project must have a client assigned

## Steps

1. Open the **BOQ Builder** for your project
2. Make sure the BOQ is approved (green APPROVED badge)
3. Click **Estimate** in the toolbar
4. The system automatically creates the estimate
5. You are taken to the **Estimates** page

## Setting markup and contingency

1. Open the estimate
2. In the **Pricing** panel:
   - Set your **Markup %** (your profit — never shown to client)
   - Set **Contingency %** (shown to client as a buffer)
3. The system calculates:
   - BOQ Cost (your internal cost)
   - Markup amount (hidden)
   - Subtotal with markup
   - Contingency (shown to client)
   - **Total to Client** (what you charge)
4. Click **Save markup settings**

## Printing the estimate

1. Click **Print** in the estimate footer
2. The system generates a professional PDF with:
   - Your company logo
   - Client information
   - Section totals (not individual line items unless you choose)
   - Contingency shown separately
   - Total contract value
   - Terms and conditions
   - Signature lines
3. Save as PDF or print

## Sending to client and getting approval

1. Send the printed PDF to your client
2. When client agrees, open the estimate
3. Click **Approve** to mark it as approved
4. **Generate Contract** button appears

## Recording client payments

Once the estimate is approved:
1. Click **🧾 Create Invoice** to create an invoice
2. Click **+ Record Payment** when client pays
3. Quick select Deposit (30%), Progress (40%), or Final (30%)
4. Enter payment method and reference
5. Payment is tracked against the estimate total

## ⚠️ Important

Markup is **never shown to the client**. Only the final total and contingency appear on the printed estimate.`,
    video_url: "",
  },

  // CONTRACTS
  {
    module: "contracts",
    title: "Creating a Contract",
    slug: "creating-contract",
    sort_order: 1,
    roles: ["director","admin","project_manager"],
    content: `# Creating a Contract

## What is a Contract?

A contract is the legal agreement between Magnus Boys Construction and the client. It includes the scope of work, contract amount, payment schedule, and terms and conditions.

## Creating from an approved estimate

This is the recommended method:
1. Open an **approved** estimate
2. Click **Generate Contract**
3. The Contracts page opens with pre-filled:
   - Contract amount (from estimate total)
   - Project name
   - Client details
4. Fill in remaining details
5. Click **Save**

## Creating manually

1. Go to **Contracts** in the Estimating menu
2. Click **+ New Contract**
3. Fill in all details manually

## Contract details

- **Contract name** — descriptive name
- **Contract date** — date of signing
- **Start date** and **Completion date**
- **Contract amount** — total value
- **Retention %** — amount held back until completion
- **Payment terms** — how and when client pays

## AI Scope of Work

1. Click **AI Generate Scope**
2. The system writes a professional scope of work based on the project
3. Review and edit as needed

## Payment schedule

1. Click **AI Generate Schedule** or set manually
2. Add milestones with payment amounts
3. Typical: 30% deposit, 40% progress, 30% completion

## E-Signatures

1. Click **Sign** (contractor signature)
2. Draw your signature or upload a photo
3. Send to client for their signature
4. Both signatures are recorded with timestamps

## Sending to client

1. Click **WhatsApp** or **Email** to send
2. Or click **Print** to save as PDF

## ⚠️ Important

A contract should always be signed **before** work begins. Never start a project without a signed contract.`,
    video_url: "",
  },

  // FINANCE
  {
    module: "finance",
    title: "Recording Client Payments",
    slug: "client-payments",
    sort_order: 1,
    roles: ["director","admin","accounts"],
    content: `# Recording Client Payments

## Overview

Client payments can be recorded in two places:
1. **From the Estimate** — when payment is against an estimate
2. **From Accounts Receivable** — for invoice-based payments

## Recording payment from Estimate

1. Open the estimate the client is paying against
2. Scroll to **💰 Payment Tracking** section
3. If no invoice exists, click **🧾 Create Invoice** first
4. Click **+ Record Payment**
5. Use quick-select buttons:
   - **Deposit 30%** — fills in 30% of total
   - **Progress 40%** — fills in 40% of total
   - **Final 30%** — fills in final payment
   - Or enter a custom amount
6. Select payment method (Cash, Cheque, Wire, Card)
7. Enter reference number (cheque number, transfer ref)
8. Click **✓ Record Payment**

The payment tracking section shows:
- Progress bar (how much of total has been paid)
- Total contract value
- Amount paid
- Amount outstanding

## Recording payment from Accounts Receivable

1. Go to **Finance → Accounts Receivable**
2. Click on the invoice
3. Click **+ Record Payment**
4. Enter amount, method, date, reference
5. Click **Record Payment**

## Payment methods

| Method | Use when |
|---|---|
| Cash | Client pays in cash |
| Cheque | Client writes a cheque |
| Wire | Bank transfer |
| Card | Credit/debit card |
| ACH | Direct bank transfer |

## ⚠️ Important

Always get a reference number for every payment. This is your proof of receipt if there is ever a dispute.`,
    video_url: "",
  },
  {
    module: "finance",
    title: "Project Budget Tracking",
    slug: "project-budget",
    sort_order: 2,
    roles: ["director","admin","project_manager","accounts"],
    content: `# Project Budget Tracking

## Overview

The project budget shows how much money is available to spend on a specific project. This prevents money from one project being used on another.

## Viewing the project balance

1. Open any project
2. Go to the **Financials** tab
3. You will see:

### Balance indicator
- 🟢 **Green** — More than 30% of received funds remaining. OK to proceed.
- 🟡 **Yellow** — Less than 30% remaining. Plan next client payment.
- 🔴 **Red** — Less than 10% remaining or overspent. Stop spending.

### Available to Spend
This is money received from client minus all money spent on the project:
\`\`\`
Available = Received from client - (Field Payments + Purchase Orders + Expenses)
\`\`\`

### Spend breakdown
- 👷 **Field Payments** — wages paid to site workers
- 📦 **Purchase Orders** — materials ordered
- 🧾 **Expenses** — other project costs

### Weekly forecast
Shows if you have enough money for the next week based on last week's spend rate.

## Director profit view

Directors also see:
- **Contract Value** — what client owes in total
- **Still to Collect** — remaining client payments due
- **Estimated Profit** — projected profit at completion
- **Profit Margin %**

## Cost Plan tab

Use the Cost Plan to calculate the true cost of a project including overhead:
1. Set project duration (months)
2. Assign staff (PM, supervisor) with their monthly rates
3. Set vehicles on the job
4. Set company overhead %
5. System shows:
   - Break-even price (minimum you must charge)
   - Recommended price (with your target profit)
   - Whether your current contract makes money

## ⚠️ Important

Site supervisors can see the **Available Balance** so they know if they can make payments. They cannot see the profit figures — only directors see that.`,
    video_url: "",
  },

  // FIELD OPERATIONS
  {
    module: "field-ops",
    title: "Field Payments",
    slug: "field-payments",
    sort_order: 1,
    roles: ["director","admin","project_manager","site_supervisor"],
    content: `# Field Payments

## What are field payments?

Field payments are wages and advances paid directly to workers on site. Every payment is recorded with a digital receipt and signature.

## Payment types

| Type | When to use |
|---|---|
| **Advance** | Worker needs money before work is done |
| **Work Payment** | Regular wages for work completed |
| **Final Settlement** | Final payment at end of job |

## Making a field payment

1. Go to **People → Field Payments**
2. Select the project
3. Click **+ New Payment**
4. The payment wizard opens:

**Step 1 — Select Worker**
- Search for existing worker or enter details manually
- Worker photo ID is captured for verification

**Step 2 — Payment Details**
- Select payment type (Advance/Work Payment/Final Settlement)
- Enter amount
- Select payment method (Cash/Cheque/Transfer)
- Enter work dates and details

**Step 3 — Capture Signature**
- Worker signs on screen
- Receipt is generated automatically

## Before making a payment

Check the **project balance** — shown at the top of the payment form:
- 🟢 OK to proceed
- 🟡 Low balance — check with director first
- 🔴 Overspent — do not make payment without director approval

## Editing and deleting payments

- **Edit** — click the ✏️ button on the payment card
- **Delete** — click the 🗑️ button (director only)

## Receipts

Each payment automatically generates a numbered receipt. This can be printed or shared via WhatsApp.

## ⚠️ Important

Never make a field payment if the project balance is in the red. Always check with the director before paying if funds are low.`,
    video_url: "",
  },
  {
    module: "field-ops",
    title: "Worker Management",
    slug: "worker-management",
    sort_order: 2,
    roles: ["director","admin","site_supervisor"],
    content: `# Worker Management

## Adding a worker

1. Go to **People → Workers**
2. Click **+ Add Worker**
3. Fill in details:
   - First and last name
   - **Job Title/Trade** (Mason, Carpenter, Electrician etc.)
   - Worker type (Employee, Subcontractor, Daily Paid)
   - Phone and address
   - Pay rate and pay type

## Passport photo

Each worker has a photo ID for verification:
1. Click **📷 Take Photo** to use the camera
2. Or click **Upload** to choose from gallery
3. The crop tool appears — adjust the square to frame the face
4. Click **Use Photo**

## ID Expiry Date

Set when the worker's ID expires:
1. Use quick-select buttons (1 Month, 3 Months, 6 Months, 1 Year, 2 Years)
2. Or pick a custom date
3. The ID card shows:
   - 🟢 **ID Valid** — more than 30 days remaining
   - 🟡 **EXPIRES Xd** — expiring within 30 days
   - 🔴 **ID EXPIRED** — past expiry date

## Worker ID card

Every worker has a printed ID card showing:
- Company logo
- Worker photo
- Full name
- Job title
- Employee ID number
- Issue date and expiry date

To print: open the worker, click **Print ID Card**

## ⚠️ Important

Keep worker IDs up to date. Expired IDs should be renewed before the worker continues on site.`,
    video_url: "",
  },

  // RATE LIBRARY
  {
    module: "rate-library",
    title: "Managing the Rate Library",
    slug: "rate-library",
    sort_order: 1,
    roles: ["director","admin","estimator"],
    content: `# Rate Library

## What is the Rate Library?

The Rate Library is your master list of all materials, labour rates, and equipment costs. Every BOQ item pulls its rate from here. Keeping rates up to date ensures accurate estimates.

## Adding a new rate item

1. Go to **Estimating → Rate Library**
2. Click **+ Add Rate**
3. Fill in:
   - **Item Name** — e.g. "Concrete Block"
   - **Grade/Type** — e.g. "Hollow"
   - **Size/Spec** — e.g. "6 inch"
   - **Category** — e.g. "Masonry"
   - **Unit** — e.g. "each", "bag", "m²"
   - **Current Rate** — price per unit in JMD
   - **Item Type** — Material, Labour, Equipment, or Subcontractor
4. Click **Save**

## Updating prices

When supplier prices change:
1. Find the item in the Rate Library
2. Click the ✏️ edit button
3. Update the **Current Rate**
4. Save

All BOQ items linked to this rate will show the new price on the next BOQ calculation.

## Importing prices from supplier

1. Go to **Procurement → Supplier Price Sync**
2. Select a supplier
3. Load their price list
4. Click **Apply Prices to System**
5. Matched items update automatically

## Duplicate item

To create a similar item quickly:
1. Find the existing item
2. Click the **Duplicate** button
3. A copy opens — change what's different
4. Save

## ⚠️ Important

Only Directors and Estimators can add/edit rates. Rate Library prices directly affect all estimates, so keep them accurate and up to date.`,
    video_url: "",
  },

  // TAKEOFF
  {
    module: "takeoff",
    title: "Taking Off from Plans",
    slug: "takeoff",
    sort_order: 1,
    roles: ["director","admin","estimator","project_manager"],
    content: `# Takeoff — Measuring from Plans

## What is Takeoff?

Takeoff is the process of measuring quantities directly from construction drawings (plans). Instead of manually calculating, you click on the plan to measure lengths, areas, and counts.

## Desktop Takeoff (full drawing tool)

### Step 1 — Upload a plan
1. Go to **Estimating → Takeoff**
2. Click **Upload PDF**
3. Select your floor plan or drawing

### Step 2 — Calibrate the scale
1. Click **Calibrate**
2. Click two points on the plan that have a known real-world distance (e.g. a 5m wall)
3. Enter the real distance
4. The system calculates the scale automatically

### Step 3 — Measure
Use the toolbar on the left:

| Tool | Use for |
|---|---|
| 📏 Linear | Lengths (walls, pipes, beams) |
| 📐 Area | Floor areas, wall surfaces |
| 🔢 Count | Items to count (doors, windows, columns) |
| 📦 Volume | Concrete pours, excavation |
| 🧱 Wall | Wall lengths with height for area |

Click to place points. Double-click to complete a measurement.

### Step 4 — Link to assembly or rate item
1. In the **Templates** panel (right side), pick an assembly or rate item
2. New measurements will be linked to it automatically

### Step 5 — Send to BOQ
1. Click **Summary** tab (right panel)
2. Review all measurements
3. Click **Send All to BOQ**

## Mobile Takeoff (manual entry)

On mobile, use your tape measure on site:

1. Open Takeoff on your phone
2. Tap **📏 Measure** tab
3. Select measurement type (Linear/Area/Count/Volume)
4. Enter description (e.g. "North wall")
5. Enter the value from your tape measure
6. Link to a rate library item (optional)
7. Tap **+ Add Measurement**
8. Tap **✅ Taken** to review all measurements
9. Tap **Send to BOQ**

## ⚠️ Tips

- Always calibrate before measuring — wrong scale = wrong quantities
- You can zoom in (scroll wheel) for precise measurements
- Measurements are saved automatically`,
    video_url: "",
  },

  // REPORTS
  {
    module: "reports",
    title: "Understanding Reports",
    slug: "reports",
    sort_order: 1,
    roles: ["director","admin","project_manager","accounts"],
    content: `# Reports

## Overview

The Reports section gives you a complete view of how your projects and business are performing.

## Accessing Reports

Click **Reports** in the sidebar.

## Types of reports

### Project Reports
- Project cost vs budget
- Milestone completion status
- Labour cost breakdown
- Materials spend

### Financial Reports
- Revenue by project
- Expenses by category
- Outstanding invoices
- Cash flow

### Procurement Reports
- Purchase orders by supplier
- Materials ordered vs delivered
- Outstanding POs

## Exporting reports

Most reports can be:
- **Printed** — click the Print button
- **Exported to PDF** — save as PDF from the print dialog

## ⚠️ Tips

- Check the Financials tab on each project for real-time budget tracking
- Use the Director view on the project dashboard to see profit margins
- Run reports at the end of each month to track business performance`,
    video_url: "",
  },

  // SETTINGS
  {
    module: "settings",
    title: "System Settings",
    slug: "settings",
    sort_order: 1,
    roles: ["director"],
    content: `# System Settings

## Overview

Settings is where you configure Magnus Boys ERP for your company. Only Directors can access Settings.

## Company Settings

Set your company details that appear on all documents:
- Company name
- Address
- Phone and email
- Website
- **Logo** — appears on estimates, contracts, and ID cards

## Users & Permissions

Manage who has access to the system:

### Inviting a new user
1. Go to **Settings → Users**
2. Click **+ Invite User**
3. Enter their email address
4. Select their role
5. Click **Send Invite**
6. They receive an email with a link to set up their account

### Roles
| Role | Access level |
|---|---|
| Director | Everything |
| Admin | Everything except billing |
| Project Manager | Assigned projects |
| Estimator | BOQ, estimates, rate library |
| Site Supervisor | Field payments, workers |
| Procurement | Purchase orders |
| Accounts | Finance and invoices |
| Viewer | Read only |

### Disabling a user
1. Find the user in the list
2. Click **Disable**
3. They can no longer log in

## Estimate Settings

Set defaults for all estimates:
- **Overall markup %** — your standard profit margin
- **Category markups** — different % for materials, labour, equipment
- **Contingency %** — buffer shown to client (typically 5%)
- **Payment terms** — deposit/progress/completion split
- **Validity period** — how long estimates are valid
- **Print format** — section summary or full line items

## Master Lists

Manage the dropdown options used throughout the system:
- Categories
- Units of measurement
- Cost codes

## ⚠️ Important

Keep your company logo and contact details up to date. They appear on every document sent to clients.`,
    video_url: "",
  },
];

// ─── Module definitions ───────────────────────────────────────────────────
const MODULES = [
  { key: "getting-started", label: "Getting Started", icon: <Home size={20}/>, color: "blue" },
  { key: "projects",        label: "Projects",        icon: <Layers size={20}/>, color: "purple" },
  { key: "boq",             label: "BOQ Builder",     icon: <Ruler size={20}/>, color: "cyan" },
  { key: "estimates",       label: "Estimates",       icon: <FileText size={20}/>, color: "green" },
  { key: "contracts",       label: "Contracts",       icon: <FileText size={20}/>, color: "indigo" },
  { key: "finance",         label: "Finance",         icon: <DollarSign size={20}/>, color: "emerald" },
  { key: "field-ops",       label: "Field Operations",icon: <HardHat size={20}/>, color: "amber" },
  { key: "rate-library",    label: "Rate Library",    icon: <BarChart size={20}/>, color: "orange" },
  { key: "takeoff",         label: "Takeoff",         icon: <Ruler size={20}/>, color: "violet" },
  { key: "reports",         label: "Reports",         icon: <BarChart size={20}/>, color: "slate" },
  { key: "settings",        label: "Settings",        icon: <Settings size={20}/>, color: "gray" },
];

// ─── Color map ────────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  blue:    "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
  purple:  "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30",
  cyan:    "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/30",
  green:   "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30",
  indigo:  "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30",
  emerald: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  amber:   "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  orange:  "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/30",
  violet:  "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/30",
  slate:   "bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/30",
  gray:    "bg-gray-100 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-500/30",
};

// ─── Simple markdown renderer ─────────────────────────────────────────────
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-4 mt-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-3 mt-6 pb-2 border-b border-slate-200 dark:border-slate-700">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-bold text-slate-600 dark:text-slate-300 mb-2 mt-4">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="list-none space-y-1.5 mb-4 ml-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="text-blue-500 mt-1 flex-shrink-0">▸</span>
              <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\./.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\./.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={i} className="list-none space-y-2 mb-4 ml-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">{j+1}</span>
              <span className="mt-0.5" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith("| ")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].includes("---")) {
          rows.push(lines[i].split("|").filter(c => c.trim()).map(c => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={i} className="overflow-x-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  {rows[0].map((cell, j) => (
                    <th key={j} className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.slice(1).map((row, j) => (
                  <tr key={j} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {row.map((cell, k) => (
                      <td key={k} className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    } else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto mb-4 border border-slate-200 dark:border-slate-700">
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("⚠️") || line.startsWith("💡")) {
      elements.push(
        <div key={i} className={`flex items-start gap-2 p-3 rounded-xl mb-4 text-sm ${line.startsWith("⚠️") ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400"}`}>
          <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}/>
        </div>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
      );
    }
    i++;
  }
  return elements;
}

// ─── Main component ───────────────────────────────────────────────────────
export default function HelpCenterPage() {
  const { userRole } = useProjectContext();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState<string|null>(null);
  const [activeArticle, setActiveArticle] = useState<any|null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", content: "", video_url: "" });
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Load articles
  useEffect(() => {
    loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadArticles() {
    setLoading(true);
    const { data } = await supabase
      .from("help_articles")
      .select("*")
      .order("sort_order");
    if (data && data.length > 0) {
      setArticles(data);
    } else {
      // Seed default articles
      await seedDefaultArticles();
    }
    setLoading(false);
  }

  async function seedDefaultArticles() {
    if (seeded) return;
    setSeeded(true);
    const toInsert = DEFAULT_ARTICLES.map(a => ({
      ...a,
      company_id: null, // shared across all companies
    }));
    const { data } = await supabase
      .from("help_articles")
      .insert(toInsert)
      .select();
    setArticles(data || []);
  }

  // Filter articles by role
  const visibleArticles = articles.filter(a =>
    !a.roles || a.roles.length === 0 || a.roles.includes(userRole || "viewer")
  );

  // Filter by search
  const searchResults = search.trim()
    ? visibleArticles.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.content?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  // Articles for active module
  const moduleArticles = activeModule
    ? visibleArticles.filter(a => a.module === activeModule)
    : [];

  async function saveEdit() {
    if (!activeArticle) return;
    setSaving(true);
    const { data } = await supabase
      .from("help_articles")
      .update({
        title: editForm.title,
        content: editForm.content,
        video_url: editForm.video_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeArticle.id)
      .select()
      .single();
    if (data) {
      setActiveArticle(data);
      setArticles(prev => prev.map(a => a.id === data.id ? data : a));
    }
    setSaving(false);
    setEditing(false);
  }

  async function deleteArticle(id: string) {
    if (!window.confirm("Delete this guide? Cannot be undone.")) return;
    await supabase.from("help_articles").delete().eq("id", id);
    setArticles(prev => prev.filter(a => a.id !== id));
    setActiveArticle(null);
  }

  async function addArticle() {
    const module = activeModule || "getting-started";
    const { data } = await supabase
      .from("help_articles")
      .insert({
        module,
        title: "New Guide",
        slug: `new-guide-${Date.now()}`,
        content: "# New Guide\n\nWrite your guide content here.",
        company_id: null,
        sort_order: (moduleArticles.length + 1) * 10,
        roles: ["director","admin","project_manager","site_supervisor","estimator","procurement","accounts","viewer"],
      })
      .select()
      .single();
    if (data) {
      setArticles(prev => [...prev, data]);
      setActiveArticle(data);
      setEditForm({ title: data.title, content: data.content, video_url: data.video_url || "" });
      setEditing(true);
    }
  }

  // ── Article view ────────────────────────────────────────────────────────
  if (activeArticle) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Back button */}
          <button onClick={() => { setActiveArticle(null); setEditing(false); }}
            className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 transition-colors">
            <ArrowLeft size={16}/> Back to guides
          </button>

          {editing ? (
            /* Edit mode */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Title</label>
                <input value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Video URL (YouTube)</label>
                <input value={editForm.video_url}
                  onChange={e => setEditForm(f => ({ ...f, video_url: e.target.value }))}
                  placeholder="https://www.youtube.com/embed/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Content (Markdown)</label>
                <textarea value={editForm.content}
                  onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                  rows={30}
                  className="w-full px-3 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"/>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                  <Save size={14}/> {saving ? "Saving..." : "Save Guide"}
                </button>
              </div>
            </div>
          ) : (
            /* Read mode */
            <div>
              {/* Article header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      {MODULES.find(m => m.key === activeArticle.module)?.label || activeArticle.module}
                    </span>
                  </div>
                  <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">{activeArticle.title}</h1>
                </div>
                {(userRole === "director" || userRole === "admin") && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setEditForm({ title: activeArticle.title, content: activeArticle.content || "", video_url: activeArticle.video_url || "" }); setEditing(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <Edit size={12}/> Edit
                    </button>
                    <button onClick={() => deleteArticle(activeArticle.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                      <Trash2 size={12}/> Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Video embed */}
              {activeArticle.video_url && (
                <div className="mb-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video">
                  <iframe
                    src={activeArticle.video_url}
                    className="w-full h-full"
                    allowFullScreen
                    title={activeArticle.title}/>
                </div>
              )}
              {!activeArticle.video_url && (userRole === "director" || userRole === "admin") && (
                <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
                  <Play size={20} className="mx-auto text-slate-400 mb-2"/>
                  <p className="text-xs text-slate-400">No video yet. Click Edit to add a YouTube URL.</p>
                </div>
              )}

              {/* Article content */}
              <div className="prose max-w-none">
                {renderMarkdown(activeArticle.content || "")}
              </div>

              {/* Related articles */}
              {moduleArticles.filter(a => a.id !== activeArticle.id).length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3">Related Guides</h3>
                  <div className="space-y-2">
                    {moduleArticles.filter(a => a.id !== activeArticle.id).map(a => (
                      <button key={a.id} onClick={() => setActiveArticle(a)}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.title}</span>
                        <ChevronRight size={14} className="text-slate-400"/>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Home / module list ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2">
            📚 Help Center
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Training guides for Magnus Boys Construction ERP
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guides..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"/>
        </div>

        {/* Search results */}
        {search.trim() && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{search}"
            </h2>
            {searchResults.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No guides found</div>
            ) : (
              <div className="space-y-2">
                {searchResults.map(a => (
                  <button key={a.id} onClick={() => setActiveArticle(a)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all text-left">
                    <div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{a.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {MODULES.find(m => m.key === a.module)?.label}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 flex-shrink-0"/>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Module view */}
        {!search.trim() && activeModule && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setActiveModule(null)}
                className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <ArrowLeft size={16}/> All modules
              </button>
              {(userRole === "director" || userRole === "admin") && (
                <button onClick={addArticle}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
                  <Plus size={12}/> New Guide
                </button>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {MODULES.find(m => m.key === activeModule)?.label}
            </h2>
            {loading ? (
              <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
            ) : moduleArticles.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen size={32} className="mx-auto text-slate-300 mb-3"/>
                <div className="text-slate-400 text-sm">No guides in this module yet</div>
              </div>
            ) : (
              <div className="space-y-3">
                {moduleArticles.map(a => (
                  <button key={a.id} onClick={() => setActiveArticle(a)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all text-left group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={16} className="text-blue-600 dark:text-blue-400"/>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{a.title}</div>
                        {a.video_url && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Play size={10} className="text-red-500"/>
                            <span className="text-[10px] text-slate-400">Video available</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors flex-shrink-0"/>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Module grid — home */}
        {!search.trim() && !activeModule && (
          <div>
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Browse by Module</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MODULES.filter(m => {
                // Filter by role
                if (m.key === "settings" && userRole !== "director") return false;
                if (m.key === "finance" && !["director","admin","accounts"].includes(userRole||"")) return false;
                return true;
              }).map(m => {
                const count = visibleArticles.filter(a => a.module === m.key).length;
                const colors = COLOR_MAP[m.color] || COLOR_MAP.blue;
                return (
                  <button key={m.key} onClick={() => setActiveModule(m.key)}
                    className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all hover:scale-[1.02] text-left ${colors}`}>
                    <div className="mb-3">{m.icon}</div>
                    <div className="text-sm font-bold mb-0.5">{m.label}</div>
                    <div className="text-[10px] opacity-70">{count} guide{count !== 1 ? "s" : ""}</div>
                  </button>
                );
              })}
            </div>

            {/* Quick access */}
            <div className="mt-8">
              <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Quick Start</h2>
              <div className="space-y-2">
                {visibleArticles.filter(a => a.module === "getting-started").map(a => (
                  <button key={a.id} onClick={() => setActiveArticle(a)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 transition-all text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📖</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.title}</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400"/>
                  </button>
                ))}
              </div>
            </div>

            {/* Director: add new guide button */}
            {(userRole === "director" || userRole === "admin") && (
              <div className="mt-6 p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs text-slate-400 mb-3">Director: you can add, edit, and delete guides</p>
                <button onClick={() => { setActiveModule("getting-started"); setTimeout(addArticle, 100); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors mx-auto">
                  <Plus size={14}/> Add New Guide
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
