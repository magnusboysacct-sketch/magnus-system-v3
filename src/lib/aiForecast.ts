import { getEffectivePlannedDuration, getWeatherCalculations, getTaskCostCalculations } from "./tasks";
import { fetchDailyLogs } from "./dailyLogs";

// Risk level types
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PerformanceTrend = "improving" | "declining" | "stable";

// Task forecast prediction
export interface TaskForecast {
  taskId: string;
  taskName: string;
  currentProgress: number;
  plannedDuration: number;
  actualDuration: number;
  remainingDuration: number;
  predictedFinishDate: Date;
  delayRiskLevel: RiskLevel;
  predictedDelayDays: number;
  costRiskLevel: RiskLevel;
  predictedCostOverrun: number;
  costOverrunPercent: number;
  weatherImpact: number;
  performanceTrend: PerformanceTrend;
  trendScore: number;
  factors: string[];
}

// Project forecast summary
export interface ProjectForecast {
  totalTasks: number;
  tasksAtRisk: number;
  totalPredictedDelay: number;
  totalPredictedCostOverrun: number;
  averageDelayRisk: RiskLevel;
  averageCostRisk: RiskLevel;
  overallTrend: PerformanceTrend;
  riskFactors: string[];
  recommendations: string[];
}

// Calculate performance trend based on recent progress
export async function calculatePerformanceTrend(
  task: any,
  projectId: string
): Promise<{ trend: PerformanceTrend; score: number }> {
  // If no progress or very recent task, assume stable
  if (task.percent_complete === 0 || task.actual_duration_days < 2) {
    return { trend: "stable", score: 1.0 };
  }

  try {
    // Get recent daily logs for this project
    const { data: logs } = await fetchDailyLogs(projectId);
    if (!logs || logs.length === 0) {
      return { trend: "stable", score: 1.0 };
    }

    // Sort logs by date
    const sortedLogs = logs
      .filter(log => log.log_date)
      .sort((a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime());

    if (sortedLogs.length < 2) {
      return { trend: "stable", score: 1.0 };
    }

    // Calculate recent work pattern (last 7 days vs previous 7 days)
    const recentDays = 7;
    const comparisonDays = 7;
    
    const now = new Date();
    const recentStart = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
    const comparisonEnd = new Date(recentStart.getTime() - 24 * 60 * 60 * 1000);
    const comparisonStart = new Date(comparisonEnd.getTime() - comparisonDays * 24 * 60 * 60 * 1000);

    // Count productive days in each period
    const recentProductiveDays = sortedLogs.filter(log => {
      const logDate = new Date(log.log_date);
      return logDate >= recentStart && log.work_performed && log.work_performed.trim().length > 0;
    }).length;

    const comparisonProductiveDays = sortedLogs.filter(log => {
      const logDate = new Date(log.log_date);
      return logDate >= comparisonStart && logDate < comparisonEnd && log.work_performed && log.work_performed.trim().length > 0;
    }).length;

    // Calculate trend based on work pattern
    if (recentProductiveDays === 0 && comparisonProductiveDays === 0) {
      return { trend: "stable", score: 1.0 };
    }

    const recentRate = recentProductiveDays / recentDays;
    const comparisonRate = comparisonProductiveDays / comparisonDays;
    
    let trendScore = recentRate / comparisonRate;
    let trend: PerformanceTrend;

    if (trendScore > 1.2) {
      trend = "improving";
    } else if (trendScore < 0.8) {
      trend = "declining";
    } else {
      trend = "stable";
    }

    // Cap trend score to reasonable bounds
    trendScore = Math.max(0.5, Math.min(2.0, trendScore));

    return { trend, score: trendScore };

  } catch (error) {
    console.error('Error calculating performance trend:', error);
    return { trend: "stable", score: 1.0 };
  }
}

// Calculate task completion rate based on progress and time
export function calculateCompletionRate(
  percentComplete: number,
  actualDuration: number,
  plannedDuration: number
): number {
  if (actualDuration === 0 || plannedDuration === 0) return 0;
  
  // Expected progress based on time spent
  const expectedProgress = (actualDuration / plannedDuration) * 100;
  
  // Completion rate: actual vs expected progress
  const completionRate = percentComplete / expectedProgress;
  
  return Math.max(0, Math.min(2, completionRate)); // Cap between 0 and 2 (200%)
}

// Predict remaining duration based on current pace and trend
export function predictRemainingDuration(
  percentComplete: number,
  actualDuration: number,
  plannedDuration: number,
  weatherImpact: number,
  trendScore: number
): number {
  if (percentComplete >= 100) return 0;
  
  const completionRate = calculateCompletionRate(percentComplete, actualDuration, plannedDuration);
  const remainingWork = 100 - percentComplete;
  
  // Base remaining duration (if on pace)
  let baseRemainingDuration = (remainingWork / 100) * plannedDuration;
  
  // Adjust based on completion rate
  let adjustedDuration = baseRemainingDuration;
  
  if (completionRate < 1) {
    // Behind schedule - extend duration
    const delayFactor = 1 / completionRate;
    adjustedDuration = baseRemainingDuration * delayFactor;
  } else if (completionRate > 1.2) {
    // Ahead of schedule - reduce duration slightly
    const speedBonus = Math.min(completionRate - 1.2, 0.3); // Max 30% reduction
    adjustedDuration = baseRemainingDuration * (1 - speedBonus);
  }
  
  // Apply trend adjustment
  if (trendScore < 1) {
    // Declining trend - increase duration
    const trendPenalty = (1 - trendScore) * 0.5; // Up to 50% increase
    adjustedDuration *= (1 + trendPenalty);
  } else if (trendScore > 1) {
    // Improving trend - reduce duration slightly
    const trendBonus = Math.min((trendScore - 1) * 0.3, 0.2); // Up to 20% reduction
    adjustedDuration *= (1 - trendBonus);
  }
  
  // Apply weather impact
  if (weatherImpact > 1) {
    const weatherDelay = (weatherImpact - 1) * adjustedDuration;
    adjustedDuration += weatherDelay;
  }
  
  return Math.max(0, adjustedDuration);
}

// Predict finish date for a task
export function predictFinishDate(
  startDate: string,
  actualDuration: number,
  remainingDuration: number
): Date {
  const start = new Date(startDate);
  const now = new Date();
  
  // If task hasn't started yet
  if (actualDuration === 0) {
    return new Date(start.getTime() + remainingDuration * 24 * 60 * 60 * 1000);
  }
  
  // Predict from current date
  return new Date(now.getTime() + remainingDuration * 24 * 60 * 60 * 1000);
}

// Calculate delay risk level with trend consideration
export function calculateDelayRisk(
  predictedDelayDays: number,
  completionRate: number,
  weatherImpact: number,
  trend: PerformanceTrend
): RiskLevel {
  // Base risk from delay
  if (predictedDelayDays > 14) return "critical";
  if (predictedDelayDays > 7) return "high";
  if (predictedDelayDays > 3) return "medium";
  
  // Adjust based on trend
  if (trend === "declining") {
    if (predictedDelayDays > 1) return "high";
    if (predictedDelayDays > 0) return "medium";
  } else if (trend === "improving") {
    if (predictedDelayDays < 1) return "low";
    if (predictedDelayDays < 3) return "low";
  }
  
  // Consider completion rate
  if (completionRate < 0.5 && predictedDelayDays > 0) return "high";
  if (completionRate < 0.7 && predictedDelayDays > 1) return "medium";
  
  // Weather impact
  if (weatherImpact > 1.3) return "high";
  if (weatherImpact > 1.1) return "medium";
  
  return "low";
}

// Calculate cost overrun risk with trend consideration
export function calculateCostOverrunRisk(
  delayRiskLevel: RiskLevel,
  weatherImpact: number,
  completionRate: number,
  trend: PerformanceTrend
): RiskLevel {
  // Cost overruns often correlate with delays
  if (delayRiskLevel === "critical") return "critical";
  if (delayRiskLevel === "high") return "high";
  if (delayRiskLevel === "medium") return "medium";
  
  // Trend impact on costs
  if (trend === "declining") {
    if (weatherImpact > 1.1) return "high";
    if (completionRate < 0.6) return "medium";
  } else if (trend === "improving") {
    // Improving trend can reduce cost risk
    if (weatherImpact < 1.1 && completionRate > 0.8) return "low";
  }
  
  // Weather impact on costs
  if (weatherImpact > 1.2) return "high";
  if (weatherImpact > 1.1) return "medium";
  
  // Poor progress indicates potential cost issues
  if (completionRate < 0.6) return "medium";
  
  return "low";
}

// Predict cost overrun amount with trend adjustment
export function predictCostOverrun(
  plannedCost: number,
  delayRiskLevel: RiskLevel,
  weatherImpact: number,
  completionRate: number,
  trend: PerformanceTrend
): { amount: number; percent: number } {
  let overrunPercent = 0;
  
  // Base overrun by risk level
  switch (delayRiskLevel) {
    case "critical":
      overrunPercent = 25 + Math.random() * 15; // 25-40%
      break;
    case "high":
      overrunPercent = 15 + Math.random() * 10; // 15-25%
      break;
    case "medium":
      overrunPercent = 8 + Math.random() * 7; // 8-15%
      break;
    case "low":
      overrunPercent = 0 + Math.random() * 8; // 0-8%
      break;
  }
  
  // Trend adjustment
  if (trend === "declining") {
    overrunPercent *= 1.5; // 50% increase for declining trend
  } else if (trend === "improving") {
    overrunPercent *= 0.7; // 30% reduction for improving trend
  }
  
  // Weather impact multiplier
  if (weatherImpact > 1.1) {
    overrunPercent *= (1 + (weatherImpact - 1.1) * 2);
  }
  
  // Progress factor
  if (completionRate < 0.7) {
    overrunPercent *= (1 + (0.7 - completionRate));
  }
  
  const amount = plannedCost * (overrunPercent / 100);
  
  return { amount, percent: overrunPercent };
}

// Generate task forecast with trend analysis
export async function generateTaskForecast(task: any, projectId: string): Promise<TaskForecast> {
  const {
    id,
    task_name,
    percent_complete = 0,
    planned_duration_days = 0,
    actual_duration_days = 0,
    start_date,
    weather_impact_factor = 1.0
  } = task;
  
  // Get performance trend
  const { trend: performanceTrend, score: trendScore } = await calculatePerformanceTrend(task, projectId);
  
  // Get weather and cost calculations
  const weatherCalculations = getWeatherCalculations(task);
  const costCalculations = getTaskCostCalculations(task);
  
  // Calculate predictions
  const completionRate = calculateCompletionRate(percent_complete, actual_duration_days, planned_duration_days);
  const remainingDuration = predictRemainingDuration(
    percent_complete, 
    actual_duration_days, 
    planned_duration_days, 
    weather_impact_factor,
    trendScore
  );
  const predictedFinishDate = predictFinishDate(start_date, actual_duration_days, remainingDuration);
  const originalFinishDate = new Date(start_date);
  originalFinishDate.setDate(originalFinishDate.getDate() + planned_duration_days);
  
  const predictedDelayDays = Math.max(0, (predictedFinishDate.getTime() - originalFinishDate.getTime()) / (24 * 60 * 60 * 1000));
  const delayRiskLevel = calculateDelayRisk(predictedDelayDays, completionRate, weather_impact_factor, performanceTrend);
  const costRiskLevel = calculateCostOverrunRisk(delayRiskLevel, weather_impact_factor, completionRate, performanceTrend);
  const costOverrun = predictCostOverrun(costCalculations.plannedTaskCost, delayRiskLevel, weather_impact_factor, completionRate, performanceTrend);
  
  // Generate risk factors
  const factors: string[] = [];
  if (completionRate < 0.7) factors.push("Behind schedule");
  if (weather_impact_factor > 1.1) factors.push("Weather delays");
  if (predictedDelayDays > 7) factors.push("Significant delay");
  if (percent_complete < 20 && actual_duration_days > 0) factors.push("Slow progress");
  if (weatherCalculations.weatherDelay > 0) factors.push("Weather impact");
  if (performanceTrend === "declining") factors.push("Declining performance");
  if (performanceTrend === "improving") factors.push("Improving performance");
  
  return {
    taskId: id,
    taskName: task_name,
    currentProgress: percent_complete,
    plannedDuration: planned_duration_days,
    actualDuration: actual_duration_days,
    remainingDuration,
    predictedFinishDate,
    delayRiskLevel,
    predictedDelayDays,
    costRiskLevel,
    predictedCostOverrun: costOverrun.amount,
    costOverrunPercent: costOverrun.percent,
    weatherImpact: weather_impact_factor,
    performanceTrend,
    trendScore,
    factors
  };
}

// Generate project forecast summary with trend analysis
export async function generateProjectForecast(tasks: any[], projectId: string): Promise<ProjectForecast> {
  const forecasts = await Promise.all(
    tasks.map(task => generateTaskForecast(task, projectId))
  );
  
  const tasksAtRisk = forecasts.filter(f => f.delayRiskLevel !== "low" || f.costRiskLevel !== "low").length;
  const totalPredictedDelay = forecasts.reduce((sum, f) => sum + f.predictedDelayDays, 0);
  const totalPredictedCostOverrun = forecasts.reduce((sum, f) => sum + f.predictedCostOverrun, 0);
  
  // Calculate average risk levels
  const riskLevels = ["low", "medium", "high", "critical"] as RiskLevel[];
  const delayRiskScores = forecasts.map(f => riskLevels.indexOf(f.delayRiskLevel));
  const costRiskScores = forecasts.map(f => riskLevels.indexOf(f.costRiskLevel));
  
  const avgDelayScore = delayRiskScores.reduce((sum, score) => sum + score, 0) / delayRiskScores.length;
  const avgCostScore = costRiskScores.reduce((sum, score) => sum + score, 0) / costRiskScores.length;
  
  const averageDelayRisk = riskLevels[Math.round(avgDelayScore)] as RiskLevel;
  const averageCostRisk = riskLevels[Math.round(avgCostScore)] as RiskLevel;
  
  // Calculate overall trend
  const trendCounts = forecasts.reduce((acc, f) => {
    acc[f.performanceTrend] = (acc[f.performanceTrend] || 0) + 1;
    return acc;
  }, {} as Record<PerformanceTrend, number>);
  
  const overallTrend: PerformanceTrend = 
    trendCounts.improving > trendCounts.declining ? "improving" :
    trendCounts.declining > trendCounts.improving ? "declining" : "stable";
  
  // Analyze risk factors
  const allFactors = forecasts.flatMap(f => f.factors);
  const factorCounts = allFactors.reduce((acc, factor) => {
    acc[factor] = (acc[factor] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const riskFactors = Object.entries(factorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([factor]) => factor);
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (tasksAtRisk > 0) {
    recommendations.push(`Review ${tasksAtRisk} task(s) at risk of delays`);
  }
  if (totalPredictedDelay > 14) {
    recommendations.push("Project timeline may need adjustment");
  }
  if (totalPredictedCostOverrun > 10000) {
    recommendations.push("Budget contingency may be required");
  }
  if (riskFactors.includes("Weather delays")) {
    recommendations.push("Consider weather mitigation strategies");
  }
  if (riskFactors.includes("Slow progress")) {
    recommendations.push("Investigate resource allocation issues");
  }
  if (overallTrend === "declining") {
    recommendations.push("Address declining performance trend");
  } else if (overallTrend === "improving") {
    recommendations.push("Maintain current performance momentum");
  }
  
  return {
    totalTasks: tasks.length,
    tasksAtRisk,
    totalPredictedDelay,
    totalPredictedCostOverrun,
    averageDelayRisk,
    averageCostRisk,
    overallTrend,
    riskFactors,
    recommendations
  };
}

// Get risk level color
export function getRiskLevelColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "low":
      return "text-emerald-400";
    case "medium":
      return "text-amber-400";
    case "high":
      return "text-orange-400";
    case "critical":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

// Get risk level background
export function getRiskLevelBg(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "low":
      return "bg-emerald-900/20 border-emerald-900/40";
    case "medium":
      return "bg-amber-900/20 border-amber-900/40";
    case "high":
      return "bg-orange-900/20 border-orange-900/40";
    case "critical":
      return "bg-red-900/20 border-red-900/40";
    default:
      return "bg-slate-900/20 border-slate-800";
  }
}

// Get trend color
export function getTrendColor(trend: PerformanceTrend): string {
  switch (trend) {
    case "improving":
      return "text-emerald-400";
    case "declining":
      return "text-red-400";
    case "stable":
      return "text-slate-400";
    default:
      return "text-slate-400";
  }
}

// Get trend icon
export function getTrendIcon(trend: PerformanceTrend): string {
  switch (trend) {
    case "improving":
      return "↗";
    case "declining":
      return "↘";
    case "stable":
      return "→";
    default:
      return "→";
  }
}
