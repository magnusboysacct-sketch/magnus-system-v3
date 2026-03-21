# Magnus System v3 - Common Component Library

A comprehensive collection of reusable UI components for the Magnus System v3 construction ERP platform.

## Overview

This component library provides standardized, accessible, and theme-aware components that maintain consistency across the entire application. All components support both light and dark modes and follow the existing design system.

## Components

### Modals

#### BaseModal
Foundation modal component with backdrop and escape key handling.

```tsx
import { BaseModal } from '@/components/common';

<BaseModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Modal Title"
  size="md" // 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton={true}
  closeOnBackdrop={true}
  closeOnEscape={true}
>
  <div className="p-6">
    Your content here
  </div>
</BaseModal>
```

#### FormModal
Pre-configured modal for forms with submit/cancel buttons.

```tsx
import { FormModal } from '@/components/common';

<FormModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onSubmit={handleSubmit}
  title="Create New Item"
  submitLabel="Create"
  cancelLabel="Cancel"
  isSubmitting={loading}
>
  <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
</FormModal>
```

#### ConfirmModal
Confirmation dialog with variant styles.

```tsx
import { ConfirmModal } from '@/components/common';

<ConfirmModal
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleDelete}
  title="Delete Item?"
  message="This action cannot be undone."
  variant="danger" // 'danger' | 'warning' | 'info' | 'success'
  confirmLabel="Delete"
  isProcessing={deleting}
/>
```

### Layout Components

#### Card
Standardized card wrapper with consistent styling.

```tsx
import { Card, CardHeader, CardSection, CardFooter } from '@/components/common';

<Card padding="md">
  <CardHeader
    title="Project Summary"
    subtitle="Overview of project metrics"
    action={<button>View All</button>}
  />

  <CardSection>
    Main content here
  </CardSection>

  <CardSection>
    Additional section
  </CardSection>

  <CardFooter>
    <Button variant="secondary">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

### Data Display

#### Table
Sortable, responsive table component.

```tsx
import { Table, type Column } from '@/components/common';

const columns: Column<User>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'email', header: 'Email', sortable: true },
  {
    key: 'status',
    header: 'Status',
    render: (user) => <Badge variant={user.status === 'active' ? 'success' : 'default'}>{user.status}</Badge>
  },
];

<Table
  columns={columns}
  data={users}
  keyExtractor={(user) => user.id}
  onRowClick={(user) => navigate(`/users/${user.id}`)}
  hoverable
  striped
  emptyState={<EmptyState title="No users found" />}
/>
```

#### Badge
Status indicators and labels.

```tsx
import { Badge } from '@/components/common';

<Badge variant="success" size="md" dot>Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Overdue</Badge>
<Badge variant="primary">New</Badge>
```

Variants: `default` | `primary` | `success` | `warning` | `danger` | `info`

Sizes: `sm` | `md` | `lg`

#### EmptyState
Placeholder for empty data states.

```tsx
import { EmptyState } from '@/components/common';
import { Users } from 'lucide-react';

<EmptyState
  icon={<Users className="w-8 h-8" />}
  title="No clients yet"
  description="Get started by adding your first client to the system."
  action={{
    label: "Add Client",
    onClick: () => setShowCreateModal(true),
    icon: <Plus className="w-4 h-4" />
  }}
/>
```

### Form Components

#### Button
Versatile button component with variants and loading states.

```tsx
import { Button } from '@/components/common';
import { Save } from 'lucide-react';

<Button variant="primary" size="md" onClick={handleSave}>
  Save Changes
</Button>

<Button variant="secondary" icon={<Save />} iconPosition="left">
  Save Draft
</Button>

<Button variant="danger" loading={deleting}>
  Delete
</Button>

<Button variant="ghost" fullWidth>
  Full Width Button
</Button>
```

Variants: `primary` | `secondary` | `danger` | `ghost` | `link`

Sizes: `sm` | `md` | `lg`

#### FormField
Standard text input with label, validation, and icons.

```tsx
import { FormField } from '@/components/common';
import { Mail } from 'lucide-react';

<FormField
  label="Email Address"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  hint="We'll never share your email"
  required
  icon={<Mail className="w-4 h-4" />}
  iconPosition="left"
/>
```

#### FormSelect
Dropdown selector with consistent styling.

```tsx
import { FormSelect } from '@/components/common';

<FormSelect
  label="Status"
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  options={[
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' }
  ]}
  required
  error={errors.status}
/>
```

#### FormTextarea
Multi-line text input.

```tsx
import { FormTextarea } from '@/components/common';

<FormTextarea
  label="Description"
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={4}
  hint="Provide detailed information"
  error={errors.description}
/>
```

#### FormDatePicker
Date input with calendar icon.

```tsx
import { FormDatePicker } from '@/components/common';

<FormDatePicker
  label="Start Date"
  value={startDate}
  onChange={(e) => setStartDate(e.target.value)}
  required
  error={errors.startDate}
/>
```

#### FormCheckbox
Checkbox with label and description.

```tsx
import { FormCheckbox } from '@/components/common';

<FormCheckbox
  label="Accept terms and conditions"
  description="Please read our terms before proceeding"
  checked={accepted}
  onChange={(e) => setAccepted(e.target.checked)}
  error={errors.accepted}
/>
```

## Usage Patterns

### Creating a Form with Modal

```tsx
import { FormModal, FormField, FormSelect, FormTextarea } from '@/components/common';

function CreateProjectModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({ name: '', client: '', notes: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    setLoading(true);
    // Submit logic
    setLoading(false);
    onClose();
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Create New Project"
      submitLabel="Create Project"
      isSubmitting={loading}
    >
      <div className="space-y-4">
        <FormField
          label="Project Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <FormSelect
          label="Client"
          value={formData.client}
          onChange={(e) => setFormData({ ...formData, client: e.target.value })}
          options={clientOptions}
          required
        />

        <FormTextarea
          label="Notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </div>
    </FormModal>
  );
}
```

### Creating a Data Table

```tsx
import { Card, CardHeader, Table, Badge, Button, EmptyState } from '@/components/common';
import { Plus, Edit, Trash } from 'lucide-react';

function ProjectsTable() {
  const columns: Column<Project>[] = [
    { key: 'name', header: 'Project Name', sortable: true },
    { key: 'client', header: 'Client', sortable: true },
    {
      key: 'status',
      header: 'Status',
      render: (project) => (
        <Badge variant={project.status === 'active' ? 'success' : 'default'}>
          {project.status}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (project) => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" icon={<Edit className="w-4 h-4" />} />
          <Button variant="ghost" size="sm" icon={<Trash className="w-4 h-4" />} />
        </div>
      )
    }
  ];

  return (
    <Card>
      <CardHeader
        title="Projects"
        subtitle="Manage your construction projects"
        action={
          <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
            New Project
          </Button>
        }
      />

      <Table
        columns={columns}
        data={projects}
        keyExtractor={(project) => project.id}
        hoverable
        emptyState={
          <EmptyState
            title="No projects yet"
            description="Create your first project to get started"
            action={{ label: "Create Project", onClick: handleCreate }}
          />
        }
      />
    </Card>
  );
}
```

## Theming

All components automatically adapt to light/dark mode based on the `dark` class on the document root. The theme toggle is managed globally in the SidebarLayout component.

## Accessibility

- All form fields have proper labels and ARIA attributes
- Modals trap focus and handle keyboard navigation
- Buttons show disabled and loading states
- Error messages are properly associated with inputs

## Best Practices

1. **Always use FormModal for forms** - Provides consistent submit/cancel UX
2. **Use ConfirmModal for destructive actions** - Prevents accidental deletions
3. **Provide emptyState for tables** - Better UX when no data exists
4. **Use Badge for status indicators** - Consistent visual language
5. **Always set button variants** - Clear visual hierarchy
6. **Include error messages in forms** - Guide users to fix issues
7. **Use Card components for content sections** - Consistent spacing and borders

## Migration Guide

To migrate existing code to use these components:

### Before:
```tsx
<div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
  <h2 className="text-xl font-semibold">Title</h2>
  <div className="mt-4">Content</div>
</div>
```

### After:
```tsx
<Card>
  <CardHeader title="Title" />
  <div>Content</div>
</Card>
```

## TypeScript Support

All components are fully typed with TypeScript. Generic components like `Table` support custom data types:

```tsx
interface CustomData {
  id: string;
  name: string;
  value: number;
}

const columns: Column<CustomData>[] = [...];
<Table<CustomData> columns={columns} data={data} ... />
```

## Component Architecture

- **Zero dependencies on business logic** - Pure UI components
- **Consistent with existing theme** - Matches current color palette and spacing
- **Fully responsive** - Works on all screen sizes
- **Dark mode ready** - Automatic theme switching
- **Accessible** - WCAG compliant
- **Type-safe** - Full TypeScript support

## Future Enhancements

Planned additions to the component library:
- Toast/notification system
- Drawer/slide-over panel
- Tabs component
- Accordion component
- Progress indicators
- Skeleton loaders
- Tooltip component
- Popover component
