import { type Decision, type ActionType, type Priority } from "./decisionEngine";
import { type Action, type ActionState, storeActionFeedback, getActionFeedbackForDecision } from "./actionEngine";
import { type ProjectTask } from "./tasks";
import { type TaskForecast } from "./aiForecast";
import { type RiskLevel, type PerformanceTrend } from "./aiForecast";
import { type AggregatedMaterialRequirement } from "./taskProcurement";

// In-memory pattern stores
const projectPatternStore = new Map<string, OptimizationPattern[]>();
const globalPatternStore = new Map<string, OptimizationPattern[]>();

// Store pattern in appropriate context
function storePattern(pattern: OptimizationPattern): void {
  if (pattern.contextScope === "project" && pattern.projectId) {
    if (!projectPatternStore.has(pattern.projectId)) {
      projectPatternStore.set(pattern.projectId, []);
    }
    projectPatternStore.get(pattern.projectId)!.push(pattern);
  } else {
    // Global patterns use action type + scenario signature as key
    const key = `${pattern.actionType}_${JSON.stringify(pattern.scenarioSignature)}`;
    if (!globalPatternStore.has(key)) {
      globalPatternStore.set(key, []);
    }
    globalPatternStore.get(key)!.push(pattern);
  }
}

// Get patterns for a project (both project-specific and global)
function getPatternsForProject(projectId: string): OptimizationPattern[] {
  const projectPatterns = projectPatternStore.get(projectId) || [];
  const globalPatterns: OptimizationPattern[] = [];
  
  // Get relevant global patterns
  for (const [key, patterns] of globalPatternStore.entries()) {
    globalPatterns.push(...patterns);
  }
  
  return [...projectPatterns, ...globalPatterns];
}

// Get global patterns only
function getGlobalPatterns(): OptimizationPattern[] {
  const globalPatterns: OptimizationPattern[] = [];
  for (const patterns of globalPatternStore.values()) {
    globalPatterns.push(...patterns);
  }
  return globalPatterns;
}

// Optimization pattern types
export type ScenarioSignature = {
  taskType?: string;
  taskCategory?: string;
  boqLinked: boolean;
  weatherSensitive: boolean;
  delayRiskLevel: RiskLevel;
  costRiskLevel: RiskLevel;
  crewSizeBand: "small" | "medium" | "large";
  costRiskBand: "low" | "medium" | "high";
  quantityBand: "small" | "medium" | "large";
  weatherImpactBand: "low" | "medium" | "high";
};

// Optimization model
export interface OptimizationPattern {
  id: string;
  actionType: ActionType;
  scenarioSignature: ScenarioSignature;
  historicalEffectiveness: number;
  sampleCount: number;
  confidence: number;
  recommendedAdjustment: OptimizationAdjustment;
  expectedImprovement: number;
  optimizationReason: string;
  lastUpdated: Date;
  contextScope: "global" | "project";
  projectId?: string;
}

// Optimization adjustment types
export type OptimizationAdjustment = {
  confidenceDelta: number;
  impactScoreDelta: number;
  priorityWeightDelta: number;
  recommendedCrewSize?: number;
  recommendedRate?: number;
  recommendedTiming?: "immediate" | "standard" | "delayed";
  recommendedFrequency?: "low" | "medium" | "high";
};

// Optimization context
export interface OptimizationContext {
  projectId: string;
  tasks: ProjectTask[];
  forecast: TaskForecast[];
  materialSummary: AggregatedMaterialRequirement[];
  boqItems: any[];
  currentDecisions: Decision[];
  availableActions: Action[];
}

// Create scenario signature from task and context
export function createScenarioSignature(task: ProjectTask, forecast: TaskForecast): ScenarioSignature {
  const taskType = task.task_name.toLowerCase().split(' ')[0]; // Extract first word as task type
  const taskCategory = task.task_name.toLowerCase().includes('masonry') ? 'masonry' : 
                     task.task_name.toLowerCase().includes('concrete') ? 'concrete' :
                     task.task_name.toLowerCase().includes('electrical') ? 'electrical' :
                     task.task_name.toLowerCase().includes('plumbing') ? 'plumbing' :
                     'general';
  
  const boqLinked = !!task.boq_item_id;
  const weatherSensitive = forecast.weatherImpact > 1.1;
  const delayRiskLevel = forecast.delayRiskLevel;
  const costRiskLevel = forecast.costRiskLevel;
  
  // Determine bands
  const crewSize = task.crew_size ?? 1;
  const quantity = task.quantity ?? 0;
  const crewSizeBand = crewSize <= 2 ? "small" : crewSize <= 5 ? "medium" : "large";
  const costRiskBand = costRiskLevel === "critical" ? "high" : costRiskLevel === "high" ? "medium" : "low";
  const quantityBand = quantity <= 100 ? "small" : quantity <= 500 ? "medium" : "large";
  const weatherImpactBand = forecast.weatherImpact > 1.3 ? "high" : forecast.weatherImpact > 1.1 ? "medium" : "low";
  
  return {
    taskType,
    taskCategory,
    boqLinked,
    weatherSensitive,
    delayRiskLevel,
    costRiskLevel,
    crewSizeBand,
    costRiskBand,
    quantityBand,
    weatherImpactBand
  };
}

// Analyze optimization patterns from action history
export function analyzeOptimizationPatterns(
  actions: Action[],
  tasks: ProjectTask[],
  forecast: TaskForecast[],
  materialSummary: AggregatedMaterialRequirement[],
  projectId?: string
): OptimizationPattern[] {
  const patterns: Map<string, OptimizationPattern> = new Map();
  
  // Group actions by scenario signature and context
  for (const action of actions) {
    if (action.executionStatus !== "done" || action.effectivenessScore === undefined) continue;
    
    // Find corresponding task and forecast
    const task = tasks.find(t => t.id === action.targetId);
    const taskForecast = forecast.find(f => f.taskId === action.targetId);
    
    if (!task || !taskForecast) continue;
    
    const signature = createScenarioSignature(task, taskForecast);
    const signatureKey = JSON.stringify(signature);
    
    // Determine context scope based on sample size and project data
    const contextScope = projectId ? "project" : "global";
    
    // Get or create pattern
    let pattern = patterns.get(signatureKey);
    if (!pattern) {
      pattern = {
        id: `pattern_${action.actionType}_${signatureKey}`,
        actionType: action.actionType,
        scenarioSignature: signature,
        historicalEffectiveness: 0,
        sampleCount: 0,
        confidence: 0.5, // Base confidence
        recommendedAdjustment: {
          confidenceDelta: 0,
          impactScoreDelta: 0,
          priorityWeightDelta: 0
        },
        expectedImprovement: 0,
        optimizationReason: "",
        lastUpdated: new Date(),
        contextScope,
        projectId: contextScope === "project" ? projectId : undefined
      };
      patterns.set(signatureKey, pattern);
    }
    
    // Update pattern with new data
    pattern.sampleCount++;
    const totalEffectiveness = pattern.historicalEffectiveness * (pattern.sampleCount - 1) + action.effectivenessScore;
    pattern.historicalEffectiveness = totalEffectiveness / pattern.sampleCount;
    
    // Adjust confidence growth based on context scope
    const confidenceGrowthRate = pattern.contextScope === "project" ? 0.025 : 0.01; // Faster growth for project patterns
    pattern.confidence = Math.min(0.95, 0.5 + (pattern.sampleCount * confidenceGrowthRate));
    pattern.lastUpdated = new Date();
    
    // Store the pattern
    storePattern(pattern);
  }
  
  return Array.from(patterns.values());
}

// Get optimized decision weights based on historical patterns
export function getOptimizedDecisionWeights(
  decisions: Decision[],
  context: OptimizationContext
): Map<string, { confidenceDelta: number; impactScoreDelta: number; priorityWeightDelta: number }> {
  const weights = new Map<string, { confidenceDelta: number; impactScoreDelta: number; priorityWeightDelta: number }>();
  
  // Get patterns for this project (both project-specific and global)
  const allPatterns = getPatternsForProject(context.projectId);
  
  // Analyze patterns for each decision
  for (const decision of decisions) {
    const relevantActions = context.availableActions.filter(a => a.decisionId === decision.id);
    
    if (relevantActions.length === 0) continue;
    
    for (const action of relevantActions) {
      if (action.executionStatus !== "done" || action.effectivenessScore === undefined) continue;
      
      const task = context.tasks.find(t => t.id === action.targetId);
      const taskForecast = context.forecast.find(f => f.taskId === action.targetId);
      
      if (!task || !taskForecast) continue;
      
      const signature = createScenarioSignature(task, taskForecast);
      const feedback = getActionFeedbackForDecision(decision.id);
      
      // Find best matching pattern (prioritize project-specific)
      let bestPattern: OptimizationPattern | undefined;
      
      // First look for project-specific patterns
      const projectPatterns = allPatterns.filter(p => 
        p.contextScope === "project" && 
        p.projectId === context.projectId &&
        p.actionType === action.actionType && 
        JSON.stringify(p.scenarioSignature) === JSON.stringify(signature)
      );
      
      if (projectPatterns.length > 0) {
        bestPattern = projectPatterns.sort((a, b) => b.confidence - a.confidence)[0];
      } else {
        // Fallback to global patterns
        const globalPatterns = allPatterns.filter(p => 
          p.contextScope === "global" &&
          p.actionType === action.actionType && 
          JSON.stringify(p.scenarioSignature) === JSON.stringify(signature)
        );
        
        if (globalPatterns.length > 0) {
          bestPattern = globalPatterns.sort((a, b) => b.confidence - a.confidence)[0];
        }
      }
      
      let confidenceDelta = 0;
      let impactScoreDelta = 0;
      let priorityWeightDelta = 0;
      let optimizationReason = "";
      
      if (bestPattern && bestPattern.sampleCount >= 2) {
        // Adjust optimization based on context scope
        const contextMultiplier = bestPattern.contextScope === "project" ? 1.2 : 1.0; // Boost project patterns
        
        // High effectiveness patterns get boosted confidence
        if (bestPattern.historicalEffectiveness >= 70) {
          confidenceDelta = 0.1 * contextMultiplier;
          impactScoreDelta = 10 * contextMultiplier;
          priorityWeightDelta = 1 * contextMultiplier;
          optimizationReason = `Strong ${bestPattern.contextScope} performance (${bestPattern.sampleCount} samples, ${bestPattern.historicalEffectiveness.toFixed(1)}% avg)`;
        } else if (bestPattern.historicalEffectiveness >= 50) {
          confidenceDelta = 0.05 * contextMultiplier;
          impactScoreDelta = 5 * contextMultiplier;
          optimizationReason = `Moderate ${bestPattern.contextScope} performance (${bestPattern.sampleCount} samples, ${bestPattern.historicalEffectiveness.toFixed(1)}% avg)`;
        } else if (bestPattern.historicalEffectiveness < 30) {
          confidenceDelta = -0.1 * contextMultiplier;
          impactScoreDelta = -5 * contextMultiplier;
          priorityWeightDelta = -1 * contextMultiplier;
          optimizationReason = `Poor ${bestPattern.contextScope} performance (${bestPattern.sampleCount} samples, ${bestPattern.historicalEffectiveness.toFixed(1)}% avg)`;
        }
      }
      
      // Scenario-specific optimizations
      if (signature.weatherSensitive && bestPattern && bestPattern.historicalEffectiveness >= 60) {
        impactScoreDelta += 5;
        optimizationReason += "Weather-sensitive scenario with proven effectiveness. ";
      }
      
      if (signature.boqLinked && bestPattern && bestPattern.historicalEffectiveness >= 60) {
        confidenceDelta += 0.05;
        optimizationReason += "BOQ-linked task with proven effectiveness. ";
      }
      
      if (signature.delayRiskLevel === "critical" && bestPattern && bestPattern.historicalEffectiveness >= 50) {
        priorityWeightDelta += 2;
        optimizationReason += "High-risk scenario with proven mitigation. ";
      }
      
      const key = `${decision.actionType}_${JSON.stringify(signature)}`;
      weights.set(key, { confidenceDelta, impactScoreDelta, priorityWeightDelta });
    }
  }
  
  return weights;
}

// Get recommended crew adjustment
export function getRecommendedCrewAdjustment(
  task: ProjectTask,
  context: OptimizationContext
): { recommendedCrewSize: number | undefined; recommendedReason: string } {
  const forecast = context.forecast.find(f => f.taskId === task.id);
  if (!forecast) return { recommendedCrewSize: undefined, recommendedReason: "No forecast available" };
  
  const signature = createScenarioSignature(task, forecast);
  const patterns = analyzeOptimizationPatterns(context.availableActions, context.tasks, context.forecast, context.materialSummary, context.projectId);
  const pattern = patterns.find(p => 
    p.actionType === "add_crew" && 
    JSON.stringify(p.scenarioSignature) === JSON.stringify(signature)
  );
  
  if (pattern && pattern.sampleCount >= 3 && pattern.historicalEffectiveness >= 60) {
    // Calculate optimal crew size based on historical data
    const baseCrew = task.crew_size ?? 1;
    const effectivenessPerCrew = pattern.historicalEffectiveness / 100;
    
    if (effectivenessPerCrew > 0.8) {
      const recommendedCrew = Math.min(baseCrew + Math.ceil((baseCrew * 0.5)), baseCrew + 2);
      return {
        recommendedCrewSize: recommendedCrew,
        recommendedReason: `Historical data shows ${effectivenessPerCrew.toFixed(2)} effectiveness per crew member in similar scenarios (${pattern.sampleCount} samples, ${pattern.contextScope} learning)`
      };
    }
  }
  
  return { recommendedCrewSize: undefined, recommendedReason: "Insufficient data for crew optimization" };
}

// Get recommended rate adjustment
export function getRecommendedRateAdjustment(
  task: ProjectTask,
  context: OptimizationContext
): { recommendedRate: number | undefined; recommendedReason: string } {
  const forecast = context.forecast.find(f => f.taskId === task.id);
  if (!forecast) return { recommendedRate: undefined, recommendedReason: "No forecast available" };
  
  const signature = createScenarioSignature(task, forecast);
  const patterns = analyzeOptimizationPatterns(context.availableActions, context.tasks, context.forecast, context.materialSummary, context.projectId);
  const pattern = patterns.find(p => 
    p.actionType === "increase_rate" && 
    JSON.stringify(p.scenarioSignature) === JSON.stringify(signature)
  );
  
  if (pattern && pattern.sampleCount >= 3 && pattern.historicalEffectiveness >= 60) {
    const baseRate = task.production_rate_per_day ?? 0;
    const effectivenessPerRate = pattern.historicalEffectiveness / 100;
    
    if (effectivenessPerRate > 0.6) {
      const recommendedRate = Math.round(baseRate * (1 + (effectivenessPerRate * 0.3)));
      return {
        recommendedRate,
        recommendedReason: `Historical data shows ${effectivenessPerRate.toFixed(2)} effectiveness per rate unit in similar scenarios (${pattern.sampleCount} samples, ${pattern.contextScope} learning)`
      };
    }
  }
  
  return { recommendedRate: undefined, recommendedReason: "Insufficient data for rate optimization" };
}

// Get optimized procurement timing
export function getOptimizedProcurementTiming(
  task: ProjectTask,
  materialSummary: AggregatedMaterialRequirement[],
  context: OptimizationContext
): { recommendedTiming: "immediate" | "standard" | "delayed"; recommendedReason: string } {
  const forecast = context.forecast.find(f => f.taskId === task.id);
  if (!forecast) return { recommendedTiming: "standard", recommendedReason: "No forecast available" };
  
  const signature = createScenarioSignature(task, forecast);
  const patterns = analyzeOptimizationPatterns(context.availableActions, context.tasks, context.forecast, context.materialSummary, context.projectId);
  const pattern = patterns.find(p => 
    p.actionType === "generate_procurement" && 
    JSON.stringify(p.scenarioSignature) === JSON.stringify(signature)
  );
  
  // Check for upcoming material requirements
  const taskMaterials = materialSummary.filter(m => m.sourceTasks.some(t => t.taskId === task.id));
  const urgentMaterials = taskMaterials.filter(m => {
    if (!m.neededByDate) return false;
    const daysUntilNeeded = Math.ceil((new Date(m.neededByDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
    return daysUntilNeeded < 14;
  });
  
  if (pattern && pattern.sampleCount >= 2 && pattern.historicalEffectiveness >= 70) {
    if (urgentMaterials.length > 0 && forecast.delayRiskLevel !== "low") {
      return {
        recommendedTiming: "immediate",
        recommendedReason: `High ${pattern.contextScope} effectiveness for urgent procurement in similar scenarios (${pattern.sampleCount} samples) with ${urgentMaterials.length} urgent materials`
      };
    } else if (forecast.delayRiskLevel === "critical") {
      return {
        recommendedTiming: "immediate",
        recommendedReason: `Critical risk scenario with proven ${pattern.contextScope} procurement effectiveness`
      };
    }
  }
  
  if (urgentMaterials.length > 0) {
    return {
      recommendedTiming: "standard",
      recommendedReason: `${urgentMaterials.length} materials needed within 14 days`
    };
  }
  
  return {
    recommendedTiming: "delayed",
    recommendedReason: "No immediate procurement urgency detected"
  };
}

// Optimize project decisions based on patterns
export function optimizeProjectDecisions(
  decisions: Decision[],
  context: OptimizationContext
): Decision[] {
  const optimizedDecisions = [...decisions];
  const weights = getOptimizedDecisionWeights(decisions, context);
  
  // Apply optimizations to decisions
  return optimizedDecisions.map(decision => {
    const task = decision.taskId ? context.tasks.find(t => t.id === decision.taskId) : undefined;
    const taskForecast = decision.taskId ? context.forecast.find(f => f.taskId === decision.taskId) : undefined;
    
    if (task && taskForecast) {
      const signature = createScenarioSignature(task, taskForecast);
      const weight = weights.get(`${decision.actionType}_${JSON.stringify(signature)}`);
      
      if (weight) {
        return {
          ...decision,
          confidence: Math.min(0.95, Math.max(0.1, decision.confidence + weight.confidenceDelta)),
          impactScore: Math.max(1, Math.min(100, decision.impactScore + weight.impactScoreDelta)),
          // Priority is handled in sorting, not here
        };
      }
    }
    
    return decision;
  });
}

// Get optimization insights for dashboard
export function getOptimizationInsights(
  patterns: OptimizationPattern[],
  context: OptimizationContext
): {
  learnedPatterns: number;
  highConfidencePatterns: number;
  bestPerformingActions: ActionType[];
  lowValueActions: ActionType[];
  topOptimizations: string[];
  projectOptimized: number;
  globalLearned: number;
} {
  const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.8).length;
  const bestPerformingActions = patterns
    .sort((a, b) => b.historicalEffectiveness - a.historicalEffectiveness)
    .slice(0, 5)
    .map(p => p.actionType);
  
  const lowValueActions = patterns
    .filter(p => p.historicalEffectiveness < 30 && p.sampleCount >= 2)
    .map(p => p.actionType);
  
  const topOptimizations = patterns
    .sort((a, b) => b.historicalEffectiveness - a.historicalEffectiveness)
    .slice(0, 3)
    .map(p => `${p.actionType} for ${p.scenarioSignature.taskCategory || 'tasks'}: ${p.historicalEffectiveness.toFixed(1)}% effectiveness (${p.sampleCount} samples, ${p.contextScope})`);
  
  // Count project-specific vs global patterns
  const projectOptimized = patterns.filter(p => p.contextScope === "project").length;
  const globalLearned = patterns.filter(p => p.contextScope === "global").length;
  
  return {
    learnedPatterns: patterns.length,
    highConfidencePatterns,
    bestPerformingActions,
    lowValueActions,
    topOptimizations,
    projectOptimized,
    globalLearned
  };
}
