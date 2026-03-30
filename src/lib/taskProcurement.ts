import { supabase } from "./supabase";
import { fetchProjectTasks, type ProjectTask } from "./tasks";
import { fetchProjectBOQItems, type BOQItem } from "./boqHelpers";
import { generateProcurementFromBOQ } from "./procurement";
import { logActivity } from "./activity";

// Material requirement from task
export interface TaskMaterialRequirement {
  taskId: string;
  taskName: string;
  boqItemId: string | null;
  materialName: string;
  materialDescription: string | null;
  requiredQuantity: number;
  unit: string | null;
  category: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  neededByDate: string | null; // From task end_date
}

// Aggregated material requirements
export interface AggregatedMaterialRequirement {
  materialName: string;
  materialDescription: string | null;
  totalRequiredQuantity: number;
  unit: string | null;
  category: string | null;
  sourceTasks: Array<{
    taskId: string;
    taskName: string;
    requiredQuantity: number;
  }>;
  priority: "low" | "normal" | "high" | "urgent";
  neededByDate: string | null;
}

// Fetch material requirements from tasks
export async function getMaterialRequirementsFromTasks(projectId: string): Promise<{
  success: boolean;
  data?: TaskMaterialRequirement[];
  error?: string;
}> {
  try {
    console.log("[Task Materials] Fetching material requirements from tasks for project:", projectId);

    // Step 1: Fetch all project tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("project_tasks")
      .select(`
        id,
        task_name,
        boq_item_id,
        quantity,
        unit,
        end_date,
        status
      `)
      .eq("project_id", projectId)
      .in("status", ["planned", "active"]);

    if (tasksError) {
      console.error("[Task Materials] Error fetching tasks:", tasksError);
      return { success: false, error: tasksError.message };
    }

    if (!tasks || tasks.length === 0) {
      console.log("[Task Materials] No active/planned tasks found");
      return { success: true, data: [] };
    }

    // Step 2: Fetch BOQ items for linked tasks
    const linkedBoqItemIds = tasks
      .filter(task => task.boq_item_id)
      .map(task => task.boq_item_id!)
      .filter((id, index, arr) => arr.indexOf(id) === index); // Unique IDs

    let boqItems: any[] = [];
    if (linkedBoqItemIds.length > 0) {
      const { data: boqData, error: boqError } = await supabase
        .from("boq_section_items")
        .select(`
          id,
          item_name,
          description,
          qty,
          unit_id,
          pick_category
        `)
        .in("id", linkedBoqItemIds);

      if (boqError) {
        console.error("[Task Materials] Error fetching BOQ items:", boqError);
        return { success: false, error: boqError.message };
      }

      boqItems = boqData || [];
    }

    // Step 3: Create material requirements
    const requirements: TaskMaterialRequirement[] = [];

    for (const task of tasks) {
      if (task.boq_item_id) {
        // Linked to BOQ item - use BOQ material info
        const boqItem = boqItems.find(item => item.id === task.boq_item_id);
        if (boqItem) {
          requirements.push({
            taskId: task.id,
            taskName: task.task_name,
            boqItemId: task.boq_item_id,
            materialName: boqItem.item_name,
            materialDescription: boqItem.description,
            requiredQuantity: task.quantity,
            unit: boqItem.unit_id || task.unit,
            category: boqItem.pick_category,
            priority: "normal", // Default priority
            neededByDate: task.end_date
          });
        }
      } else {
        // Manual task - create generic material requirement
        requirements.push({
          taskId: task.id,
          taskName: task.task_name,
          boqItemId: null,
          materialName: `${task.task_name} - Materials`,
          materialDescription: `Materials required for ${task.task_name}`,
          requiredQuantity: task.quantity,
          unit: task.unit,
          category: "General",
          priority: "normal",
          neededByDate: task.end_date
        });
      }
    }

    console.log(`[Task Materials] Generated ${requirements.length} material requirements`);
    return { success: true, data: requirements };
  } catch (error) {
    console.error("[Task Materials] Exception:", error);
    return { success: false, error: "Failed to fetch material requirements" };
  }
}

// Aggregate material requirements by material
export function aggregateMaterialRequirements(requirements: TaskMaterialRequirement[]): AggregatedMaterialRequirement[] {
  const materialMap = new Map<string, AggregatedMaterialRequirement>();

  for (const req of requirements) {
    const key = req.materialName.toLowerCase();
    
    if (!materialMap.has(key)) {
      materialMap.set(key, {
        materialName: req.materialName,
        materialDescription: req.materialDescription,
        totalRequiredQuantity: req.requiredQuantity,
        unit: req.unit,
        category: req.category,
        sourceTasks: [{
          taskId: req.taskId,
          taskName: req.taskName,
          requiredQuantity: req.requiredQuantity
        }],
        priority: req.priority,
        neededByDate: req.neededByDate
      });
    } else {
      const existing = materialMap.get(key)!;
      existing.totalRequiredQuantity += req.requiredQuantity;
      existing.sourceTasks.push({
        taskId: req.taskId,
        taskName: req.taskName,
        requiredQuantity: req.requiredQuantity
      });
      
      // Update priority to highest
      const priorityOrder = { low: 0, normal: 1, high: 2, urgent: 3 };
      if (priorityOrder[req.priority] > priorityOrder[existing.priority]) {
        existing.priority = req.priority;
      }
      
      // Update needed by date to earliest
      if (req.neededByDate && (!existing.neededByDate || req.neededByDate < existing.neededByDate)) {
        existing.neededByDate = req.neededByDate;
      }
    }
  }

  return Array.from(materialMap.values());
}

// Generate procurement items from task material requirements
export async function generateProcurementFromTasks(
  projectId: string,
  title?: string,
  mode: "snapshot" = "snapshot"
): Promise<{
  success: boolean;
  procurementId?: string;
  itemCount?: number;
  error?: string;
}> {
  try {
    console.log("[Task Procurement] Starting procurement generation from tasks (mode:)", mode);

    // Step 1: Get material requirements from tasks
    const requirementsResult = await getMaterialRequirementsFromTasks(projectId);
    if (!requirementsResult.success || !requirementsResult.data) {
      return { success: false, error: requirementsResult.error };
    }

    const requirements = requirementsResult.data;
    if (requirements.length === 0) {
      return { success: false, error: "No material requirements found in tasks" };
    }

    // Step 2: Aggregate requirements
    const aggregatedRequirements = aggregateMaterialRequirements(requirements);
    console.log(`[Task Procurement] Aggregated into ${aggregatedRequirements.length} unique materials`);

    // Step 3: Check for recent procurement generation (prevent duplication)
    const { data: recentProcurements } = await supabase
      .from("procurement_headers")
      .select("id, title, created_at")
      .eq("project_id", projectId)
      .eq("status", "draft")
      .like("title", "%from Tasks%")
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentProcurements && recentProcurements.length > 0) {
      const recent = recentProcurements[0];
      const hoursSinceLast = (Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLast < 1) {
        const proceed = confirm(
          `A procurement was generated from tasks ${Math.round(hoursSinceLast * 60)} minutes ago. Do you want to generate a new one?\n\n` +
          `Previous: ${recent.title}\n` +
          `Created: ${new Date(recent.created_at).toLocaleString()}`
        );
        
        if (!proceed) {
          return { success: false, error: "Generation cancelled by user" };
        }
      }
    }

    // Step 4: Create procurement header
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;

    const modeLabel = mode === "snapshot" ? "Snapshot" : "Live";
    const { data: procurementHeader, error: headerError } = await supabase
      .from("procurement_headers")
      .insert([{
        project_id: projectId,
        boq_id: null, // Not from BOQ
        title: title || `Procurement from Tasks (${modeLabel})`,
        status: "draft",
        approval_status: null,
        notes: `Auto-generated from ${requirements.length} task(s) with ${aggregatedRequirements.length} unique materials (${modeLabel} mode)`,
        created_at: new Date().toISOString()
      }])
      .select("id")
      .single();

    if (headerError || !procurementHeader) {
      console.error("[Task Procurement] Error creating procurement header:", headerError);
      return { success: false, error: "Failed to create procurement header" };
    }

    // Step 5: Create procurement items with snapshot metadata
    const procurementItems = aggregatedRequirements.map(req => ({
      procurement_id: procurementHeader.id,
      project_id: projectId,
      source_boq_item_id: null, // Not from BOQ
      material_name: req.materialName,
      description: req.materialDescription,
      quantity: req.totalRequiredQuantity,
      unit: req.unit,
      category: req.category,
      notes: `Required by ${req.sourceTasks.map(t => t.taskName).join(", ")} (${modeLabel} mode)`,
      status: "pending" as const,
      supplier: null,
      supplier_id: null,
      priority: req.priority,
      request_date: new Date().toISOString().split('T')[0],
      needed_by_date: req.neededByDate,
      ordered_qty: 0,
      delivered_qty: 0,
      unit_rate: 0,
      created_at: new Date().toISOString(),
      // Add snapshot metadata
      source_type: "task_generated" as const,
      source_snapshot: mode === "snapshot",
      source_data: mode === "snapshot" ? {
        generated_at: new Date().toISOString(),
        task_count: requirements.length,
        unique_materials: aggregatedRequirements.length,
        source_tasks: req.sourceTasks.map(t => ({
          task_id: t.taskId,
          task_name: t.taskName,
          required_quantity: t.requiredQuantity
        }))
      } : null
    }));

    const { error: itemsError } = await supabase
      .from("procurement_items")
      .insert(procurementItems);

    if (itemsError) {
      console.error("[Task Procurement] Error creating procurement items:", itemsError);
      return { success: false, error: "Failed to create procurement items" };
    }

    // Step 6: Log activity
    await logActivity(
      projectId,
      "procurement_created",
      `Generated procurement from ${requirements.length} task(s) (${modeLabel} mode)`
    );

    console.log(`[Task Procurement] ✓ Created procurement with ${procurementItems.length} items (${modeLabel} mode)`);
    return { 
      success: true, 
      procurementId: procurementHeader.id, 
      itemCount: procurementItems.length 
    };
  } catch (error) {
    console.error("[Task Procurement] Exception:", error);
    return { success: false, error: "Failed to generate procurement from tasks" };
  }
}

// Get task material summary for dashboard
export async function getTaskMaterialSummary(projectId: string): Promise<{
  success: boolean;
  data?: {
    totalTasks: number;
    tasksWithMaterials: number;
    totalUniqueMaterials: number;
    totalQuantity: number;
    upcomingRequirements: Array<{
      materialName: string;
      quantity: number;
      neededByDate: string;
      taskCount: number;
    }>;
  };
  error?: string;
}> {
  try {
    const requirementsResult = await getMaterialRequirementsFromTasks(projectId);
    if (!requirementsResult.success || !requirementsResult.data) {
      return { success: false, error: requirementsResult.error };
    }

    const requirements = requirementsResult.data;
    const aggregatedRequirements = aggregateMaterialRequirements(requirements);

    // Calculate upcoming requirements (sorted by needed date)
    const upcomingRequirements = aggregatedRequirements
      .filter(req => req.neededByDate)
      .sort((a, b) => {
        if (!a.neededByDate) return 1;
        if (!b.neededByDate) return -1;
        return new Date(a.neededByDate).getTime() - new Date(b.neededByDate).getTime();
      })
      .slice(0, 5) // Top 5 upcoming
      .map(req => ({
        materialName: req.materialName,
        quantity: req.totalRequiredQuantity,
        neededByDate: req.neededByDate!,
        taskCount: req.sourceTasks.length
      }));

    return {
      success: true,
      data: {
        totalTasks: requirements.length,
        tasksWithMaterials: requirements.filter(req => req.boqItemId).length,
        totalUniqueMaterials: aggregatedRequirements.length,
        totalQuantity: aggregatedRequirements.reduce((sum, req) => sum + req.totalRequiredQuantity, 0),
        upcomingRequirements
      }
    };
  } catch (error) {
    console.error("[Task Materials] Error getting summary:", error);
    return { success: false, error: "Failed to get material summary" };
  }
}
