import { getWeatherCalculations, getTaskCostCalculations, type ProjectTask } from "./tasks";
import { generateTaskForecast, type TaskForecast, type RiskLevel, type PerformanceTrend } from "./aiForecast";
import { getTaskMaterialSummary, type AggregatedMaterialRequirement } from "./taskProcurement";
import { fetchProjectBOQItems, type BOQItem } from "./boqHelpers";
import { fetchDailyLogs } from "./dailyLogs";
import { updateDecisionPreferences } from "./actionEngine";
import { optimizeProjectDecisions, analyzeOptimizationPatterns, type OptimizationContext } from "./optimizationEngine";

// Decision types
export type ActionType = "add_crew" | "increase_rate" | "order_materials" | "generate_procurement" | 
                       "review_boq" | "management_review" | "watch_weather" | "prioritize_task" | "cost_control";

export type Priority = "low" | "medium" | "high" | "critical";

export type ImpactArea = "schedule" | "cost" | "procurement" | "productivity" | "weather";

// Decision recommendation
export interface Decision {
  id: string;
  title: string;
  actionType: ActionType;
  priority: Priority;
  impactArea: ImpactArea;
  reason: string;
  taskId?: string;
  taskName?: string;
  recommendedAction: string;
  expectedImpact: string;
  confidence: number; // 0-1
  impactScore: number; // 0-100, higher is better
  delayReductionDays?: number;
  costSavingsAmount?: number;
}

// Project decision summary
export interface ProjectDecisions {
  totalDecisions: number;
  criticalActions: number;
  highActions: number;
  mediumActions: number;
  lowActions: number;
  decisionsByArea: Record<ImpactArea, number>;
  decisions: Decision[];
}

// Decision context
export interface DecisionContext {
  tasks: ProjectTask[];
  forecast: TaskForecast[];
  materialSummary: any;
  boqItems: BOQItem[];
  projectId: string;
}

// Generate decision ID
function generateDecisionId(actionType: ActionType, taskId?: string): string {
  const timestamp = Date.now();
  const taskPart = taskId ? `_${taskId.slice(0, 8)}` : '';
  return `${actionType}${taskPart}_${timestamp}`;
}

// Calculate priority score
function calculatePriorityScore(
  delayRisk: RiskLevel,
  costRisk: RiskLevel,
  trend: PerformanceTrend,
  weatherImpact: number,
  progress: number
): number {
  let score = 0;
  
  // Risk level contributions
  const riskScores = { low: 1, medium: 2, high: 3, critical: 4 };
  score += riskScores[delayRisk] * 2;
  score += riskScores[costRisk] * 1.5;
  
  // Trend impact
  if (trend === "declining") score += 2;
  else if (trend === "stable") score += 0.5;
  
  // Weather impact
  if (weatherImpact > 1.3) score += 2;
  else if (weatherImpact > 1.1) score += 1;
  
  // Progress concerns
  if (progress < 20 && progress > 0) score += 1.5;
  else if (progress < 50) score += 1;
  
  return score;
}

// Determine priority from score
function getPriorityFromScore(score: number): Priority {
  if (score >= 8) return "critical";
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

// Calculate impact score (0-100)
function calculateImpactScore(
  actionType: ActionType,
  delayRisk: RiskLevel,
  costRisk: RiskLevel,
  forecast: TaskForecast,
  task: ProjectTask
): {
  score: number;
  delayReductionDays?: number;
  costSavingsAmount?: number;
} {
  let score = 0;
  let delayReductionDays = 0;
  let costSavingsAmount = 0;

  // Base score by action type
  const actionTypeScores = {
    add_crew: 25,
    increase_rate: 20,
    order_materials: 30,
    generate_procurement: 35,
    review_boq: 15,
    management_review: 20,
    watch_weather: 10,
    prioritize_task: 25,
    cost_control: 20
  };
  score += actionTypeScores[actionType] || 10;

  // Calculate delay reduction potential
  if (forecast.predictedDelayDays > 0) {
    switch (actionType) {
      case "add_crew":
        // Adding crew can reduce delays by 20-40%
        delayReductionDays = forecast.predictedDelayDays * (0.2 + Math.random() * 0.2);
        score += Math.min(delayReductionDays * 5, 30); // Max 30 points for delay reduction
        break;
      case "increase_rate":
        // Rate increase can reduce delays by 15-30%
        delayReductionDays = forecast.predictedDelayDays * (0.15 + Math.random() * 0.15);
        score += Math.min(delayReductionDays * 4, 25);
        break;
      case "prioritize_task":
        // Prioritization can reduce delays by 10-25%
        delayReductionDays = forecast.predictedDelayDays * (0.1 + Math.random() * 0.15);
        score += Math.min(delayReductionDays * 6, 20);
        break;
      case "watch_weather":
        // Weather monitoring can prevent weather delays
        if (forecast.weatherImpact > 1.2) {
          delayReductionDays = forecast.predictedDelayDays * 0.1;
          score += 10;
        }
        break;
    }
  }

  // Calculate cost savings potential
  if (forecast.predictedCostOverrun > 0) {
    switch (actionType) {
      case "cost_control":
        // Cost control can reduce overruns by 20-35%
        costSavingsAmount = forecast.predictedCostOverrun * (0.2 + Math.random() * 0.15);
        score += Math.min(costSavingsAmount / 100, 25); // Max 25 points for cost savings
        break;
      case "add_crew":
        // Adding crew increases cost but can prevent larger overruns
        const laborCost = task.labor_cost_per_day ?? 0;
        const actualDuration = task.actual_duration_days ?? 0;
        const additionalCrewCost = laborCost * actualDuration * 0.5;
        const preventedOverrun = forecast.predictedCostOverrun * 0.3;
        if (preventedOverrun > additionalCrewCost) {
          costSavingsAmount = preventedOverrun - additionalCrewCost;
          score += Math.min(costSavingsAmount / 100, 15);
        }
        break;
      case "increase_rate":
        // Rate increase has minimal cost impact
        costSavingsAmount = forecast.predictedCostOverrun * 0.15;
        score += Math.min(costSavingsAmount / 100, 10);
        break;
    }
  }

  // Urgency bonus (days to deadline)
  if (task.end_date) {
    const daysUntilDue = Math.ceil((new Date(task.end_date).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntilDue < 7) {
      score += 20; // High urgency
    } else if (daysUntilDue < 14) {
      score += 15; // Medium urgency
    } else if (daysUntilDue < 30) {
      score += 10; // Low urgency
    }
  }

  // Weather severity bonus
  if (forecast.weatherImpact > 1.3) {
    score += 15; // Severe weather impact
  } else if (forecast.weatherImpact > 1.1) {
    score += 10; // Moderate weather impact
  }

  // Risk level bonuses
  const riskLevelScores = { low: 0, medium: 5, high: 15, critical: 25 };
  score += riskLevelScores[delayRisk];
  score += riskLevelScores[costRisk] * 0.7; // Cost risk weighted slightly less

  // Progress concern bonus
  const actualDuration = task.actual_duration_days ?? 0;
  if (forecast.currentProgress < 20 && actualDuration > 0) {
    score += 15; // Very poor progress
  } else if (forecast.currentProgress < 50) {
    score += 10; // Poor progress
  }

  // Cap score at 100
  score = Math.min(Math.max(score, 0), 100);

  return {
    score: Math.round(score),
    delayReductionDays: delayReductionDays > 0 ? Math.round(delayReductionDays * 10) / 10 : undefined,
    costSavingsAmount: costSavingsAmount > 0 ? Math.round(costSavingsAmount * 100) / 100 : undefined
  };
}

// Get impact level from score
function getImpactLevel(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

// Get impact display text
function getImpactDisplay(decision: Decision): string {
  if (decision.delayReductionDays && decision.delayReductionDays > 0) {
    return `-${decision.delayReductionDays}d delay`;
  }
  if (decision.costSavingsAmount && decision.costSavingsAmount > 0) {
    return `$${decision.costSavingsAmount.toFixed(0)} saved`;
  }
  return getImpactLevel(decision.impactScore);
}

// Generate task-level decisions
export async function generateTaskDecision(
  task: ProjectTask,
  context: DecisionContext
): Promise<Decision[]> {
  const decisions: Decision[] = [];
  
  // Get task forecast
  const forecast = await generateTaskForecast(task, context.projectId);
  
  // Get weather calculations
  const weatherCalc = getWeatherCalculations(task);
  
  // Get cost calculations
  const costCalc = getTaskCostCalculations(task);
  
  // Calculate priority score
  const priorityScore = calculatePriorityScore(
    forecast.delayRiskLevel,
    forecast.costRiskLevel,
    forecast.performanceTrend,
    forecast.weatherImpact,
    forecast.currentProgress
  );
  
  const priority = getPriorityFromScore(priorityScore);
  
  // Decision 1: Crew size optimization
  const crewSize = task.crew_size ?? 1;
  if (forecast.delayRiskLevel !== "low" && crewSize <= 2) {
    const impactCalc = calculateImpactScore("add_crew", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
    
    decisions.push({
      id: generateDecisionId("add_crew", task.id),
      title: "Increase Crew Size",
      actionType: "add_crew",
      priority: forecast.delayRiskLevel === "critical" ? "critical" : priority,
      impactArea: "schedule",
      reason: `Task at ${forecast.delayRiskLevel} delay risk with current crew size of ${crewSize}`,
      taskId: task.id,
      taskName: task.task_name,
      recommendedAction: `Add 1-2 crew members to improve production rate`,
      expectedImpact: `Could reduce delay by ${Math.round(forecast.predictedDelayDays * 0.4)} days`,
      confidence: 0.8,
      impactScore: impactCalc.score,
      delayReductionDays: impactCalc.delayReductionDays,
      costSavingsAmount: impactCalc.costSavingsAmount
    });
  }
  
  // Decision 2: Production rate optimization
  const productionRate = task.production_rate_per_day ?? 0;
  if (forecast.delayRiskLevel !== "low" && productionRate < 10) {
    const impactCalc = calculateImpactScore("increase_rate", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
    
    decisions.push({
      id: generateDecisionId("increase_rate", task.id),
      title: "Increase Production Rate Target",
      actionType: "increase_rate",
      priority: priority,
      impactArea: "productivity",
      reason: `Current rate ${productionRate}/day may be insufficient for ${forecast.delayRiskLevel} risk level`,
      taskId: task.id,
      taskName: task.task_name,
      recommendedAction: `Increase target rate by 20-30% through process optimization`,
      expectedImpact: `Could improve completion rate and reduce delays`,
      confidence: 0.7,
      impactScore: impactCalc.score,
      delayReductionDays: impactCalc.delayReductionDays,
      costSavingsAmount: impactCalc.costSavingsAmount
    });
  }
  
  // Decision 3: Weather monitoring
  if (forecast.weatherImpact > 1.2) {
    const impactCalc = calculateImpactScore("watch_weather", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
    
    decisions.push({
      id: generateDecisionId("watch_weather", task.id),
      title: "Monitor Weather-Sensitive Work",
      actionType: "watch_weather",
      priority: forecast.weatherImpact > 1.4 ? "high" : "medium",
      impactArea: "weather",
      reason: `Weather impact factor ${forecast.weatherImpact} indicates high sensitivity to conditions`,
      taskId: task.id,
      taskName: task.task_name,
      recommendedAction: "Monitor weather forecast closely and plan indoor/protected work alternatives",
      expectedImpact: "Minimize weather-related delays through proactive planning",
      confidence: 0.9,
      impactScore: impactCalc.score,
      delayReductionDays: impactCalc.delayReductionDays,
      costSavingsAmount: impactCalc.costSavingsAmount
    });
  }
  
  // Decision 4: Management review for poor progress
  const actualDuration = task.actual_duration_days ?? 0;
  const plannedDuration = task.planned_duration_days ?? 1;
  if (forecast.currentProgress < 30 && actualDuration > plannedDuration * 0.5) {
    const impactCalc = calculateImpactScore("management_review", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
    
    decisions.push({
      id: generateDecisionId("management_review", task.id),
      title: "Management Review Required",
      actionType: "management_review",
      priority: forecast.currentProgress < 15 ? "critical" : "high",
      impactArea: "schedule",
      reason: `Only ${forecast.currentProgress.toFixed(1)}% complete despite consuming ${Math.round((actualDuration / plannedDuration) * 100)}% of planned time`,
      taskId: task.id,
      taskName: task.task_name,
      recommendedAction: "Review resource allocation, equipment, and work methods",
      expectedImpact: "Identify and resolve productivity issues",
      confidence: 0.8,
      impactScore: impactCalc.score,
      delayReductionDays: impactCalc.delayReductionDays,
      costSavingsAmount: impactCalc.costSavingsAmount
    });
  }
  
  // Decision 5: Cost control for high risk
  if (forecast.costRiskLevel === "critical" || forecast.costRiskLevel === "high") {
    const impactCalc = calculateImpactScore("cost_control", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
    
    decisions.push({
      id: generateDecisionId("cost_control", task.id),
      title: "Implement Cost Control Measures",
      actionType: "cost_control",
      priority: forecast.costRiskLevel === "critical" ? "critical" : "high",
      impactArea: "cost",
      reason: `Cost overrun risk at ${forecast.costRiskLevel} level with ${forecast.costOverrunPercent.toFixed(1)}% potential overrun`,
      taskId: task.id,
      taskName: task.task_name,
      recommendedAction: "Review cost drivers and implement efficiency measures",
      expectedImpact: "Could reduce cost overrun by 20-30%",
      confidence: 0.7,
      impactScore: impactCalc.score,
      delayReductionDays: impactCalc.delayReductionDays,
      costSavingsAmount: impactCalc.costSavingsAmount
    });
  }
  
  // Decision 6: Task prioritization
  if (forecast.delayRiskLevel !== "low" && task.end_date) {
    const daysUntilDue = Math.ceil((new Date(task.end_date).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
    
    if (daysUntilDue < 14 && forecast.currentProgress < 70) {
      const impactCalc = calculateImpactScore("prioritize_task", forecast.delayRiskLevel, forecast.costRiskLevel, forecast, task);
      
      decisions.push({
        id: generateDecisionId("prioritize_task", task.id),
        title: "Prioritize Task Completion",
        actionType: "prioritize_task",
        priority: daysUntilDue < 7 ? "critical" : "high",
        impactArea: "schedule",
        reason: `Task due in ${daysUntilDue} days but only ${forecast.currentProgress.toFixed(1)}% complete`,
        taskId: task.id,
        taskName: task.task_name,
        recommendedAction: "Allocate additional resources and focus on completion",
        expectedImpact: "Avoid missing deadline and reduce project delays",
        confidence: 0.9,
        impactScore: impactCalc.score,
        delayReductionDays: impactCalc.delayReductionDays,
        costSavingsAmount: impactCalc.costSavingsAmount
      });
    }
  }
  
  return decisions;
}

// Generate project-level decisions
export async function generateProjectDecisions(
  tasks: ProjectTask[],
  forecast: TaskForecast[],
  materialSummary: any,
  boqItems: BOQItem[],
  projectId: string
): Promise<ProjectDecisions> {
  const decisions: Decision[] = [];
  const context: DecisionContext = { tasks, forecast, materialSummary, boqItems, projectId };
  
  // Generate task-level decisions
  for (const task of tasks) {
    const taskDecisions = await generateTaskDecision(task, context);
    decisions.push(...taskDecisions);
  }
  
  // Project-level procurement decisions
  if (materialSummary && materialSummary.upcomingRequirements) {
    const urgentMaterials = materialSummary.upcomingRequirements.filter((req: any) => {
      const daysUntilNeeded = Math.ceil((new Date(req.neededByDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
      return daysUntilNeeded < 14;
    });
    
    if (urgentMaterials.length > 0) {
      // Calculate impact score for procurement decision
      const urgencyScore = urgentMaterials.some((req: any) => {
        const daysUntilNeeded = Math.ceil((new Date(req.neededByDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
        return daysUntilNeeded < 7;
      }) ? 85 : 65;
      
      decisions.push({
        id: generateDecisionId("generate_procurement"),
        title: "Generate Urgent Procurement",
        actionType: "generate_procurement",
        priority: urgentMaterials.some((req: any) => {
          const daysUntilNeeded = Math.ceil((new Date(req.neededByDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
          return daysUntilNeeded < 7;
        }) ? "critical" : "high",
        impactArea: "procurement",
        reason: `${urgentMaterials.length} materials needed within 14 days`,
        recommendedAction: "Generate procurement for upcoming material requirements",
        expectedImpact: "Ensure materials arrive on time to avoid delays",
        confidence: 0.9,
        impactScore: urgencyScore
      });
    }
  }
  
  // Project-level BOQ decisions
  const boqLinkedTasks = tasks.filter(task => task.boq_item_id);
  const lowProgressBoqTasks = boqLinkedTasks.filter(task => (task.percent_complete ?? 0) < 50);
  
  if (lowProgressBoqTasks.length > boqLinkedTasks.length * 0.3) {
    decisions.push({
      id: generateDecisionId("review_boq"),
      title: "Review BOQ-Linked Task Progress",
      actionType: "review_boq",
      priority: "medium",
      impactArea: "schedule",
      reason: `${lowProgressBoqTasks.length} BOQ-linked tasks showing low progress`,
      recommendedAction: "Review BOQ quantities and task alignment",
      expectedImpact: "Ensure task planning matches BOQ requirements",
      confidence: 0.7,
      impactScore: 45 // Medium impact for BOQ review
    });
  }
  
  // Calculate summary statistics
  const decisionsByArea = decisions.reduce((acc, decision) => {
    acc[decision.impactArea] = (acc[decision.impactArea] || 0) + 1;
    return acc;
  }, {} as Record<ImpactArea, number>);
  
  const criticalActions = decisions.filter(d => d.priority === "critical").length;
  const highActions = decisions.filter(d => d.priority === "high").length;
  const mediumActions = decisions.filter(d => d.priority === "medium").length;
  const lowActions = decisions.filter(d => d.priority === "low").length;
  
  // Sort decisions by priority first, then by highest impactScore
  let sortedDecisions = [...decisions].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.impactScore - a.impactScore;
  });
  
  // Apply feedback-based preferences
  sortedDecisions = updateDecisionPreferences(sortedDecisions);
  
  // Apply optimization-based improvements
  const optimizationContext: OptimizationContext = {
    projectId,
    tasks,
    forecast,
    materialSummary,
    boqItems,
    currentDecisions: sortedDecisions,
    availableActions: [] // Will be populated by action engine
  };
  
  sortedDecisions = optimizeProjectDecisions(sortedDecisions, optimizationContext);
  
  return {
    totalDecisions: sortedDecisions.length,
    criticalActions,
    highActions,
    mediumActions,
    lowActions,
    decisionsByArea,
    decisions: sortedDecisions
  };
}

// Get action type color
export function getActionTypeColor(actionType: ActionType): string {
  switch (actionType) {
    case "add_crew":
      return "text-blue-400";
    case "increase_rate":
      return "text-emerald-400";
    case "order_materials":
    case "generate_procurement":
      return "text-purple-400";
    case "review_boq":
      return "text-amber-400";
    case "management_review":
      return "text-red-400";
    case "watch_weather":
      return "text-cyan-400";
    case "prioritize_task":
      return "text-orange-400";
    case "cost_control":
      return "text-pink-400";
    default:
      return "text-slate-400";
  }
}

// Get priority color
export function getPriorityColor(priority: Priority): string {
  switch (priority) {
    case "critical":
      return "text-red-400 bg-red-900/20 border-red-900/40";
    case "high":
      return "text-orange-400 bg-orange-900/20 border-orange-900/40";
    case "medium":
      return "text-amber-400 bg-amber-900/20 border-amber-900/40";
    case "low":
      return "text-emerald-400 bg-emerald-900/20 border-emerald-900/40";
    default:
      return "text-slate-400 bg-slate-900/20 border-slate-800";
  }
}

// Get impact area icon
export function getImpactAreaIcon(impactArea: ImpactArea): string {
  switch (impactArea) {
    case "schedule":
      return "📅";
    case "cost":
      return "💰";
    case "procurement":
      return "📦";
    case "productivity":
      return "⚡";
    case "weather":
      return "🌤️";
    default:
      return "📋";
  }
}

// Export impact display functions
export { getImpactLevel, getImpactDisplay };
