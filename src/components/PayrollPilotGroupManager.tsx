// Payroll Pilot Group Manager - Phase 2D-2-4
// Component for creating and managing pilot groups
// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  X, 
  Check, 
  CheckCircle,
  AlertTriangle,
  Clock,
  Shield,
  Lock,
  Unlock,
  UserMinus
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PayrollPilotGroupManagerProps {
  companyId: string;
  onGroupCreated?: (group: any) => void;
  onGroupUpdated?: (group: any) => void;
  onGroupDeleted?: (groupId: string) => void;
}

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
}

export default function PayrollPilotGroupManager({ 
  companyId, 
  onGroupCreated, 
  onGroupUpdated, 
  onGroupDeleted 
}: PayrollPilotGroupManagerProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [availableWorkers, setAvailableWorkers] = useState<Worker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const loadAvailableWorkers = async () => {
    try {
      setLoading(true);
      const { data: workers } = await supabase
        .from('workers')
        .select('id, first_name, last_name, email, department')
        .eq('company_id', companyId)
        .order('first_name, last_name');

      setAvailableWorkers(workers || []);
    } catch (error) {
      console.error('Failed to load workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedWorkers.length === 0) {
      return;
    }

    try {
      setLoading(true);
      
      // This would call the actual API to create a pilot group
      const newGroup = {
        company_id: companyId,
        group_name: groupName.trim(),
        worker_ids: selectedWorkers,
        activation_status: 'pending',
        created_at: new Date().toISOString(),
        notes: `Created with ${selectedWorkers.length} workers`
      };

      console.log('Creating pilot group:', newGroup);
      
      // Reset form
      setGroupName('');
      setSelectedWorkers([]);
      setShowCreateForm(false);
      
      if (onGroupCreated) {
        onGroupCreated(newGroup);
      }
      
    } catch (error) {
      console.error('Failed to create pilot group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = (group: any) => {
    setEditingGroup(group);
    setGroupName(group.group_name);
    setSelectedWorkers(group.worker_ids || []);
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !groupName.trim()) {
      return;
    }

    try {
      setLoading(true);
      
      // This would call the actual API to update the pilot group
      const updatedGroup = {
        ...editingGroup,
        group_name: groupName.trim(),
        worker_ids: selectedWorkers,
        updated_at: new Date().toISOString(),
        notes: `Updated with ${selectedWorkers.length} workers`
      };

      console.log('Updating pilot group:', updatedGroup);
      
      // Reset form
      setEditingGroup(null);
      setGroupName('');
      setSelectedWorkers([]);
      
      if (onGroupUpdated) {
        onGroupUpdated(updatedGroup);
      }
      
    } catch (error) {
      console.error('Failed to update pilot group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this pilot group? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      
      // This would call the actual API to delete the pilot group
      console.log('Deleting pilot group:', groupId);
      
      if (onGroupDeleted) {
        onGroupDeleted(groupId);
      }
      
    } catch (error) {
      console.error('Failed to delete pilot group:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWorkerSelection = (workerId: string) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const filteredWorkers = availableWorkers.filter(worker =>
    `${worker.first_name} ${worker.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Pilot Group Manager</h3>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Group
        </button>
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingGroup) && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            {editingGroup ? 'Edit Pilot Group' : 'Create New Pilot Group'}
          </h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter group name..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Workers</label>
              <div className="mb-2">
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Search workers..."
                  />
                  <span className="text-sm text-gray-500">
                    {selectedWorkers.length} selected
                  </span>
                </div>
              </div>
              
              <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                {filteredWorkers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <Search className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No workers found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredWorkers.map(worker => (
                      <div key={worker.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={worker.id}
                            checked={selectedWorkers.includes(worker.id)}
                            onChange={() => toggleWorkerSelection(worker.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <label htmlFor={worker.id} className="ml-3 flex-1">
                            <span className="text-sm font-medium text-gray-900">
                              {worker.first_name} {worker.last_name}
                            </span>
                            <span className="text-sm text-gray-500">
                              ({worker.department})
                            </span>
                          </label>
                        </div>
                        <span className="text-sm text-gray-500">
                          {worker.email}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingGroup(null);
                  setGroupName('');
                  setSelectedWorkers([]);
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              
              {editingGroup && (
                <button
                  onClick={handleUpdateGroup}
                  disabled={!groupName.trim() || selectedWorkers.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Update Group
                    </>
                  )}
                </button>
              )}
              
              {!editingGroup && (
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedWorkers.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Group
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Worker Selection Summary */}
      {selectedWorkers.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-md font-medium text-gray-900">Selected Workers</h4>
            <span className="text-sm text-blue-600">{selectedWorkers.length} workers</span>
          </div>
          <div className="space-y-2">
            {selectedWorkers.slice(0, 5).map(workerId => {
              const worker = availableWorkers.find(w => w.id === workerId);
              return worker ? (
                <div key={workerId} className="flex items-center justify-between p-2 bg-white rounded border">
                  <span className="text-sm font-medium text-gray-900">
                    {worker.first_name} {worker.last_name}
                  </span>
                  <button
                    onClick={() => toggleWorkerSelection(workerId)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ) : null;
            })}
            {selectedWorkers.length > 5 && (
              <div className="text-center pt-2">
                <span className="text-sm text-gray-500">... and {selectedWorkers.length - 5} more</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
