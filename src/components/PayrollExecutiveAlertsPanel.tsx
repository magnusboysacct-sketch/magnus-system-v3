// Payroll Executive Alerts Panel - Phase 2F
// Executive alert monitoring and management dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Bell, 
  Filter,
  Search,
  TrendingUp,
  Activity,
  Eye,
  Settings,
  Info
} from 'lucide-react';

// Mock data for safe fallback
const mockAlertsData = {
  alerts: [
    {
      id: '1',
      type: 'governance' as const,
      severity: 'medium' as const,
      title: 'Director Approval Required',
      description: 'Pilot expansion requires director approval before proceeding to Phase 3',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'open' as const,
      assignee: 'Jane Doe',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'medium' as const,
      actions: ['Submit director approval request', 'Update governance documentation']
    },
    {
      id: '2',
      type: 'variance' as const,
      severity: 'low' as const,
      title: 'Net Pay Variance Detected',
      description: '3 workers showing variance above threshold in Finance Department',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      status: 'monitoring' as const,
      assignee: 'Payroll Team',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'low' as const,
      actions: ['Investigate calculation discrepancies', 'Validate worker data']
    },
    {
      id: '3',
      type: 'system' as const,
      severity: 'high' as const,
      title: 'Backup Frequency Below Target',
      description: 'Current backup frequency is 6 hours, target is 4 hours',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      status: 'in_progress' as const,
      assignee: 'IT Operations',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'high' as const,
      actions: ['Adjust backup schedule', 'Monitor storage capacity']
    },
    {
      id: '4',
      type: 'compliance' as const,
      severity: 'low' as const,
      title: 'Documentation Update Required',
      description: 'Migration documentation needs update for compliance requirements',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'resolved' as const,
      assignee: 'Compliance Team',
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'low' as const,
      actions: ['Update documentation', 'Review compliance checklist']
    },
    {
      id: '5',
      type: 'performance' as const,
      severity: 'medium' as const,
      title: 'Processing Time Increase',
      description: 'Average processing time increased from 2.1s to 2.3s',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      status: 'monitoring' as const,
      assignee: 'System Admin',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'medium' as const,
      actions: ['Monitor system performance', 'Optimize database queries']
    }
  ],
  summary: {
    total: 5,
    critical: 0,
    high: 1,
    medium: 2,
    low: 2,
    open: 2,
    in_progress: 1,
    monitoring: 2,
    resolved: 1
  },
  trends: [
    { date: '2024-01-01', critical: 0, high: 1, medium: 3, low: 2 },
    { date: '2024-01-08', critical: 0, high: 2, medium: 2, low: 1 },
    { date: '2024-01-15', critical: 0, high: 1, medium: 3, low: 2 },
    { date: '2024-01-22', critical: 0, high: 1, medium: 2, low: 2 },
    { date: '2024-01-29', critical: 0, high: 1, medium: 2, low: 2 }
  ]
};

export default function PayrollExecutiveAlertsPanel() {
  const [alertsData, setAlertsData] = useState(mockAlertsData);
  const [loading, setLoading] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('active');

  useEffect(() => {
    const loadAlertsData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setAlertsData(mockAlertsData);
      } catch (err) {
        console.error('Failed to load alerts data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAlertsData();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-red-600';
      case 'in_progress': return 'text-yellow-600';
      case 'monitoring': return 'text-blue-600';
      case 'resolved': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'monitoring': return 'bg-blue-100 text-blue-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'governance': return <Settings className="h-4 w-4" />;
      case 'variance': return <TrendingUp className="h-4 w-4" />;
      case 'system': return <AlertTriangle className="h-4 w-4" />;
      case 'compliance': return <Info className="h-4 w-4" />;
      case 'performance': return <Activity className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const filteredAlerts = alertsData.alerts.filter(alert => {
    const matchesSeverity = selectedSeverity === 'all' || alert.severity === selectedSeverity;
    const matchesType = selectedType === 'all' || alert.type === selectedType;
    const matchesSearch = searchQuery === '' || 
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = selectedTab === 'all' || 
      (selectedTab === 'active' && alert.status !== 'resolved') ||
      (selectedTab === 'resolved' && alert.status === 'resolved');
    
    return matchesSeverity && matchesType && matchesSearch && matchesTab;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Executive Alerts...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Executive Alerts Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Real-time alert monitoring and management for payroll migration
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {alertsData.summary.open + alertsData.summary.in_progress} Active
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Alert Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-red-600">{alertsData.summary.critical}</div>
            <div className="text-sm text-gray-600">Critical</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{alertsData.summary.high}</div>
            <div className="text-sm text-gray-600">High</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{alertsData.summary.medium}</div>
            <div className="text-sm text-gray-600">Medium</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{alertsData.summary.low}</div>
            <div className="text-sm text-gray-600">Low</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search alerts..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="governance">Governance</option>
              <option value="variance">Variance</option>
              <option value="system">System</option>
              <option value="compliance">Compliance</option>
              <option value="performance">Performance</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 border-b border-gray-200">
          <button
            onClick={() => setSelectedTab('active')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'active'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Active Alerts ({alertsData.summary.open + alertsData.summary.in_progress + alertsData.summary.monitoring})
          </button>
          <button
            onClick={() => setSelectedTab('resolved')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'resolved'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Resolved ({alertsData.summary.resolved})
          </button>
          <button
            onClick={() => setSelectedTab('all')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedTab === 'all'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Alerts ({alertsData.summary.total})
          </button>
        </div>

        {/* Alerts List */}
        <div className="space-y-3">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <div key={alert.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${getSeverityColor(alert.severity)}`} />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {getTypeIcon(alert.type)}
                        <h4 className="font-medium">{alert.title}</h4>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityBadgeVariant(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(alert.status)}`}>
                          {alert.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(alert.timestamp).toLocaleString()}</span>
                        </span>
                        <span>Assigned to: {alert.assignee}</span>
                        {alert.dueDate && (
                          <span>Due: {new Date(alert.dueDate).toLocaleDateString()}</span>
                        )}
                      </div>
                      {alert.actions && alert.actions.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm font-medium mb-1">Recommended Actions:</div>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {alert.actions.map((action, index) => (
                              <li key={index} className="flex items-center space-x-2">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-600">
              <Bell className="h-8 w-8 mx-auto mb-2" />
              <p>No alerts found matching your criteria</p>
            </div>
          )}
        </div>

        {/* Alert Trends */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Alert Trends (7 Days)</h3>
          <div className="space-y-2">
            {alertsData.trends.map((trend, index) => (
              <div key={trend.date} className="flex items-center justify-between text-sm">
                <span>{new Date(trend.date).toLocaleDateString()}</span>
                <div className="flex items-center space-x-4">
                  <span className="text-red-600">Critical: {trend.critical}</span>
                  <span className="text-orange-600">High: {trend.high}</span>
                  <span className="text-yellow-600">Medium: {trend.medium}</span>
                  <span className="text-blue-600">Low: {trend.low}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-600">
            Last updated: {new Date().toLocaleString()}
          </span>
          <div className="flex items-center space-x-2">
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <Eye className="h-4 w-4 mr-2" />
              View All Alerts
            </button>
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <Settings className="h-4 w-4 mr-2" />
              Alert Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
