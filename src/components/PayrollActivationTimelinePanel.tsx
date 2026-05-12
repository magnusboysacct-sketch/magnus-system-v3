// Payroll Activation Timeline Panel - Phase 2F
// Activation timeline and planning dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Activity,
  Target,
  BarChart3,
  Eye,
  Users,
  Shield
} from 'lucide-react';

// Mock data for safe fallback
const mockTimelineData = {
  overallProgress: {
    currentPhase: 'phase_2' as const,
    completionPercentage: 35,
    estimatedCompletion: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    lastUpdated: new Date().toISOString()
  },
  phases: [
    {
      id: 'phase_1',
      name: 'Phase 1 - Preparation',
      status: 'completed' as const,
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 30,
      completionPercentage: 100,
      milestones: [
        {
          id: 'm1',
          name: 'Infrastructure Setup',
          status: 'completed' as const,
          completedDate: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm2',
          name: 'Data Migration',
          status: 'completed' as const,
          completedDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm3',
          name: 'System Testing',
          status: 'completed' as const,
          completedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    },
    {
      id: 'phase_2',
      name: 'Phase 2 - Pilot Rollout',
      status: 'active' as const,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 45,
      completionPercentage: 67,
      milestones: [
        {
          id: 'm4',
          name: 'Core Team Activation',
          status: 'completed' as const,
          completedDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm5',
          name: 'Department Heads',
          status: 'completed' as const,
          completedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm6',
          name: 'Full Department',
          status: 'in_progress' as const,
          targetDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    },
    {
      id: 'phase_3',
      name: 'Phase 3 - Organization Wide',
      status: 'pending' as const,
      startDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 30,
      completionPercentage: 0,
      milestones: [
        {
          id: 'm7',
          name: 'All Departments',
          status: 'pending' as const,
          targetDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm8',
          name: 'Full Migration',
          status: 'pending' as const,
          targetDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm9',
          name: 'System Optimization',
          status: 'pending' as const,
          targetDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    },
    {
      id: 'phase_4',
      name: 'Phase 4 - Optimization',
      status: 'planned' as const,
      startDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 30,
      completionPercentage: 0,
      milestones: [
        {
          id: 'm10',
          name: 'Performance Tuning',
          status: 'planned' as const,
          targetDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm11',
          name: 'Process Optimization',
          status: 'planned' as const,
          targetDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'm12',
          name: 'Final Review',
          status: 'planned' as const,
          targetDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    }
  ],
  criticalPath: [
    {
      id: 'cp1',
      name: 'Infrastructure Readiness',
      status: 'completed' as const,
      impact: 'critical' as const,
      delay: 0,
      estimatedDuration: '5 days'
    },
    {
      id: 'cp2',
      name: 'Data Validation',
      status: 'completed' as const,
      impact: 'critical' as const,
      delay: 0,
      estimatedDuration: '3 days'
    },
    {
      id: 'cp3',
      name: 'Pilot Success Criteria',
      status: 'in_progress' as const,
      impact: 'critical' as const,
      delay: 2,
      estimatedDuration: '7 days'
    },
    {
      id: 'cp4',
      name: 'Governance Approval',
      status: 'pending' as const,
      impact: 'critical' as const,
      delay: 0,
      estimatedDuration: '2 days'
    },
    {
      id: 'cp5',
      name: 'Full Rollout Readiness',
      status: 'pending' as const,
      impact: 'critical' as const,
      delay: 0,
      estimatedDuration: '10 days'
    }
  ],
  riskMitigation: [
    {
      id: 'rm1',
      risk: 'Data Integrity Issues',
      mitigation: 'Enhanced validation protocols',
      status: 'implemented' as const,
      effectiveness: 95
    },
    {
      id: 'rm2',
      risk: 'System Performance',
      mitigation: 'Load testing and optimization',
      status: 'in_progress' as const,
      effectiveness: 78
    },
    {
      id: 'rm3',
      risk: 'User Adoption',
      mitigation: 'Training and support programs',
      status: 'planned' as const,
      effectiveness: 0
    },
    {
      id: 'rm4',
      risk: 'Compliance Requirements',
      mitigation: 'Regular compliance audits',
      status: 'implemented' as const,
      effectiveness: 92
    }
  ]
};

export default function PayrollActivationTimelinePanel() {
  const [timelineData, setTimelineData] = useState(mockTimelineData);
  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState('phases');

  useEffect(() => {
    const loadTimelineData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setTimelineData(mockTimelineData);
      } catch (err) {
        console.error('Failed to load timeline data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTimelineData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'active': case 'in_progress': return 'text-blue-600';
      case 'pending': return 'text-yellow-600';
      case 'planned': return 'text-gray-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'active': case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'planned': return 'bg-gray-100 text-gray-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'active': case 'in_progress': return <Activity className="h-4 w-4 text-blue-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'planned': return <Calendar className="h-4 w-4 text-gray-600" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Activation Timeline...</span>
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
              <Calendar className="h-5 w-5" />
              <span>Activation Timeline Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Activation timeline planning and critical path monitoring
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(timelineData.overallProgress.currentPhase)}`}>
              {timelineData.overallProgress.currentPhase.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Progress */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold">{timelineData.overallProgress.completionPercentage}%</div>
          <div className="text-lg font-medium text-blue-600">
            Overall Progress
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${timelineData.overallProgress.completionPercentage}%` }}
            />
          </div>
          <div className="text-sm text-gray-600">
            Est. completion: {new Date(timelineData.overallProgress.estimatedCompletion).toLocaleDateString()}
          </div>
        </div>

        {/* View Selection */}
        <div className="flex space-x-1 border-b border-gray-200">
          <button
            onClick={() => setSelectedView('phases')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedView === 'phases'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Phases
          </button>
          <button
            onClick={() => setSelectedView('milestones')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedView === 'milestones'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Milestones
          </button>
          <button
            onClick={() => setSelectedView('critical_path')}
            className={`px-4 py-2 text-sm font-medium ${
              selectedView === 'critical_path'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Critical Path
          </button>
        </div>

        {/* Phases View */}
        {selectedView === 'phases' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Activation Phases</h3>
            <div className="space-y-4">
              {timelineData.phases.map((phase, index) => (
                <div key={phase.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(phase.status)}
                      <div>
                        <h4 className="font-medium">{phase.name}</h4>
                        <p className="text-sm text-gray-600">
                          {phase.duration} days • {phase.completionPercentage}% complete
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(phase.status)}`}>
                        {phase.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${phase.completionPercentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>
                      {phase.startDate && `Start: ${new Date(phase.startDate).toLocaleDateString()}`}
                    </span>
                    <span>
                      {phase.endDate && `End: ${new Date(phase.endDate).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones View */}
        {selectedView === 'milestones' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Key Milestones</h3>
            <div className="space-y-3">
              {timelineData.phases.flatMap(phase => 
                phase.milestones.map(milestone => (
                  <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(milestone.status)}
                      <div>
                        <h4 className="font-medium">{milestone.name}</h4>
                        <p className="text-sm text-gray-600">{phase.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(milestone.status)}`}>
                        {milestone.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <div className="text-sm text-gray-600 mt-1">
                        {'completedDate' in milestone && milestone.completedDate && 
                          `Completed: ${new Date(milestone.completedDate).toLocaleDateString()}`
                        }
                        {'targetDate' in milestone && milestone.targetDate && 
                          `Target: ${new Date(milestone.targetDate).toLocaleDateString()}`
                        }
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Critical Path View */}
        {selectedView === 'critical_path' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Critical Path</span>
            </h3>
            <div className="space-y-3">
              {timelineData.criticalPath.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                        {index + 1}
                      </div>
                      {getStatusIcon(item.status)}
                    </div>
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-600">
                        Duration: {item.estimatedDuration}
                        {item.delay > 0 && (
                          <span className="text-red-600 ml-2">Delay: +{item.delay} days</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${getImpactColor(item.impact)}`}>
                      {item.impact.toUpperCase()}
                    </span>
                    <div className="text-sm text-gray-600 mt-1">
                      {item.status.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Mitigation */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Risk Mitigation Strategies</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {timelineData.riskMitigation.map((risk) => (
              <div key={risk.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{risk.risk}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(risk.status)}`}>
                    {risk.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{risk.mitigation}</p>
                {risk.effectiveness > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>Effectiveness</span>
                      <span>{risk.effectiveness}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div 
                        className="bg-green-600 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${risk.effectiveness}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-600">
            Last updated: {new Date(timelineData.overallProgress.lastUpdated).toLocaleString()}
          </span>
          <div className="flex items-center space-x-2">
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </button>
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <BarChart3 className="h-4 w-4 mr-2" />
              Timeline Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
