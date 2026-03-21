import { supabase } from "./supabase";
import {
  detectBOQContext,
  generateBOQSuggestions,
  type BOQItem,
  type BOQSuggestion,
} from "./boqSuggestions";

export type AIContext =
  | "estimating"
  | "boq"
  | "procurement"
  | "daily_log"
  | "expense"
  | "takeoff"
  | "general";

export interface AISuggestion {
  id: string;
  context: AIContext;
  type: "completion" | "recommendation" | "insight" | "warning";
  title: string;
  description: string;
  action?: {
    label: string;
    data: any;
  };
  priority: "low" | "medium" | "high";
}

export interface AIPromptData {
  context: AIContext;
  currentData?: any;
  projectId?: string;
  userId?: string;
}

export async function generateSuggestions(promptData: AIPromptData): Promise<AISuggestion[]> {
  const suggestions: AISuggestion[] = [];

  switch (promptData.context) {
    case "estimating":
      suggestions.push(...getEstimatingSuggestions(promptData));
      break;
    case "boq":
      suggestions.push(...(await getBOQSuggestions(promptData)));
      break;
    case "procurement":
      suggestions.push(...getProcurementSuggestions(promptData));
      break;
    case "daily_log":
      suggestions.push(...getDailyLogSuggestions(promptData));
      break;
    case "expense":
      suggestions.push(...getExpenseSuggestions(promptData));
      break;
    case "takeoff":
      suggestions.push(...getTakeoffSuggestions(promptData));
      break;
    default:
      suggestions.push(...getGeneralSuggestions(promptData));
  }

  return suggestions;
}

function getEstimatingSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  if (!data.currentData || Object.keys(data.currentData).length === 0) {
    suggestions.push({
      id: "est-1",
      context: "estimating",
      type: "recommendation",
      title: "Start with Project Scope",
      description: "Define your project scope and major work categories before detailed estimating. This helps ensure complete coverage.",
      priority: "high",
    });

    suggestions.push({
      id: "est-2",
      context: "estimating",
      type: "recommendation",
      title: "Use Smart Library",
      description: "Leverage the Smart Library for common items. It contains industry-standard rates and can speed up your estimate by 60%.",
      action: {
        label: "Browse Smart Library",
        data: { route: "/rates" },
      },
      priority: "medium",
    });
  }

  if (data.currentData?.hasItems && !data.currentData?.hasContingency) {
    suggestions.push({
      id: "est-3",
      context: "estimating",
      type: "warning",
      title: "Add Contingency",
      description: "Consider adding a contingency line item (typically 5-10% for renovation, 10-15% for new construction).",
      priority: "high",
    });
  }

  return suggestions;
}

async function getBOQSuggestions(data: AIPromptData): Promise<AISuggestion[]> {
  const suggestions: AISuggestion[] = [];

  if (!data.currentData || data.currentData?.itemCount === 0) {
    suggestions.push({
      id: "boq-help-1",
      context: "boq",
      type: "recommendation",
      title: "Help me build my BOQ",
      description: "Start by importing from takeoff measurements or adding items from the Smart Library. AI can suggest common items to get you started.",
      action: {
        label: "Import from Takeoff",
        data: { action: "import_takeoff" },
      },
      priority: "high",
    });

    suggestions.push({
      id: "boq-help-2",
      context: "boq",
      type: "insight",
      title: "BOQ Best Practices",
      description: "Group items by CSI division or trade. Use assemblies for repetitive work. Include waste factors and contingency.",
      priority: "medium",
    });
  }

  suggestions.push({
    id: "boq-1",
    context: "boq",
    type: "insight",
    title: "Organize by Trade",
    description: "Group items by trade or CSI division for better clarity and easier subcontractor coordination.",
    priority: "low",
  });

  if (data.currentData?.itemCount > 50) {
    suggestions.push({
      id: "boq-2",
      context: "boq",
      type: "recommendation",
      title: "Use Assemblies",
      description: "You have many items. Consider creating assemblies for repetitive work packages to streamline your BOQ.",
      action: {
        label: "Create Assembly",
        data: { route: "/assemblies" },
      },
      priority: "medium",
    });
  }

  if (data.currentData?.missingUnits && data.currentData.missingUnits > 0) {
    suggestions.push({
      id: "boq-3",
      context: "boq",
      type: "warning",
      title: "Missing Units",
      description: `${data.currentData.missingUnits} items are missing units of measure. Add units for accurate quantity tracking.`,
      priority: "high",
    });
  }

  if (data.currentData?.boqItems && Array.isArray(data.currentData.boqItems)) {
    try {
      const context = await detectBOQContext(data.currentData.boqItems);
      const boqSuggestions = await generateBOQSuggestions(context);

      if (boqSuggestions.length > 0) {
        suggestions.push({
          id: "boq-ai-suggestions",
          context: "boq",
          type: "recommendation",
          title: `AI Suggests ${boqSuggestions.length} Items`,
          description: "Based on your current BOQ, AI has identified missing items and related materials you might need.",
          action: {
            label: "View Suggestions",
            data: { action: "show_ai_suggestions", suggestions: boqSuggestions },
          },
          priority: "high",
        });
      }
    } catch (error) {
      console.error("Error generating AI BOQ suggestions:", error);
    }
  }

  if (data.currentData?.itemCount > 0) {
    suggestions.push({
      id: "boq-help-3",
      context: "boq",
      type: "recommendation",
      title: "Next Steps",
      description: "Review quantities, verify units, add cost codes, then export to procurement for ordering.",
      action: {
        label: "Export to Procurement",
        data: { action: "export_procurement" },
      },
      priority: "medium",
    });
  }

  return suggestions;
}

function getProcurementSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  suggestions.push({
    id: "proc-1",
    context: "procurement",
    type: "recommendation",
    title: "Link Suppliers Early",
    description: "Link items to preferred suppliers now to get accurate pricing and streamline purchase orders.",
    priority: "medium",
  });

  if (data.currentData?.hasUnlinkedItems) {
    suggestions.push({
      id: "proc-2",
      context: "procurement",
      type: "insight",
      title: "Supplier SKU Matching",
      description: "Link items to supplier SKUs for automatic price updates and easier reordering.",
      priority: "low",
    });
  }

  if (data.currentData?.pendingPOs) {
    suggestions.push({
      id: "proc-3",
      context: "procurement",
      type: "warning",
      title: "Pending Purchase Orders",
      description: `You have ${data.currentData.pendingPOs} pending POs. Review and issue them to avoid project delays.`,
      priority: "high",
    });
  }

  return suggestions;
}

function getDailyLogSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  const now = new Date();
  const hour = now.getHours();

  if (!data.currentData?.hasLogToday) {
    suggestions.push({
      id: "log-help-1",
      context: "daily_log",
      type: "recommendation",
      title: "Summarize daily log",
      description: "Record crew attendance, work completed, materials delivered, weather conditions, and any delays or issues.",
      action: {
        label: "Create Daily Log",
        data: { action: "create_log" },
      },
      priority: hour >= 15 && hour < 18 ? "high" : "medium",
    });
  }

  if (data.currentData?.hasLogToday) {
    suggestions.push({
      id: "log-help-2",
      context: "daily_log",
      type: "insight",
      title: "Today's Summary",
      description: "Review and update today's log with final crew hours, completed tasks, and any end-of-day observations.",
      action: {
        label: "View Today's Log",
        data: { action: "view_today_log" },
      },
      priority: "medium",
    });
  }

  suggestions.push({
    id: "log-2",
    context: "daily_log",
    type: "recommendation",
    title: "Capture Photos",
    description: "Document work progress with photos. Visual records are invaluable for progress billing and dispute resolution.",
    action: {
      label: "Add Photos",
      data: { action: "add_photos" },
    },
    priority: "medium",
  });

  if (data.currentData?.consecutiveDaysWithoutLog > 2) {
    suggestions.push({
      id: "log-3",
      context: "daily_log",
      type: "warning",
      title: "Logging Gap Detected",
      description: `No daily logs for ${data.currentData.consecutiveDaysWithoutLog} days. Consistent documentation protects against claims.`,
      priority: "high",
    });
  }

  if (data.currentData?.weatherConditions === "poor" || data.currentData?.hasDelays) {
    suggestions.push({
      id: "log-4",
      context: "daily_log",
      type: "warning",
      title: "Document Delays",
      description: "Weather or other delays detected. Document thoroughly for potential schedule impact claims.",
      priority: "high",
    });
  }

  return suggestions;
}

function getExpenseSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  if (data.currentData?.isNewExpense) {
    suggestions.push({
      id: "exp-help-1",
      context: "expense",
      type: "recommendation",
      title: "Explain this expense",
      description: "Add a clear description, assign to the correct cost code, attach the receipt, and specify the project phase.",
      priority: "high",
    });
  }

  suggestions.push({
    id: "exp-1",
    context: "expense",
    type: "recommendation",
    title: "Attach Receipts",
    description: "Upload receipt images for all expenses. Use the OCR feature to auto-extract amount and vendor.",
    action: {
      label: "Upload Receipt",
      data: { action: "upload_receipt" },
    },
    priority: "medium",
  });

  if (data.currentData?.missingCostCodes && data.currentData.missingCostCodes > 0) {
    suggestions.push({
      id: "exp-2",
      context: "expense",
      type: "warning",
      title: "Assign Cost Codes",
      description: `${data.currentData.missingCostCodes} expenses missing cost codes. Assign codes for accurate job costing.`,
      priority: "high",
    });
  }

  if (data.currentData?.duplicateWarning) {
    suggestions.push({
      id: "exp-3",
      context: "expense",
      type: "warning",
      title: "Possible Duplicate",
      description: "Similar expense detected. Verify this isn't a duplicate entry.",
      priority: "medium",
    });
  }

  if (data.currentData?.hasExpenses) {
    suggestions.push({
      id: "exp-help-2",
      context: "expense",
      type: "insight",
      title: "Track Against Budget",
      description: "Compare your expenses to budget allocations. Monitor spending by cost code to stay on track.",
      action: {
        label: "View Budget",
        data: { action: "view_budget" },
      },
      priority: "low",
    });
  }

  return suggestions;
}

function getTakeoffSuggestions(data: AIPromptData): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  suggestions.push({
    id: "take-1",
    context: "takeoff",
    type: "recommendation",
    title: "Set Scale First",
    description: "Always calibrate your scale before measuring. Use a known dimension from the plans.",
    priority: "high",
  });

  suggestions.push({
    id: "take-2",
    context: "takeoff",
    type: "insight",
    title: "Export to BOQ",
    description: "When complete, export your takeoff measurements directly to BOQ to maintain accuracy and save time.",
    action: {
        label: "Export to BOQ",
        data: { action: "export_boq" },
      },
      priority: "medium",
  });

  if (data.currentData?.hasMultipleMeasurements) {
    suggestions.push({
      id: "take-3",
      context: "takeoff",
      type: "recommendation",
      title: "Use Color Coding",
      description: "Use different colors for different measurement types or trades for easier review.",
      priority: "low",
    });
  }

  return suggestions;
}

function getGeneralSuggestions(data: AIPromptData): AISuggestion[] {
  return [
    {
      id: "gen-1",
      context: "general",
      type: "recommendation",
      title: "Select Active Project",
      description: "Choose a project from the selector to see context-specific suggestions and data.",
      priority: "medium",
    },
  ];
}

export async function getSuggestionHistory(userId: string, limit: number = 10) {
  try {
    const { data, error } = await supabase
      .from("ai_suggestion_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching suggestion history:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching suggestion history:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function logSuggestionInteraction(
  userId: string,
  suggestionId: string,
  action: "viewed" | "dismissed" | "accepted"
) {
  try {
    const { error } = await supabase.from("ai_suggestion_history").insert({
      user_id: userId,
      suggestion_id: suggestionId,
      action,
    });

    if (error) {
      console.error("Error logging suggestion interaction:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception logging suggestion interaction:", e);
    return { success: false, error: e };
  }
}
