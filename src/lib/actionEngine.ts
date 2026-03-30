import { updateProjectTask, type ProjectTask } from "./tasks";
import { generateProcurementFromTasks } from "./taskProcurement";
import { generateTaskForecast, type TaskForecast, type RiskLevel } from "./aiForecast";
import { type Decision, type ActionType } from "./decisionEngine";
import { supabase } from "./supabase";
import { logActivity } from "./activity";

// Action safety levels
export type SafetyLevel = "safe" | "confirm_required" | "advisory";

// Action target types
export type TargetType = "task" | "procurement" | "dashboard" | "boq";

// Action execution status
export type ExecutionStatus = "idle" | "running" | "done" | "failed" | "cancelled";

// Action evaluation status
export type EvaluationStatus = "pending" | "evaluated";

// Action model
export interface Action {
  id: string;
  decisionId: string;
  title: string;
  actionType: ActionType;
  safetyLevel: SafetyLevel;
  targetType: TargetType;
  targetId?: string;
  payload: ActionPayload;
  description: string;
  undoHint?: string;
  executionStatus: ExecutionStatus;
  createdAt: Date;
  executedAt?: Date;
  result?: any;
  error?: string;
  // Feedback tracking
  beforeState?: ActionState;
  afterState?: ActionState;
  effectivenessScore?: number; // 0-100
  feedbackCollectedAt?: Date;
  // Evaluation tracking
  evaluationStatus: EvaluationStatus;
  evaluationDueAt?: Date;
}

// Action state snapshot for feedback
export interface ActionState {
  taskId?: string;
  percent_complete: number;
  delayRiskLevel: RiskLevel;
  costRiskLevel: RiskLevel;
  actualDurationDays: number;
  plannedDurationDays: number;
  crewSize: number;
  productionRatePerDay: number;
  weatherImpactFactor: number;
  laborCostPerDay: number;
  equipmentCostPerDay: number;
  materialCostTotal: number;
}

// Action payload types
export interface ActionPayload {
  taskId?: string;
  taskUpdates?: Partial<ProjectTask>;
  procurementTitle?: string;
  reviewNotes?: string;
  priority?: boolean;
  weatherWatch?: boolean;
}

// Action context
export interface ActionContext {
  projectId: string;
  tasks: ProjectTask[];
  materialSummary: any;
  boqItems: any[];
  onTaskUpdate?: (taskId: string, updates: any) => void;
  onProcurementGenerate?: (title?: string) => void;
  onShowConfirmation?: (action: Action) => Promise<boolean>;
  onShowAlert?: (message: string) => void;
}

// Generate action ID
function generateActionId(actionType: ActionType, targetId?: string): string {
  const timestamp = Date.now();
  const targetPart = targetId ? `_${targetId.slice(0, 8)}` : '';
  return `action_${actionType}${targetPart}_${timestamp}`;
}

// Build task patch from decision
export function buildTaskPatchFromDecision(decision: Decision, task: ProjectTask): Partial<ProjectTask> {
  const patch: Partial<ProjectTask> = {};

  switch (decision.actionType) {
    case "add_crew":
      // Suggest adding 1-2 crew members based on current size
      const crewSize = task.crew_size ?? 1;
      const suggestedCrewSize = Math.min(crewSize + Math.ceil(crewSize * 0.5), crewSize + 2);
      patch.crew_size = suggestedCrewSize;
      break;

    case "increase_rate":
      // Suggest 20-30% production rate increase
      const productionRate = task.production_rate_per_day ?? 0;
      const suggestedRate = Math.round(productionRate * 1.25);
      patch.production_rate_per_day = suggestedRate;
      break;

    case "management_review":
      // Add a review flag in notes (safe field)
      const reviewNote = `Management review required: ${decision.reason}`;
      // Note: We'll handle this in UI state rather than database
      break;

    case "prioritize_task":
      // Update status to active if not already
      if (task.status === "planned") {
        patch.status = "active";
      }
      break;

    case "watch_weather":
      // Add weather watch flag in notes
      const weatherNote = `Weather monitoring required: ${decision.reason}`;
      // Note: We'll handle this in UI state rather than database
      break;

    default:
      // No direct task changes for other action types
      break;
  }

  return patch;
}

// Build procurement action from decision
export function buildProcurementAction(decision: Decision, materialSummary: any): Action | null {
  if (decision.actionType !== "generate_procurement") return null;

  return {
    id: generateActionId("generate_procurement"),
    decisionId: decision.id,
    title: "Generate Urgent Procurement",
    actionType: "generate_procurement",
    safetyLevel: "confirm_required",
    targetType: "procurement",
    payload: {
      procurementTitle: "Urgent Procurement from Decision Engine"
    },
    description: decision.reason,
    undoHint: "Procurement can be cancelled or modified after generation",
    executionStatus: "idle",
    createdAt: new Date(),
    evaluationStatus: "pending"
  };
}

// Get available actions for decision
export function getAvailableActionsForDecision(
  decision: Decision, 
  context: ActionContext
): Action[] {
  const actions: Action[] = [];

  switch (decision.actionType) {
    case "add_crew":
      if (decision.taskId) {
        const task = context.tasks.find(t => t.id === decision.taskId);
        if (task) {
          const taskPatch = buildTaskPatchFromDecision(decision, task);
          actions.push({
            id: generateActionId("add_crew", decision.taskId),
            decisionId: decision.id,
            title: "Apply Crew Suggestion",
            actionType: "add_crew",
            safetyLevel: "confirm_required",
            targetType: "task",
            targetId: decision.taskId,
            payload: {
              taskId: decision.taskId,
              taskUpdates: taskPatch
            },
            description: `Increase crew size from ${task.crew_size} to ${taskPatch.crew_size}`,
            undoHint: "Can revert crew size in task edit",
            executionStatus: "idle",
            createdAt: new Date(),
            evaluationStatus: "pending"
          });
        }
      }
      break;

    case "increase_rate":
      if (decision.taskId) {
        const task = context.tasks.find(t => t.id === decision.taskId);
        if (task) {
          const taskPatch = buildTaskPatchFromDecision(decision, task);
          actions.push({
            id: generateActionId("increase_rate", decision.taskId),
            decisionId: decision.id,
            title: "Apply Rate Suggestion",
            actionType: "increase_rate",
            safetyLevel: "safe",
            targetType: "task",
            targetId: decision.taskId,
            payload: {
              taskId: decision.taskId,
              taskUpdates: taskPatch
            },
            description: `Increase production rate from ${task.production_rate_per_day} to ${taskPatch.production_rate_per_day}`,
            undoHint: "Can revert rate in task edit",
            executionStatus: "idle",
            createdAt: new Date(),
            evaluationStatus: "pending"
          });
        }
      }
      break;

    case "generate_procurement":
      const procurementAction = buildProcurementAction(decision, context.materialSummary);
      if (procurementAction) {
        actions.push(procurementAction);
      }
      break;

    case "management_review":
      if (decision.taskId) {
        actions.push({
          id: generateActionId("management_review", decision.taskId),
          decisionId: decision.id,
          title: "Mark for Management Review",
          actionType: "management_review",
          safetyLevel: "advisory",
          targetType: "task",
          targetId: decision.taskId,
          payload: {
            taskId: decision.taskId,
            reviewNotes: decision.reason
          },
          description: "Flag task for management attention",
          undoHint: "Review flag can be removed anytime",
          executionStatus: "idle",
          createdAt: new Date(),
          evaluationStatus: "pending"
        });
      }
      break;

    case "prioritize_task":
      if (decision.taskId) {
        const task = context.tasks.find(t => t.id === decision.taskId);
        if (task) {
          const taskPatch = buildTaskPatchFromDecision(decision, task);
          actions.push({
            id: generateActionId("prioritize_task", decision.taskId),
            decisionId: decision.id,
            title: "Prioritize Task",
            actionType: "prioritize_task",
            safetyLevel: "safe",
            targetType: "task",
            targetId: decision.taskId,
            payload: {
              taskId: decision.taskId,
              taskUpdates: taskPatch,
              priority: true
            },
            description: task.status === "planned" ? "Activate task to prioritize" : "Mark task as high priority",
            undoHint: "Can deactivate task or remove priority flag",
            executionStatus: "idle",
            createdAt: new Date(),
            evaluationStatus: "pending"
          });
        }
      }
      break;

    case "watch_weather":
      if (decision.taskId) {
        actions.push({
          id: generateActionId("watch_weather", decision.taskId),
          decisionId: decision.id,
          title: "Enable Weather Monitoring",
          actionType: "watch_weather",
          safetyLevel: "advisory",
          targetType: "task",
          targetId: decision.taskId,
          payload: {
            taskId: decision.taskId,
            weatherWatch: true
          },
          description: "Monitor weather conditions for this task",
          undoHint: "Weather monitoring can be disabled anytime",
          executionStatus: "idle",
          createdAt: new Date(),
          evaluationStatus: "pending"
        });
      }
      break;

    case "cost_control":
      if (decision.taskId) {
        actions.push({
          id: generateActionId("cost_control", decision.taskId),
          decisionId: decision.id,
          title: "Open Cost Control Review",
          actionType: "cost_control",
          safetyLevel: "advisory",
          targetType: "task",
          targetId: decision.taskId,
          payload: {
            taskId: decision.taskId,
            reviewNotes: decision.reason
          },
          description: "Review cost drivers and implement efficiency measures",
          undoHint: "Review can be closed anytime",
          executionStatus: "idle",
          createdAt: new Date(),
          evaluationStatus: "pending"
        });
      }
      break;

    case "review_boq":
      actions.push({
        id: generateActionId("review_boq"),
        decisionId: decision.id,
        title: "Review BOQ Alignment",
        actionType: "review_boq",
        safetyLevel: "advisory",
        targetType: "boq",
        payload: {
          reviewNotes: decision.reason
        },
        description: "Review BOQ-linked task progress and alignment",
        undoHint: "Review can be closed anytime",
        executionStatus: "idle",
        createdAt: new Date(),
        evaluationStatus: "pending"
      });
      break;
  }

  return actions;
}

// Calculate evaluation delay based on action type
function calculateEvaluationDelay(actionType: ActionType): number {
  const hoursPerDay = 24 * 60 * 60 * 1000;
  
  switch (actionType) {
    case "add_crew":
      return 72 * hoursPerDay; // 3 days for crew changes to show impact
    case "increase_rate":
      return 48 * hoursPerDay; // 2 days for rate changes
    case "prioritize_task":
      return 24 * hoursPerDay; // 1 day for prioritization
    case "generate_procurement":
      return 48 * hoursPerDay; // 2 days for procurement impact
    case "management_review":
    case "watch_weather":
    case "cost_control":
    case "review_boq":
      return 24 * hoursPerDay; // 1 day for advisory actions
    default:
      return 48 * hoursPerDay; // Default 2 days
  }
}

// Check if action is ready for evaluation
export function isActionReadyForEvaluation(action: Action): boolean {
  if (action.evaluationStatus === "evaluated") return false;
  if (!action.evaluationDueAt) return false;
  
  return new Date() >= action.evaluationDueAt;
}

// Evaluate action effectiveness
export async function evaluateAction(action: Action, context: ActionContext): Promise<void> {
  if (action.evaluationStatus === "evaluated") return;
  if (!isActionReadyForEvaluation(action)) return;
  
  try {
    // Capture after state
    const afterState = await captureActionStateAfter(action, context);
    action.afterState = afterState || undefined;
    
    // Calculate effectiveness if we have both states
    if (action.beforeState && afterState) {
      const effectivenessScore = calculateActionEffectiveness(action.beforeState, afterState, action.actionType);
      action.effectivenessScore = effectivenessScore;
      action.feedbackCollectedAt = new Date();
      storeActionFeedback(action, effectivenessScore);
    }
    
    // Mark as evaluated
    action.evaluationStatus = "evaluated";
  } catch (error) {
    console.error('Error evaluating action:', error);
    // Still mark as evaluated to prevent repeated attempts
    action.evaluationStatus = "evaluated";
  }
}

// Evaluate all pending actions
export async function evaluatePendingActions(actions: Action[], context: ActionContext): Promise<void> {
  const pendingActions = actions.filter(action => 
    action.executionStatus === "done" && isActionReadyForEvaluation(action)
  );
  
  for (const action of pendingActions) {
    await evaluateAction(action, context);
  }
}
export async function executeSafeAction(
  action: Action, 
  context: ActionContext
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    // Capture before state
    const beforeState = await captureActionState(action, context);
    action.beforeState = beforeState || undefined;
    
    // Update action status to running
    action.executionStatus = "running";

    switch (action.actionType) {
      case "add_crew":
      case "increase_rate":
      case "prioritize_task":
        // Handle task updates
        if (action.payload.taskId && action.payload.taskUpdates) {
          // Check if confirmation is required
          if (action.safetyLevel === "confirm_required") {
            const confirmed = await context.onShowConfirmation?.(action) ?? true;
            if (!confirmed) {
              action.executionStatus = "cancelled";
              return { success: false, error: "Action cancelled by user" };
            }
          }

          // Execute task update
          const result = await updateProjectTask(action.payload.taskId, action.payload.taskUpdates);
          if (result.success) {
            action.executionStatus = "done";
            action.executedAt = new Date();
            action.result = result.data;
            
            // Set evaluation due date (don't evaluate immediately)
            const evaluationDelay = calculateEvaluationDelay(action.actionType);
            action.evaluationDueAt = new Date(Date.now() + evaluationDelay);
            
            // Refresh tasks in UI
            context.onTaskUpdate?.(action.payload.taskId, action.payload.taskUpdates);
            
            // Log activity
            await logActivity(
              context.projectId,
              "task_updated",
              `Executed ${action.title}: ${action.description}`
            );
            
            return { success: true, result: result.data };
          } else {
            action.executionStatus = "failed";
            const errorMessage = typeof result.error === 'string' ? result.error : 'Unknown error occurred';
            action.error = errorMessage;
            return { success: false, error: errorMessage };
          }
        }
        break;

      case "generate_procurement":
        // Handle procurement generation
        if (action.safetyLevel === "confirm_required") {
          const confirmed = await context.onShowConfirmation?.(action) ?? true;
          if (!confirmed) {
            action.executionStatus = "cancelled";
            return { success: false, error: "Action cancelled by user" };
          }
        }

        const procurementResult = await generateProcurementFromTasks(
          context.projectId, 
          action.payload.procurementTitle
        );
        
        if (procurementResult.success) {
          action.executionStatus = "done";
          action.executedAt = new Date();
          action.result = procurementResult;
          
          // Set evaluation due date (don't evaluate immediately)
          const evaluationDelay = calculateEvaluationDelay(action.actionType);
          action.evaluationDueAt = new Date(Date.now() + evaluationDelay);
          
          // Refresh procurement in UI
          context.onProcurementGenerate?.(action.payload.procurementTitle);
          
          // Log activity
          await logActivity(
            context.projectId,
            "procurement_generated",
            `Generated procurement: ${action.description}`
          );
          
          context.onShowAlert?.(`Successfully generated procurement with ${procurementResult.itemCount} items`);
          return { success: true, result: procurementResult };
        } else {
          action.executionStatus = "failed";
          const errorMessage = typeof procurementResult.error === 'string' ? procurementResult.error : 'Unknown error occurred';
          action.error = errorMessage;
          return { success: false, error: errorMessage };
        }
        break;

      case "management_review":
      case "watch_weather":
      case "cost_control":
      case "review_boq":
        // Handle advisory actions (UI-only)
        action.executionStatus = "done";
        action.executedAt = new Date();
        action.result = { advisory: true };
        
        // Log activity
        await logActivity(
          context.projectId,
          "task_updated",
          `Advisory action: ${action.description}`
        );
        
        context.onShowAlert?.(`${action.title}: ${action.description}`);
        return { success: true, result: { advisory: true } };
        break;

      default:
        action.executionStatus = "failed";
        action.error = `Unsupported action type: ${action.actionType}`;
        return { success: false, error: action.error };
    }
    
    // Return success for cases that don't explicitly return
    return { success: true };
  } catch (error) {
    action.executionStatus = "failed";
    action.error = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: action.error };
  }
}

// Get safety level color
export function getSafetyLevelColor(safetyLevel: SafetyLevel): string {
  switch (safetyLevel) {
    case "safe":
      return "text-emerald-400 bg-emerald-900/20 border-emerald-900/40";
    case "confirm_required":
      return "text-amber-400 bg-amber-900/20 border-amber-900/40";
    case "advisory":
      return "text-blue-400 bg-blue-900/20 border-blue-900/40";
    default:
      return "text-slate-400 bg-slate-900/20 border-slate-800";
  }
}

// Get execution status color
export function getExecutionStatusColor(status: ExecutionStatus): string {
  switch (status) {
    case "idle":
      return "text-slate-400";
    case "running":
      return "text-blue-400";
    case "done":
      return "text-emerald-400";
    case "failed":
      return "text-red-400";
    case "cancelled":
      return "text-slate-500";
    default:
      return "text-slate-400";
  }
}

// Get action type icon
export function getActionTypeIcon(actionType: ActionType): string {
  switch (actionType) {
    case "add_crew":
      return "";
    case "increase_rate":
      return "";
    case "order_materials":
    case "generate_procurement":
      return "";
    case "review_boq":
      return "";
    case "management_review":
      return "";
    case "watch_weather":
      return "";
    case "prioritize_task":
      return "";
    case "cost_control":
      return "";
    default:
      return "";
  }
}

// Capture action state before execution
export async function captureActionState(action: Action, context: ActionContext): Promise<ActionState | null> {
  if (action.targetType === "task" && action.targetId) {
    const task = context.tasks.find(t => t.id === action.targetId);
    if (!task) return null;
    
    // Get current forecast for risk levels
    const forecast = await generateTaskForecast(task, context.projectId);
    
    return {
      taskId: task.id,
      percent_complete: task.percent_complete || 0,
      delayRiskLevel: forecast.delayRiskLevel,
      costRiskLevel: forecast.costRiskLevel,
      actualDurationDays: task.actual_duration_days || 0,
      plannedDurationDays: task.planned_duration_days || 0,
      crewSize: task.crew_size || 1,
      productionRatePerDay: task.production_rate_per_day || 1,
      weatherImpactFactor: task.weather_impact_factor || 1.0,
      laborCostPerDay: task.labor_cost_per_day || 0,
      equipmentCostPerDay: task.equipment_cost_per_day || 0,
      materialCostTotal: task.material_cost_total || 0
    };
  }
  
  return null;
}

// Capture action state after execution
export async function captureActionStateAfter(action: Action, context: ActionContext): Promise<ActionState | null> {
  if (action.targetType === "task" && action.targetId) {
    // Wait a moment for the action to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const task = context.tasks.find(t => t.id === action.targetId);
    if (!task) return null;
    
    // Get updated forecast for risk levels
    const forecast = await generateTaskForecast(task, context.projectId);
    
    return {
      taskId: task.id,
      percent_complete: task.percent_complete || 0,
      delayRiskLevel: forecast.delayRiskLevel,
      costRiskLevel: forecast.costRiskLevel,
      actualDurationDays: task.actual_duration_days || 0,
      plannedDurationDays: task.planned_duration_days || 0,
      crewSize: task.crew_size || 1,
      productionRatePerDay: task.production_rate_per_day || 1,
      weatherImpactFactor: task.weather_impact_factor || 1.0,
      laborCostPerDay: task.labor_cost_per_day || 0,
      equipmentCostPerDay: task.equipment_cost_per_day || 0,
      materialCostTotal: task.material_cost_total || 0
    };
  }
  
  return null;
}

// Calculate action effectiveness score
export function calculateActionEffectiveness(
  beforeState: ActionState,
  afterState: ActionState,
  actionType: ActionType
): number {
  if (!beforeState || !afterState) return 0;
  
  let score = 50; // Base score
  
  // Progress improvement (40% weight)
  
// Delay risk reduction
const riskLevelScores: Record<RiskLevel, number> = {
  low: 0,
  medium: 5,
  high: 15,
  critical: 25
};
score += riskLevelScores[beforeState.delayRiskLevel] || 0;
score += (riskLevelScores[beforeState.costRiskLevel] || 0) * 0.7; // Cost risk weighted slightly less
  
// Efficiency improvements (10% weight)
if (actionType === "increase_rate") {
  const rateImprovement = afterState.productionRatePerDay - beforeState.productionRatePerDay;
  if (rateImprovement > 0) {
    score += Math.min(rateImprovement * 2, 10);
  }
} else if (actionType === "add_crew") {
    const plannedDurationBefore = beforeState.plannedDurationDays / Math.max(beforeState.crewSize || 1, 1);
    const plannedDurationAfter = afterState.plannedDurationDays / Math.max(afterState.crewSize || 1, 1);
    const efficiencyImprovement = plannedDurationBefore - plannedDurationAfter;
    if (efficiencyImprovement > 0) {
      score += Math.min(efficiencyImprovement * 2, 10);
    }
  }
  
  return Math.min(Math.max(score, 0), 100);
}

// Get effectiveness level from score
export function getEffectivenessLevel(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

// Get effectiveness display text
export function getEffectivenessDisplay(action: Action): string {
  if (action.effectivenessScore !== undefined) {
    if (action.effectivenessScore >= 70) {
      return "Highly Effective";
    } else if (action.effectivenessScore >= 40) {
      return "Moderately Effective";
    } else {
      return "Low Impact";
    }
  }
  return "Unknown";
}

// In-memory action feedback store
const actionFeedbackStore = new Map<string, {
  action: Action;
  effectivenessScore: number;
  collectedAt: Date;
}>();

// Store action feedback
export function storeActionFeedback(action: Action, effectivenessScore: number): void {
  actionFeedbackStore.set(action.id, {
    action,
    effectivenessScore,
    collectedAt: new Date()
  });
}

// Get action feedback for decision
export function getActionFeedbackForDecision(decisionId: string): {
  action: Action;
  effectivenessScore: number;
  collectedAt: Date;
} | null {
  const feedbacks = Array.from(actionFeedbackStore.values())
    .filter(f => f.action.decisionId === decisionId);
  
  if (feedbacks.length === 0) return null;
  
  // Return the most recent feedback with highest effectiveness
  return feedbacks.sort((a, b) => b.effectivenessScore - a.effectivenessScore)[0];
}

// Update decision preferences based on feedback
export function updateDecisionPreferences(decisions: Decision[]): Decision[] {
  return decisions.map(decision => {
    const feedback = getActionFeedbackForDecision(decision.id);
    if (feedback) {
      // Boost priority of actions with proven effectiveness
      if (feedback.effectivenessScore >= 70) {
        // Increase priority weight in future decisions
        return {
          ...decision,
          confidence: Math.min(decision.confidence + 0.1, 1.0)
        };
      }
    }
    return decision;
  });
}
