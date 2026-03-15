import React, { useEffect, useState } from "react";
import { User, UserPlus, Users, Clock, DollarSign, Phone, Mail, MapPin } from "lucide-react";
import { fetchWorkers, createWorker, updateWorker, deleteWorker } from "../lib/workers";
import type { Worker, WorkerType, PayType } from "../lib/workers";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [filterType, setFilterType] = useState<WorkerType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("active");

  const [formData, setFormData] = useState({
    worker_type: "employee" as WorkerType,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    pay_type: "hourly" as PayType,
    pay_rate: "",
    overtime_rate: "",
    employee_id: "",
    hire_date: "",
    notes: "",
  });

  useEffect(() => {
    loadWorkers();
  }, []);

  async function loadWorkers() {
    try {
      const { data: { user } } = await (await import("../lib/supabase")).supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (await import("../lib/supabase")).supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        const data = await fetchWorkers(profile.company_id);
        setWorkers(data);
      }
    } catch (error) {
      console.error("Error loading workers:", error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingWorker(null);
    setFormData({
      worker_type: "employee",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      pay_type: "hourly",
      pay_rate: "",
      overtime_rate: "",
      employee_id: "",
      hire_date: "",
      notes: "",
    });
    setShowModal(true);
  }

  function openEditModal(worker: Worker) {
    setEditingWorker(worker);
    setFormData({
      worker_type: worker.worker_type,
      first_name: worker.first_name,
      last_name: worker.last_name,
      email: worker.email || "",
      phone: worker.phone || "",
      address: worker.address || "",
      city: worker.city || "",
      state: worker.state || "",
      zip: worker.zip || "",
      pay_type: worker.pay_type || "hourly",
      pay_rate: worker.pay_rate?.toString() || "",
      overtime_rate: worker.overtime_rate?.toString() || "",
      employee_id: worker.employee_id || "",
      hire_date: worker.hire_date || "",
      notes: worker.notes || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const { data: { user } } = await (await import("../lib/supabase")).supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (await import("../lib/supabase")).supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const payload = {
        ...formData,
        company_id: profile.company_id,
        pay_rate: formData.pay_rate ? parseFloat(formData.pay_rate) : null,
        overtime_rate: formData.overtime_rate ? parseFloat(formData.overtime_rate) : null,
        status: "active" as const,
      };

      if (editingWorker) {
        await updateWorker(editingWorker.id, payload);
      } else {
        await createWorker(payload);
      }

      setShowModal(false);
      loadWorkers();
    } catch (error) {
      console.error("Error saving worker:", error);
      alert("Failed to save worker");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this worker?")) return;

    try {
      await deleteWorker(id);
      loadWorkers();
    } catch (error) {
      console.error("Error deleting worker:", error);
      alert("Failed to delete worker");
    }
  }

  const filteredWorkers = workers.filter((w) => {
    if (filterType !== "all" && w.worker_type !== filterType) return false;
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    return true;
  });

  const activeCount = workers.filter((w) => w.status === "active").length;
  const employeeCount = workers.filter((w) => w.worker_type === "employee" && w.status === "active").length;
  const subcontractorCount = workers.filter((w) => w.worker_type === "subcontractor" && w.status === "active").length;

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workers</h1>
          <p className="text-sm text-slate-600">Manage employees, subcontractors, and crews</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <UserPlus size={18} />
          Add Worker
        </button>
      </div>

      <div className="p-8">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5">
                <Users size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Total Active</div>
                <div className="text-2xl font-bold text-slate-900">{activeCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2.5">
                <User size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Employees</div>
                <div className="text-2xl font-bold text-slate-900">{employeeCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2.5">
                <Clock size={20} className="text-purple-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Subcontractors</div>
                <div className="text-2xl font-bold text-slate-900">{subcontractorCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            <option value="employee">Employees</option>
            <option value="subcontractor">Subcontractors</option>
            <option value="crew_lead">Crew Leads</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="text-slate-600">Loading workers...</div>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <Users size={48} className="mx-auto mb-4 text-slate-300" />
            <div className="text-lg font-medium text-slate-900">No workers found</div>
            <div className="mt-1 text-sm text-slate-600">Get started by adding your first worker</div>
            <button
              onClick={openCreateModal}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add Worker
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Pay Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {worker.first_name} {worker.last_name}
                      </div>
                      {worker.employee_id && (
                        <div className="text-xs text-slate-500">ID: {worker.employee_id}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize">
                        {worker.worker_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {worker.email && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Mail size={14} />
                            {worker.email}
                          </div>
                        )}
                        {worker.phone && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone size={14} />
                            {worker.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {worker.pay_rate && (
                        <div className="flex items-center gap-1 text-sm font-medium text-slate-900">
                          <DollarSign size={14} />
                          {worker.pay_rate.toFixed(2)}/{worker.pay_type === "hourly" ? "hr" : "yr"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          worker.status === "active"
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditModal(worker)}
                        className="mr-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(worker.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-xl font-bold text-slate-900">
              {editingWorker ? "Edit Worker" : "Add New Worker"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Worker Type *</label>
                  <select
                    value={formData.worker_type}
                    onChange={(e) => setFormData({ ...formData, worker_type: e.target.value as WorkerType })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="employee">Employee</option>
                    <option value="subcontractor">Subcontractor</option>
                    <option value="crew_lead">Crew Lead</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Employee ID</label>
                  <input
                    type="text"
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Pay Type</label>
                  <select
                    value={formData.pay_type}
                    onChange={(e) => setFormData({ ...formData, pay_type: e.target.value as PayType })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Pay Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.pay_rate}
                    onChange={(e) => setFormData({ ...formData, pay_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Overtime Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.overtime_rate}
                    onChange={(e) => setFormData({ ...formData, overtime_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Hire Date</label>
                <input
                  type="date"
                  value={formData.hire_date}
                  onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {editingWorker ? "Update" : "Create"} Worker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
