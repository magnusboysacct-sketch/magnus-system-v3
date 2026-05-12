// Payroll Executive Risk Panel - Phase 2F
// Executive risk monitoring and assessment dashboard
// PHASE 2F EXECUTIVE DASHBOARD ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Activity,
  Target,
  BarChart3,
  Eye,
  Clock
} from 'lucide-react';

// Mock data for safe fallback
const mockRiskData = {
  overallRiskScore: 23,
  riskLevel: 'low' as const,
  riskFactors: {
    calculationConsistency: {
      score: 88,
      trend: 'improving' as const,
      impact: 'low' as const,
      status: 'healthy' as const
    },
    varianceControl: {
      score: 75,
      trend: 'stable' as const,
      impact: 'medium' as const,
      status: 'monitoring' as const
    },
    governanceCompliance: {
      score: 82,
      trend: 'improving' as const,
      impact: 'low' as const,
      status: 'healthy' as const
    },
    rollbackReadiness: {
      score: 90,
      trend: 'stable' as const,
      impact: 'low' as const,
      status: 'ready' as const
    },
    operationalHardening: {
      score: 78,
      trend: 'improving' as const,
      impact: 'medium' as const,
      status: 'in_progress' as const
    }
  },
  criticalRisks: [
    {
      id: '1',
      riskType: 'Governance Approval',
      description: 'Director approval required for pilot expansion',
      severity: 'medium' as const,
      mitigation: 'Submit director approval request',
      status: 'open' as const,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '2',
      riskType: 'Variance Control',
      description: 'Net pay variance above threshold for 3 workers',
      severity: 'low' as const,
      mitigation: 'Investigate calculation discrepancies',
      status: 'monitoring' as const,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  riskTrends: [
    { date: '2024-01-01', overallScore: 35, calculationScore: 75, varianceScore: 60 },
    { date: '2024-01-08', overallScore: 32, calculationScore: 78, varianceScore: 58 },
    { date: '2024-01-15', overallScore: 28, calculationScore: 82, varianceScore: 55 },
    { date: '2024-01-22', overallScore: 25, calculationScore: 85, varianceScore: 52 },
    { date: '2024-01-29', overallScore: 23, calculationScore: 88, varianceScore: 50 }
  ],
  recommendations: [
    'Complete director approval for pilot expansion',
    'Monitor variance control metrics closely',
    'Continue operational hardening improvements',
    'Maintain rollback readiness procedures'
  ]
};

export default function PayrollExecutiveRiskPanel() {
  const [riskData, setRiskData] = useState(mockRiskData);
  const [loading, setLoading] = useState(false);
  const [selectedRiskFactor, setSelectedRiskFactor] = useState<string | null>(null);

  useEffect(() => {
    const loadRiskData = async () => {
      setLoading(true);
      try {
        // Use mock data as safe fallback
        setRiskData(mockRiskData);
      } catch (err) {
        console.error('Failed to load risk data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRiskData();
  }, []);

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 60) return 'text-orange-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'improving' ? 
      <TrendingUp className="h-4 w-4 text-green-600" /> : 
      trend === 'declining' ? 
      <TrendingDown className="h-4 w-4 text-red-600" /> : 
      <Activity className="h-4 w-4 text-blue-600" />;
  };

  const overallRiskLevel = riskData.riskLevel === 'low' ? 'Low Risk' :
                         riskData.riskLevel === 'medium' ? 'Moderate Risk' :
                         riskData.riskLevel === 'high' ? 'High Risk' : 'Critical Risk';

  const riskLevelColor = riskData.riskLevel === 'low' ? 'text-green-600' :
                       riskData.riskLevel === 'medium' ? 'text-yellow-600' :
                       riskData.riskLevel === 'high' ? 'text-orange-600' : 'text-red-600';

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Activity className="h-6 w-6 animate-spin" />
            <span>Loading Risk Panel...</span>
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
              <AlertTriangle className="h-5 w-5" />
              <span>Executive Risk Panel</span>
            </h3>
            <p className="text-sm text-gray-600">
              Production risk assessment and critical risk monitoring
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeVariant(riskData.riskLevel)}`}>
              {overallRiskLevel}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-6">
        {/* Overall Risk Score */}
        <div className="text-center space-y-2">
          <div className="text-4xl font-bold">{riskData.overallRiskScore}%</div>
          <div className={`text-lg font-medium ${riskLevelColor}`}>
            {overallRiskLevel}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${100 - riskData.overallRiskScore}%` }}
            />
          </div>
        </div>

        {/* Risk Factors */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Risk Factors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(riskData.riskFactors).map(([key, factor]) => (
              <div 
                key={key}
                className="p-4 border rounded-lg space-y-2 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setSelectedRiskFactor(selectedRiskFactor === key ? null : key)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex items-center space-x-2">
                    {getTrendIcon(factor.trend)}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(factor.score)}`}>
                      {factor.score}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${factor.score}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Impact: {factor.impact}</span>
                  <span>Status: {factor.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Critical Risks */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Critical Risks</h3>
          {riskData.criticalRisks.length > 0 ? (
            <div className="space-y-3">
              {riskData.criticalRisks.map((risk) => (
                <div key={risk.id} className="border border-orange-200 bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium flex items-center justify-between">
                        <span>{risk.riskType}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskBadgeVariant(risk.severity)}`}>
                          {risk.severity.toUpperCase()}
                        </span>
                      </h4>
                      <div className="space-y-2">
                        <p>{risk.description}</p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>Due: {new Date(risk.dueDate).toLocaleDateString()}</span>
                          </span>
                          <span className="font-medium">Status: {risk.status}</span>
                        </div>
                        <p className="text-sm font-medium">Mitigation: {risk.mitigation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-600">
              <Shield className="h-8 w-8 mx-auto mb-2" />
              <p>No critical risks identified</p>
            </div>
          )}
        </div>

        {/* Risk Trends */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Risk Trends (30 Days)</h3>
          <div className="space-y-2">
            {riskData.riskTrends.map((trend, index) => (
              <div key={trend.date} className="flex items-center justify-between text-sm">
                <span>{new Date(trend.date).toLocaleDateString()}</span>
                <div className="flex items-center space-x-4">
                  <span className={getRiskColor(100 - trend.overallScore)}>
                    Overall: {trend.overallScore}%
                  </span>
                  <span className={getRiskColor(100 - trend.calculationScore)}>
                    Calculation: {trend.calculationScore}%
                  </span>
                  <span className={getRiskColor(100 - trend.varianceScore)}>
                    Variance: {trend.varianceScore}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Risk Mitigation Recommendations</h3>
          <div className="space-y-2">
            {riskData.recommendations.map((recommendation, index) => (
              <div key={index} className="flex items-start space-x-2 p-3 bg-gray-50 rounded-lg">
                <Target className="h-4 w-4 mt-0.5 text-blue-600" />
                <span className="text-sm">{recommendation}</span>
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
              View Risk Report
            </button>
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50">
              <BarChart3 className="h-4 w-4 mr-2" />
              Detailed Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
