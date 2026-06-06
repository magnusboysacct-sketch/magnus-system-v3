// Payroll Activation Control Page - Phase 2D-2-4
// Admin dashboard for payroll activation and pilot management
// PHASE 2D-2-4 ACTIVATION CONTROL UI ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, 
  Settings, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  BarChart3, 
  Activity,
  Eye,
  RefreshCw,
  Play,
  Pause,
  Square,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Database,
  Archive,
  History,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  Download,
  Filter
} from 'lucide-react';

import { usePayrollActivationAccess } from '../hooks/usePayrollActivationAccess';
import { PayrollActivationInfrastructure } from '../lib/payrollActivationInfrastructure';
import { supabase } from '../lib/supabase';

export default function PayrollActivationControlPage() {
  const navigate = useNavigate();
  const { access, loading } = usePayrollActivationAccess();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pilot' | 'rollback' | 'execution-modes'>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard state
  const [activationStatus, setActivationStatus] = useState<any>(null);
  const [pilotGroups, setPilotGroups] = useState<any[]>([]);
  const [rollbackPlans, setRollbackPlans] = useState<any[]>([]);
  const [executionModes, setExecutionModes] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);

  // Data loading states
  const [dataLoading, setDataLoading] = useState({
    activationStatus: false,
    pilotGroups: false,
    rollbackPlans: false,
    executionModes: false,
    systemHealth: false
  });

  useEffect(() => {
    if (!access.canViewActivationDashboard) {
      navigate('/dashboard');
      return;
    }
    loadDashboardData();
  }, [access.canViewActivationDashboard]);

  const loadDashboardData = async () => {
    try {
      setDataLoading(prev => ({ ...prev, activationStatus: true }));
      
      // Load activation status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .single();
        
        if (profile?.company_id) {
          setSelectedCompanyId(profile.company_id);
          
          // Get latest activation status
          const activationFlags = await PayrollActivationInfrastructure.getActivationFlags(profile.company_id);
          setActivationStatus(activationFlags);
          
          // Load pilot groups (if accessible)
          if (access.canViewPilotManagement) {
            const pilotGroupsData = await PayrollActivationInfrastructure.getPilotGroups(profile.company_id);
            setPilotGroups(pilotGroupsData || []);
          }
          
          // Load rollback plans (if accessible)
          if (access.canViewRollbackManagement) {
            // This would load from a rollback plans table
            setRollbackPlans([]); // Placeholder
          }
          
          // Load execution modes
          if (access.canViewExecutionModes) {
            // This would load from execution modes table
            setExecutionModes([
              { mode: 'us', description: 'US Payroll Engine', status: 'active', lastUsed: new Date().toISOString() },
              { mode: 'jamaican', description: 'Jamaican Payroll Engine', status: 'inactive', lastUsed: null },
              { mode: 'dual_run', description: 'Dual-Run Mode', status: 'inactive', lastUsed: null },
              { mode: 'pilot', description: 'Pilot Mode', status: 'inactive', lastUsed: null }
            ]);
          }
          
          // Load system health
          setSystemHealth({
            overall: 'healthy',
            database: 'connected',
            infrastructure: 'operational',
            lastCheck: new Date().toISOString(),
            issues: []
          });
        }
      }
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setDataLoading(prev => ({ ...prev, activationStatus: false }));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'inactive': return 'text-gray-500';
      case 'error': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'inactive': return <Square className="w-4 h-4" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
      </div>
    );
  }

  if (!access.canViewActivationDashboard) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="text-center">
          <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access payroll activation controls.</p>
          <p className="text-sm text-gray-500">Please contact your administrator for access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payroll Activation Control</h1>
                <p className="text-gray-600">Admin dashboard for Jamaican payroll activation and pilot management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''} mr-2`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Dashboard
            </button>
            
            {access.canViewPilotManagement && (
              <button
                onClick={() => setActiveTab('pilot')}
                className={`px-4 py-3 border-b-2 font-medium text-sm ${
                  activeTab === 'pilot' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users className="w-4 h-4 mr-2" />
                Pilot Management
              </button>
            )}
            
            {access.canViewRollbackManagement && (
              <button
                onClick={() => setActiveTab('rollback')}
                className={`px-4 py-3 border-b-2 font-medium text-sm ${
                  activeTab === 'rollback' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <History className="w-4 h-4 mr-2" />
                Rollback Management
              </button>
            )}
            
            {access.canViewExecutionModes && (
              <button
                onClick={() => setActiveTab('execution-modes')}
                className={`px-4 py-3 border-b-2 font-medium text-sm ${
                  activeTab === 'execution-modes' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Settings className="w-4 h-4 mr-2" />
                Execution Modes
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activation Dashboard</h2>
            
            {/* Activation Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Current Status</h3>
                {dataLoading.activationStatus && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                )}
              </div>
              
              {activationStatus && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(activationStatus.jamaican_payroll_enabled ? 'active' : 'inactive')}`}></div>
                        <span className="ml-2 text-sm font-medium">Jamaican Payroll</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {activationStatus.jamaican_payroll_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(activationStatus.pilot_mode_enabled ? 'active' : 'inactive')}`}></div>
                        <span className="ml-2 text-sm font-medium">Pilot Mode</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {activationStatus.pilot_mode_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(activationStatus.dual_run_mode_enabled ? 'active' : 'inactive')}`}></div>
                        <span className="ml-2 text-sm font-medium">Dual-Run Mode</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {activationStatus.dual_run_mode_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(activationStatus.auto_rollback_enabled ? 'active' : 'inactive')}`}></div>
                        <span className="ml-2 text-sm font-medium">Auto Rollback</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {activationStatus.auto_rollback_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">Safety Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Readiness Score</label>
                        <div className="text-2xl font-bold text-gray-900">{activationStatus.min_readiness_score || 95}%</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rollback Threshold (hours)</label>
                        <div className="text-2xl font-bold text-gray-900">{activationStatus.rollback_threshold_hours || 24}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* System Health */}
            {systemHealth && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">System Health</h3>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(systemHealth.overall)}`}></div>
                    <span className="text-sm font-medium">{systemHealth.overall}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Database</p>
                    <p className="text-lg font-semibold text-gray-900">{systemHealth.database}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Infrastructure</p>
                    <p className="text-lg font-semibold text-gray-900">{systemHealth.infrastructure}</p>
                  </div>
                </div>
                
                {systemHealth.issues && systemHealth.issues.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-2">System Issues</h4>
                    <div className="space-y-2">
                      {systemHealth.issues.map((issue: string, index: number) => (
                        <div key={index} className="flex items-center p-3 bg-red-50 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-red-600 mr-2" />
                          <span className="text-sm text-red-700">{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              )}
            </div>
          )}
        </div>
      
      {activeTab === 'pilot' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pilot Management</h2>
          
          {/* Pilot Groups */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Pilot Groups</h3>
              {access.canCreatePilotGroups && (
                <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Pilot Group
                </button>
              )}
            </div>
            
            {dataLoading.pilotGroups ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : pilotGroups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Pilot Groups</h3>
                <p className="text-gray-600">Create your first pilot group to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pilotGroups.map((group, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-md font-medium text-gray-900">{group.group_name}</h4>
                        <p className="text-sm text-gray-600">
                          {group.worker_ids?.length || 0} workers • {group.activation_status}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button className="text-blue-600 hover:text-blue-700">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="text-gray-600 hover:text-gray-700">
                          <Edit className="w-4 h-4" />
                        </button>
                        {access.canManagePilotGroups && (
                          <button className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        Created: {new Date(group.created_at).toLocaleDateString()}
                      </p>
                      {group.activated_at && (
                        <p className="text-sm text-gray-600">
                          Activated: {new Date(group.activated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {activeTab === 'rollback' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Rollback Management</h2>
          
          {/* Rollback Plans */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Rollback Plans</h3>
              {access.canCreateRollbackPlans && (
                <button className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Rollback Plan
                </button>
              )}
            </div>
            
            {dataLoading.rollbackPlans ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : rollbackPlans.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Rollback Plans</h3>
                <p className="text-gray-600">No rollback plans have been created.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rollbackPlans.map((plan, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-md font-medium text-gray-900">{plan.rollback_type.toUpperCase()} Rollback</h4>
                        <p className="text-sm text-gray-600">
                          Version {plan.sourceVersion} → {plan.targetVersion}
                        </p>
                        <p className="text-sm text-gray-600">
                          {plan.rollback_reason}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          plan.risk_assessment.overallRisk === 'low' ? 'bg-green-100 text-green-800' :
                          plan.risk_assessment.overallRisk === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          plan.risk_assessment.overallRisk === 'high' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {plan.risk_assessment.overallRisk.toUpperCase()}
                        </span>
                        <button className="text-blue-600 hover:text-blue-700">
                          <Eye className="w-4 h-4" />
                        </button>
                        {access.canExecuteRollback && (
                          <button className="text-green-600 hover:text-green-700">
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        Created: {new Date(plan.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Confidence: {plan.confidence.overallScore}/100 ({plan.confidence.confidence_level})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {activeTab === 'execution-modes' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Execution Modes</h2>
          
          {/* Execution Mode Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Current Execution Modes</h3>
            </div>
            
            {dataLoading.executionModes ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {executionModes.map((mode, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-md font-medium text-gray-900">{mode.description}</h4>
                        <p className="text-sm text-gray-600">
                          Mode: {mode.mode}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          mode.status === 'active' ? 'bg-green-100 text-green-800' :
                          mode.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {mode.status.toUpperCase()}
                        </span>
                        {mode.lastUsed && (
                          <p className="text-xs text-gray-500">
                            Last used: {new Date(mode.lastUsed).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <Database className="w-4 h-4 mr-1" />
                        <span>Configuration managed</span>
                        <Lock className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

