import { useState } from 'react';
import { Plus, CreditCard as Edit, Trash, User, Mail, Calendar } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardSection,
  CardFooter,
  Button,
  Badge,
  Table,
  type Column,
  EmptyState,
  FormField,
  FormSelect,
  FormTextarea,
  FormDatePicker,
  FormCheckbox,
  FormModal,
  ConfirmModal,
  BaseModal,
} from './index';

interface DemoData {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'completed';
  email: string;
}

export function ComponentShowcase() {
  const [showFormModal, setShowFormModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showBaseModal, setShowBaseModal] = useState(false);

  const demoData: DemoData[] = [
    { id: '1', name: 'John Doe', status: 'active', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', status: 'pending', email: 'jane@example.com' },
    { id: '3', name: 'Bob Johnson', status: 'completed', email: 'bob@example.com' },
  ];

  const columns: Column<DemoData>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const variantMap = {
          active: 'success' as const,
          pending: 'warning' as const,
          completed: 'default' as const,
        };
        return <Badge variant={variantMap[item.status]} dot>{item.status}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: () => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" icon={<Edit className="w-4 h-4" />} />
          <Button variant="ghost" size="sm" icon={<Trash className="w-4 h-4" />} />
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Component Showcase
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Demonstration of all common components in Magnus System v3
        </p>
      </div>

      <Card>
        <CardHeader title="Buttons" subtitle="All button variants and sizes" />
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>

          <div className="flex gap-3 items-center">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
          </div>

          <div className="flex gap-3 items-center">
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />}>With Icon</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Badges" subtitle="Status indicators" />
        <div className="flex gap-3 flex-wrap">
          <Badge variant="default">Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success" dot>Success</Badge>
          <Badge variant="warning" dot>Warning</Badge>
          <Badge variant="danger" dot>Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="success" size="sm">Small</Badge>
          <Badge variant="success" size="lg">Large</Badge>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Data Table"
          subtitle="Sortable table with hover and actions"
          action={
            <Button variant="primary" size="sm" icon={<Plus className="w-4 h-4" />}>
              Add Item
            </Button>
          }
        />
        <Table
          columns={columns}
          data={demoData}
          keyExtractor={(item) => item.id}
          hoverable
          striped
        />
      </Card>

      <Card>
        <CardHeader title="Form Inputs" subtitle="All form field types" />
        <div className="space-y-4">
          <FormField
            label="Text Input"
            placeholder="Enter text..."
            icon={<User className="w-4 h-4" />}
          />

          <FormField
            label="Email with Error"
            type="email"
            placeholder="user@example.com"
            error="Please enter a valid email address"
            icon={<Mail className="w-4 h-4" />}
            required
          />

          <FormSelect
            label="Select Option"
            options={[
              { value: '', label: 'Choose...' },
              { value: '1', label: 'Option 1' },
              { value: '2', label: 'Option 2' },
              { value: '3', label: 'Option 3' },
            ]}
            required
          />

          <FormTextarea
            label="Description"
            placeholder="Enter description..."
            rows={3}
            hint="Maximum 500 characters"
          />

          <FormDatePicker
            label="Start Date"
            required
          />

          <FormCheckbox
            label="I agree to the terms and conditions"
            description="Please read our terms before proceeding"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Modals" subtitle="Different modal types" />
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => setShowFormModal(true)}>
            Form Modal
          </Button>
          <Button variant="danger" onClick={() => setShowConfirmModal(true)}>
            Confirm Modal
          </Button>
          <Button variant="secondary" onClick={() => setShowBaseModal(true)}>
            Base Modal
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Empty State" subtitle="Placeholder when no data exists" />
        <EmptyState
          icon={<User className="w-8 h-8" />}
          title="No users found"
          description="Get started by adding your first user to the system."
          action={{
            label: 'Add User',
            onClick: () => alert('Add user clicked'),
            icon: <Plus className="w-4 h-4" />,
          }}
        />
      </Card>

      <FormModal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSubmit={(e) => {
          e.preventDefault();
          alert('Form submitted!');
          setShowFormModal(false);
        }}
        title="Create New Item"
        submitLabel="Create"
      >
        <div className="space-y-4">
          <FormField label="Name" placeholder="Enter name..." required />
          <FormSelect
            label="Category"
            options={[
              { value: '', label: 'Select category...' },
              { value: 'a', label: 'Category A' },
              { value: 'b', label: 'Category B' },
            ]}
            required
          />
          <FormTextarea label="Notes" rows={3} />
        </div>
      </FormModal>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          alert('Confirmed!');
          setShowConfirmModal(false);
        }}
        title="Delete Item?"
        message="This action cannot be undone. Are you sure you want to delete this item?"
        variant="danger"
        confirmLabel="Delete"
      />

      <BaseModal
        isOpen={showBaseModal}
        onClose={() => setShowBaseModal(false)}
        title="Custom Modal"
        size="lg"
      >
        <div className="p-6">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            This is a base modal that you can customize with any content.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowBaseModal(false)}>
              Close
            </Button>
            <Button variant="primary">Action</Button>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
