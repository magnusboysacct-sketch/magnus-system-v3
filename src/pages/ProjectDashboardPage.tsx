import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getBudgetVsActual, createProjectCost, fetchProjectCosts, deleteProjectCost, getProjectFinancialSummary } from "../lib/costs";
import type { BudgetVsActual, CostType, ProjectCost, FinancialSummary } from "../lib/costs";
import { fetchProjectTasks, createProjectTask, updateProjectTask, deleteProjectTask, getProjectProgress } from "../lib/tasks";
import type { ProjectTask, TaskStatus, ProjectProgress } from "../lib/tasks";
import { uploadProjectFile, fetchProjectFiles, deleteProjectFile, downloadProjectFile } from "../lib/documents";
import type { ProjectDocument } from "../lib/documents";
import { fetchDailyLogs, createDailyLog, updateDailyLog, deleteDailyLog } from "../lib/dailyLogs";
import type { DailyLog } from "../lib/dailyLogs";
import { uploadProjectPhoto, fetchProjectPhotos, deleteProjectPhoto } from "../lib/photos";
import type { ProjectPhoto } from "../lib/photos";
import { fetchProjectActivity, getActivityIcon, getActivityColor } from "../lib/activity";
import type { ProjectActivity } from "../lib/activity";
import { getProjectWeather } from "../lib/weather";
import { WeatherCard, WeatherForecastCard } from "../components/WeatherCard";
import ProjectFinanceSummary from "../components/ProjectFinanceSummary";

type ProjectRow = {
  id: string;
  client_id: string | null;
  name: string;
  site_address: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientRow = {
  id: string;
  name: string;
};

type ProjectMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_role: string | null;
  project_role: string | null;
};

function prettyRole(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateString: string | null) {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export default function ProjectDashboardPage() {
  const { projectId: routeProjectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const pathnameParts = location.pathname.split("/").filter(Boolean);
  const fallbackProjectId =
    pathnameParts.length >= 2 && pathnameParts[0] === "projects"
      ? pathnameParts[1]
      : null;

  const projectId = routeProjectId || fallbackProjectId || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetVsActual>({
    budget: {
      material_budget: 0,
      labor_budget: 0,
      equipment_budget: 0,
      other_budget: 0,
      total_budget: 0,
    },
    actual: {
      material_cost: 0,
      labor_cost: 0,
      equipment_cost: 0,
      other_cost: 0,
      total_cost: 0,
    },
    variance: {
      material_variance: 0,
      labor_variance: 0,
      equipment_variance: 0,
      other_variance: 0,
      total_variance: 0,
    },
  });

  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [showCostForm, setShowCostForm] = useState(false);
  const [costFormData, setCostFormData] = useState({
    costType: "labor" as CostType,
    description: "",
    amount: "",
    costDate: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
    total_budget: 0,
    total_cost: 0,
    remaining_budget: 0,
    profit_margin: 0,
  });

  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    taskName: "",
    startDate: "",
    endDate: "",
    status: "planned" as TaskStatus,
  });
  const [progress, setProgress] = useState<ProjectProgress>({
    total_tasks: 0,
    completed_tasks: 0,
    progress_percent: 0,
  });
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [logFormData, setLogFormData] = useState({
    log_date: new Date().toISOString().split('T')[0],
    weather: '',
    workers_count: 0,
    work_performed: '',
    deliveries: '',
    issues: '',
    notes: '',
  });
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [activities, setActivities] = useState<ProjectActivity[]>([]);

  const projectStatusTone = useMemo(() => {
    switch (project?.status) {
      case "active":
        return "bg-emerald-900/20 text-emerald-300 border border-emerald-900/40";
      case "planning":
        return "bg-sky-900/20 text-sky-300 border border-sky-900/40";
      case "on_hold":
        return "bg-amber-900/20 text-amber-300 border border-amber-900/40";
      case "completed":
        return "bg-violet-900/20 text-violet-300 border border-violet-900/40";
      case "cancelled":
        return "bg-red-900/20 text-red-300 border border-red-900/40";
      default:
        return "bg-slate-900/20 text-slate-300 border border-slate-800";
    }
  }, [project?.status]);

  const profitMarginColor = useMemo(() => {
    const margin = financialSummary.profit_margin;
    if (margin > 20) {
      return "text-emerald-400";
    } else if (margin >= 10) {
      return "text-amber-400";
    } else {
      return "text-red-400";
    }
  }, [financialSummary.profit_margin]);

  const progressStatus = useMemo(() => {
    const percent = progress.progress_percent;
    if (percent > 80) {
      return {
        label: "On Track",
        color: "text-emerald-400",
        bgColor: "bg-emerald-900/20",
        borderColor: "border-emerald-900/40",
        barColor: "bg-emerald-500",
      };
    } else if (percent >= 40) {
      return {
        label: "In Progress",
        color: "text-amber-400",
        bgColor: "bg-amber-900/20",
        borderColor: "border-amber-900/40",
        barColor: "bg-amber-500",
      };
    } else {
      return {
        label: "Early Stage",
        color: "text-slate-400",
        bgColor: "bg-slate-900/20",
        borderColor: "border-slate-800",
        barColor: "bg-slate-500",
      };
    }
  }, [progress.progress_percent]);

  // Weather Risk Analysis
  const weatherRiskAnalysis = useMemo(() => {
    if (!weatherData?.forecast || !tasks.length) {
      return {
        riskLevel: 'low' as 'low' | 'medium' | 'high',
        riskScore: 0,
        affectedTasks: [],
        highRiskDays: [],
        bestWorkWindow: null,
        insights: []
      };
    }

    const forecast = weatherData.forecast;
    const riskScore = forecast.reduce((score: number, day: any) => {
      const weatherRisk = day.workSuitability === 'poor' ? 3 : 
                          day.workSuitability === 'limited' ? 2 : 
                          day.workSuitability === 'fair' ? 1 : 0;
      return score + weatherRisk;
    }, 0);

    const riskLevel = riskScore >= 15 ? 'high' : riskScore >= 8 ? 'medium' : 'low';
    
    // Find affected tasks (outdoor tasks overlapping with poor weather)
    const affectedTasks = tasks.filter(task => {
      if (!task.start_date || !task.end_date) return false;
      const taskStart = new Date(task.start_date);
      const taskEnd = new Date(task.end_date);
      
      return forecast.some((day: any) => {
        const dayDate = new Date(day.date);
        return dayDate >= taskStart && dayDate <= taskEnd && 
               day.workSuitability === 'poor';
      });
    });

    // Find high risk days
    const highRiskDays = forecast.filter((day: any) => 
      day.workSuitability === 'poor' || day.workSuitability === 'limited'
    ).map((day: any) => ({
      date: day.date,
      condition: day.condition,
      suitability: day.workSuitability,
      temperature: day.temperature
    }));

    // Find best work window (3+ consecutive good days)
    let bestWorkWindow = null;
    let currentWindow = { start: null, length: 0 };
    
    for (let i = 0; i < forecast.length; i++) {
      const day = forecast[i] as any;
      if (day.workSuitability === 'good') {
        if (!currentWindow.start) {
          currentWindow.start = day.date;
        }
        currentWindow.length++;
        
        if (currentWindow.length >= 3 && (!bestWorkWindow || currentWindow.length > bestWorkWindow.length)) {
          bestWorkWindow = { ...currentWindow };
        }
      } else {
        currentWindow = { start: null, length: 0 };
      }
    }

    // Generate insights
    const insights = [];
    if (riskLevel === 'high') {
      insights.push("High weather risk detected - consider rescheduling outdoor work");
    }
    if (affectedTasks.length > 0) {
      insights.push(`${affectedTasks.length} task(s) may be affected by poor weather`);
    }
    if (bestWorkWindow && bestWorkWindow.start) {
      insights.push(`Best work window: ${bestWorkWindow.length} consecutive good days starting ${new Date(bestWorkWindow.start).toLocaleDateString()}`);
    }
    if (highRiskDays.length > 0) {
      insights.push(`${highRiskDays.length} high-risk day(s) identified in forecast`);
    }

    return {
      riskLevel,
      riskScore,
      affectedTasks,
      highRiskDays,
      bestWorkWindow,
      insights
    };
  }, [weatherData, tasks]);

  // Task prioritization based on weather risk
  const prioritizedTasks = useMemo(() => {
    if (!weatherData?.forecast) return tasks;
    
    return [...tasks].sort((a, b) => {
      // Get weather risk for each task
      const getTaskWeatherRisk = (task: ProjectTask) => {
        if (!task.start_date || !task.end_date) return 0;
        
        const taskStart = new Date(task.start_date);
        const taskEnd = new Date(task.end_date);
        let risk = 0;
        
        weatherData.forecast.forEach((day: any) => {
          const dayDate = new Date(day.date);
          if (dayDate >= taskStart && dayDate <= taskEnd) {
            risk += day.workSuitability === 'poor' ? 3 : 
                   day.workSuitability === 'limited' ? 2 : 
                   day.workSuitability === 'fair' ? 1 : 0;
          }
        });
        
        return risk;
      };
      
      const riskA = getTaskWeatherRisk(a);
      const riskB = getTaskWeatherRisk(b);
      
      // Higher risk tasks come first (urgent)
      if (riskA !== riskB) return riskB - riskA;
      
      // Then by status (active tasks first)
      const statusPriority = { active: 0, planned: 1, complete: 2 };
      const priorityA = statusPriority[a.status] || 3;
      const priorityB = statusPriority[b.status] || 3;
      
      return priorityA - priorityB;
    });
  }, [tasks, weatherData]);

  // Task weather impact calculation
  const getTaskWeatherImpact = (task: ProjectTask) => {
    if (!weatherData?.forecast || !task.start_date || !task.end_date) {
      return { impact: 'none' as 'none' | 'low' | 'medium' | 'high', riskDays: 0 };
    }
    
    const taskStart = new Date(task.start_date);
    const taskEnd = new Date(task.end_date);
    let riskDays = 0;
    
    weatherData.forecast.forEach((day: any) => {
      const dayDate = new Date(day.date);
      if (dayDate >= taskStart && dayDate <= taskEnd) {
        if (day.workSuitability === 'poor' || day.workSuitability === 'limited') {
          riskDays++;
        }
      }
    });
    
    const taskDuration = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const riskPercentage = taskDuration > 0 ? (riskDays / taskDuration) * 100 : 0;
    
    let impact: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (riskPercentage >= 50) impact = 'high';
    else if (riskPercentage >= 30) impact = 'medium';
    else if (riskPercentage >= 15) impact = 'low';
    
    return { impact, riskDays };
  };

  async function loadCosts() {
    if (!projectId) return;
    const result = await fetchProjectCosts(projectId);
    if (result.success && result.data) {
      setCosts(result.data);
    }
  }

  async function loadTasks() {
    if (!projectId) return;
    const result = await fetchProjectTasks(projectId);
    if (result.success && result.data) {
      setTasks(result.data);
    }
  }

  async function loadProgress() {
    if (!projectId) return;
    const progressData = await getProjectProgress(projectId);
    setProgress(progressData);
  }

  async function loadDocuments() {
    if (!projectId) return;
    const result = await fetchProjectFiles(projectId);
    if (result.success && result.data) {
      setDocuments(result.data);
    }
  }

  async function loadWeather() {
    if (!projectId) return;
    setWeatherLoading(true);
    try {
      const weather = await getProjectWeather(projectId);
      setWeatherData(weather);
    } catch (error) {
      console.error('Failed to load weather:', error);
    } finally {
      setWeatherLoading(false);
    }
  }

  async function loadDailyLogs() {
    if (!projectId) return;
    const result = await fetchDailyLogs(projectId);
    if (result.success && result.data) {
      setDailyLogs(result.data);
    }
  }

  async function loadPhotos() {
    if (!projectId) return;
    const result = await fetchProjectPhotos(projectId);
    if (result.success && result.data) {
      setPhotos(result.data);
    }
  }

  async function loadBudgetData() {
    if (!projectId) return;
    const budgetData = await getBudgetVsActual(projectId);
    setBudgetVsActual(budgetData);
    const financialData = await getProjectFinancialSummary(projectId);
    setFinancialSummary(financialData);
  }

  async function loadActivities() {
    if (!projectId) return;
    const result = await fetchProjectActivity(projectId, 20);
    if (result.success && result.data) {
      setActivities(result.data);
    }
  }

  useEffect(() => {
    async function loadProjectDashboard() {
      if (!projectId) {
        setError("Missing project ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const projectResp = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projectResp.error) {
        setError(projectResp.error.message);
        setProject(null);
        setClient(null);
        setMembers([]);
        setLoading(false);
        return;
      }

      const projectData = projectResp.data as ProjectRow;
      setProject(projectData);

      if (projectData.client_id) {
        const clientResp = await supabase
          .from("clients")
          .select("id,name")
          .eq("id", projectData.client_id)
          .single();

        if (!clientResp.error && clientResp.data) {
          setClient(clientResp.data as ClientRow);
        } else {
          setClient(null);
        }
      } else {
        setClient(null);
      }

      const membersResp = await supabase.rpc("get_project_members", {
        p_project_id: projectId,
      });

      if (membersResp.error) {
        setError(membersResp.error.message);
        setMembers([]);
        setLoading(false);
        return;
      }

      setMembers((membersResp.data ?? []) as ProjectMemberRow[]);

      await loadBudgetData();
      await loadCosts();
      await loadTasks();
      await loadProgress();
      await loadDocuments();
      await loadDailyLogs();
      await loadPhotos();
      await loadActivities();
      await loadWeather();

      setLoading(false);
    }

    loadProjectDashboard();
  }, [projectId]);

  async function handleSubmitCost(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || submitting) return;

    const amount = parseFloat(costFormData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (!costFormData.description.trim()) {
      alert("Please enter a description");
      return;
    }

    setSubmitting(true);

    const result = await createProjectCost(
      projectId,
      costFormData.costType,
      costFormData.description.trim(),
      amount,
      costFormData.costDate
    );

    setSubmitting(false);

    if (result.success) {
      setCostFormData({
        costType: "labor",
        description: "",
        amount: "",
        costDate: new Date().toISOString().split("T")[0],
      });
      setShowCostForm(false);
      await loadCosts();
      await loadBudgetData();
    } else {
      alert("Failed to add cost. Please try again.");
    }
  }

  async function handleDeleteCost(costId: string) {
    if (!confirm("Are you sure you want to delete this cost entry?")) return;

    const result = await deleteProjectCost(costId);
    if (result.success) {
      await loadCosts();
      await loadBudgetData();
    } else {
      alert("Failed to delete cost. Please try again.");
    }
  }

  async function handleSubmitTask(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || submitting) return;

    if (!taskFormData.taskName.trim()) {
      alert("Please enter a task name");
      return;
    }

    setSubmitting(true);

    const result = await createProjectTask(
      projectId,
      taskFormData.taskName.trim(),
      taskFormData.startDate || undefined,
      taskFormData.endDate || undefined,
      taskFormData.status
    );

    setSubmitting(false);

    if (result.success) {
      setTaskFormData({
        taskName: "",
        startDate: "",
        endDate: "",
        status: "planned",
      });
      setShowTaskForm(false);
      await loadTasks();
      await loadProgress();
      await loadActivities();
    } else {
      alert("Failed to add task. Please try again.");
    }
  }

  async function handleUpdateTaskStatus(taskId: string, newStatus: TaskStatus) {
    const result = await updateProjectTask(taskId, { status: newStatus });
    if (result.success) {
      await loadTasks();
      await loadProgress();
      await loadActivities();
    } else {
      alert("Failed to update task status. Please try again.");
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    const result = await deleteProjectTask(taskId);
    if (result.success) {
      await loadTasks();
      await loadProgress();
    } else {
      alert("Failed to delete task. Please try again.");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!projectId || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);

    const result = await uploadProjectFile(projectId, file);

    setUploading(false);

    if (result.success) {
      await loadDocuments();
      await loadActivities();
      e.target.value = "";
    } else {
      alert("Failed to upload file. Please try again.");
    }
  }

  async function handleDeleteDocument(documentId: string, filePath: string, fileName: string) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    const result = await deleteProjectFile(documentId, filePath);
    if (result.success) {
      await loadDocuments();
    } else {
      alert("Failed to delete document. Please try again.");
    }
  }

  async function handleDownloadDocument(filePath: string, fileName: string) {
    const result = await downloadProjectFile(filePath, fileName);
    if (!result.success) {
      alert("Failed to download file. Please try again.");
    }
  }

  function handleOpenLogForm(log?: DailyLog) {
    if (log) {
      setEditingLog(log);
      setLogFormData({
        log_date: log.log_date,
        weather: log.weather,
        workers_count: log.workers_count,
        work_performed: log.work_performed,
        deliveries: log.deliveries,
        issues: log.issues,
        notes: log.notes,
      });
    } else {
      setEditingLog(null);
      setLogFormData({
        log_date: new Date().toISOString().split('T')[0],
        weather: '',
        workers_count: 0,
        work_performed: '',
        deliveries: '',
        issues: '',
        notes: '',
      });
    }
    setShowLogForm(true);
  }

  function handleCloseLogForm() {
    setShowLogForm(false);
    setEditingLog(null);
  }

  async function handleSaveLog() {
    if (!projectId) return;

    if (editingLog) {
      const result = await updateDailyLog(editingLog.id, logFormData);
      if (result.success) {
        await loadDailyLogs();
        handleCloseLogForm();
      } else {
        alert("Failed to update log. Please try again.");
      }
    } else {
      const result = await createDailyLog({
        project_id: projectId,
        ...logFormData,
      });
      if (result.success) {
        await loadDailyLogs();
        await loadActivities();
        handleCloseLogForm();
      } else {
        if ((result.error as any)?.code === '23505') {
          alert("A log for this date already exists. Please edit the existing log or choose a different date.");
        } else {
          alert("Failed to create log. Please try again.");
        }
      }
    }
  }

  async function handleDeleteLog(logId: string, logDate: string) {
    if (!confirm(`Are you sure you want to delete the log for ${logDate}?`)) return;

    const result = await deleteDailyLog(logId);
    if (result.success) {
      await loadDailyLogs();
    } else {
      alert("Failed to delete log. Please try again.");
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!projectId) return;

    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    if (!file.type.startsWith('image/')) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB.");
      return;
    }

    setUploadingPhoto(true);

    const result = await uploadProjectPhoto(file, {
      project_id: projectId,
      caption: photoCaption,
    });

    if (result.success) {
      await loadPhotos();
      await loadActivities();
      setPhotoCaption('');
      e.target.value = '';
    } else {
      alert("Failed to upload photo. Please try again.");
    }

    setUploadingPhoto(false);
  }

  async function handleDeletePhoto(photoId: string, photoUrl: string) {
    if (!confirm("Are you sure you want to delete this photo?")) return;

    const result = await deleteProjectPhoto(photoId, photoUrl);
    if (result.success) {
      await loadPhotos();
    } else {
      alert("Failed to delete photo. Please try again.");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Loading project dashboard...</div>;
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Project Dashboard</h1>
          <p className="text-slate-400 mt-1">Unable to load this project.</p>
        </div>

        <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>

        <button
          onClick={() => navigate("/projects")}
          className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Project Dashboard</h1>
          <p className="text-slate-400 mt-1">Project not found.</p>
        </div>

        <button
          onClick={() => navigate("/projects")}
          className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="text-xs text-yellow-400 mb-2">
        Route Project ID: {projectId || "NONE"}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
            <Link to="/projects" className="hover:text-slate-300">
              Projects
            </Link>
            <span>›</span>
            <span className="text-slate-400">{project.name}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs ${projectStatusTone}`}>
              {project.status}
            </span>
          </div>

          <p className="text-slate-400 mt-1">
            Project workspace for BOQ, takeoff, procurement, finance, documents, and team.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate("/projects")}
            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
          >
            Back
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/boq`)}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            Open BOQ
          </button>
          <button
            onClick={() => navigate(`/projects/${projectId}/takeoff`)}
            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
          >
            Open Takeoff
          </button>
        </div>
      </div>

      {projectId && <ProjectFinanceSummary projectId={projectId} />}

      {/* Weather & Schedule Section */}
      <div className="mt-6 space-y-6">
        {/* Weather Section */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Weather & Site Conditions</h2>
                <p className="text-xs text-slate-400 mt-1">Current conditions and forecast for project planning</p>
              </div>
              {weatherLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                  Loading...
                </div>
              )}
            </div>
          </div>
          
          <div className="p-6">
            {weatherLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 h-48 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-sm text-slate-400">Loading weather data...</div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 h-48 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                    <div className="text-sm text-slate-400">Loading forecast...</div>
                  </div>
                </div>
              </div>
            ) : weatherData ? (
              <div className="space-y-6">
                {/* Weather Risk Summary */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-200">Weather Risk Analysis</h3>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      weatherRiskAnalysis.riskLevel === 'high' ? 'bg-red-900/30 text-red-300 border border-red-900/40' :
                      weatherRiskAnalysis.riskLevel === 'medium' ? 'bg-amber-900/30 text-amber-300 border border-amber-900/40' :
                      'bg-emerald-900/30 text-emerald-300 border border-emerald-900/40'
                    }`}>
                      {weatherRiskAnalysis.riskLevel.toUpperCase()} RISK
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-200">{weatherRiskAnalysis.affectedTasks.length}</div>
                      <div className="text-xs text-slate-400">Tasks Affected</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-200">{weatherRiskAnalysis.highRiskDays.length}</div>
                      <div className="text-xs text-slate-400">High-Risk Days</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-200">
                        {weatherRiskAnalysis.bestWorkWindow ? weatherRiskAnalysis.bestWorkWindow.length : 0}
                      </div>
                      <div className="text-xs text-slate-400">Best Window Days</div>
                    </div>
                  </div>
                  
                  {weatherRiskAnalysis.insights.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-400 mb-2">Smart Insights:</div>
                      {weatherRiskAnalysis.insights.map((insight, index) => (
                        <div key={index} className="flex items-start gap-2 text-xs text-slate-300">
                          <svg className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span>{insight}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weather Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <WeatherCard weather={weatherData.current} title="Current Weather" />
                  <WeatherForecastCard forecast={weatherData.forecast} title="7-Day Forecast" />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-slate-300 mb-1">Weather Data Unavailable</div>
                <div className="text-xs text-slate-400">Set project location to enable weather updates and site condition monitoring</div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Section */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Project Schedule</h2>
                <p className="text-xs text-slate-400 mt-1">Task management and progress tracking</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${progressStatus.bgColor} ${progressStatus.color} ${progressStatus.borderColor} border`}>
                  {progressStatus.label}
                </div>
                <button
                  onClick={() => setShowTaskForm(!showTaskForm)}
                  className="px-3 py-1.5 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 text-sm border border-blue-900/40"
                >
                  {showTaskForm ? "Cancel" : "+ Add Task"}
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Progress Overview */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">Overall Progress</span>
                <span className="text-sm text-slate-400">{progress.progress_percent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${progressStatus.barColor}`}
                  style={{ width: `${progress.progress_percent}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                <span>{progress.completed_tasks} of {progress.total_tasks} tasks completed</span>
                {progress.total_tasks > 0 && (
                  <span>{Math.max(0, progress.total_tasks - progress.completed_tasks)} remaining</span>
                )}
              </div>
            </div>

            {/* Task Form */}
            {showTaskForm && (
              <form onSubmit={handleSubmitTask} className="mb-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-1.5">Task Name</label>
                  <input
                    type="text"
                    value={taskFormData.taskName}
                    onChange={(e) => setTaskFormData({ ...taskFormData, taskName: e.target.value })}
                    placeholder="e.g., Foundation excavation"
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={taskFormData.startDate}
                      onChange={(e) => setTaskFormData({ ...taskFormData, startDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={taskFormData.endDate}
                      onChange={(e) => setTaskFormData({ ...taskFormData, endDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Status</label>
                    <select
                      value={taskFormData.status}
                      onChange={(e) => setTaskFormData({ ...taskFormData, status: e.target.value as TaskStatus })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="planned">Planned</option>
                      <option value="active">Active</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Adding..." : "Add Task"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTaskForm(false);
                      setTaskFormData({
                        taskName: "",
                        startDate: "",
                        endDate: "",
                        status: "planned",
                      });
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Tasks List */}
            <div className="space-y-3">
              {prioritizedTasks.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-slate-300 mb-1">No Tasks Scheduled</div>
                  <div className="text-xs text-slate-400">Create your first task to start tracking project progress</div>
                </div>
              ) : (
                prioritizedTasks.map((task) => {
                  const weatherImpact = getTaskWeatherImpact(task);
                  const isWeatherSensitive = weatherImpact.impact !== 'none';
                  
                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border bg-slate-950/40 p-4 hover:bg-slate-950/60 transition-colors ${
                        isWeatherSensitive ? 'border-amber-800/50' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-sm font-medium text-slate-200">{task.task_name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              task.status === "complete"
                                ? "bg-emerald-900/30 text-emerald-300 border-emerald-900/40"
                                : task.status === "active"
                                ? "bg-blue-900/30 text-blue-300 border-blue-900/40"
                                : "bg-slate-800/50 text-slate-300 border-slate-700"
                            }`}>
                              {task.status}
                            </span>
                            
                            {/* Weather Risk Indicator */}
                            {isWeatherSensitive && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-900/30 text-amber-300 border-amber-900/40">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                </svg>
                                {weatherImpact.impact.toUpperCase()} RISK
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>Start: {task.start_date ? formatDate(task.start_date) : "Not set"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>End: {task.end_date ? formatDate(task.end_date) : "Not set"}</span>
                            </div>
                            {isWeatherSensitive && (
                              <div className="flex items-center gap-1 text-amber-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span>{weatherImpact.riskDays} risk day(s)</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={task.status}
                            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                            className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer ${
                              task.status === "complete"
                                ? "bg-emerald-900/30 text-emerald-300 border-emerald-900/40"
                                : task.status === "active"
                                ? "bg-blue-900/30 text-blue-300 border-blue-900/40"
                                : "bg-slate-800/50 text-slate-300 border-slate-700"
                            }`}
                          >
                            <option value="planned">Planned</option>
                            <option value="active">Active</option>
                            <option value="complete">Complete</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 mt-6">
        <div className="text-sm font-semibold mb-4">Legacy Financial Summary (Budget vs Costs)</div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Budget</div>
            <div className="text-2xl font-semibold text-slate-200">
              ${formatCurrency(financialSummary.total_budget)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Actual Cost</div>
            <div className="text-2xl font-semibold text-blue-400">
              ${formatCurrency(financialSummary.total_cost)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Remaining Budget</div>
            <div className={`text-2xl font-semibold ${
              financialSummary.remaining_budget >= 0 ? "text-emerald-400" : "text-red-400"
            }`}>
              ${formatCurrency(financialSummary.remaining_budget)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Profit Margin</div>
            <div className={`text-2xl font-semibold ${profitMarginColor}`}>
              {financialSummary.profit_margin.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {financialSummary.profit_margin > 20 ? "Excellent" :
               financialSummary.profit_margin >= 10 ? "Good" : "Low"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="text-sm font-semibold mb-4">Budget vs Actual</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-2 px-3 font-medium text-slate-400">Category</th>
                <th className="text-right py-2 px-3 font-medium text-slate-400">Budget</th>
                <th className="text-right py-2 px-3 font-medium text-slate-400">Actual</th>
                <th className="text-right py-2 px-3 font-medium text-slate-400">Variance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800/50">
                <td className="py-3 px-3 text-slate-300">Material</td>
                <td className="py-3 px-3 text-right text-slate-300">
                  ${formatCurrency(budgetVsActual.budget.material_budget)}
                </td>
                <td className="py-3 px-3 text-right text-blue-400">
                  ${formatCurrency(budgetVsActual.actual.material_cost)}
                </td>
                <td className={`py-3 px-3 text-right font-medium ${
                  budgetVsActual.variance.material_variance >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  ${formatCurrency(budgetVsActual.variance.material_variance)}
                </td>
              </tr>
              <tr className="border-b border-slate-800/50">
                <td className="py-3 px-3 text-slate-300">Labor</td>
                <td className="py-3 px-3 text-right text-slate-300">
                  ${formatCurrency(budgetVsActual.budget.labor_budget)}
                </td>
                <td className="py-3 px-3 text-right text-amber-400">
                  ${formatCurrency(budgetVsActual.actual.labor_cost)}
                </td>
                <td className={`py-3 px-3 text-right font-medium ${
                  budgetVsActual.variance.labor_variance >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  ${formatCurrency(budgetVsActual.variance.labor_variance)}
                </td>
              </tr>
              <tr className="border-b border-slate-800/50">
                <td className="py-3 px-3 text-slate-300">Equipment</td>
                <td className="py-3 px-3 text-right text-slate-300">
                  ${formatCurrency(budgetVsActual.budget.equipment_budget)}
                </td>
                <td className="py-3 px-3 text-right text-purple-400">
                  ${formatCurrency(budgetVsActual.actual.equipment_cost)}
                </td>
                <td className={`py-3 px-3 text-right font-medium ${
                  budgetVsActual.variance.equipment_variance >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  ${formatCurrency(budgetVsActual.variance.equipment_variance)}
                </td>
              </tr>
              <tr className="border-b border-slate-800/50">
                <td className="py-3 px-3 text-slate-300">Other</td>
                <td className="py-3 px-3 text-right text-slate-300">
                  ${formatCurrency(budgetVsActual.budget.other_budget)}
                </td>
                <td className="py-3 px-3 text-right text-slate-400">
                  ${formatCurrency(budgetVsActual.actual.other_cost)}
                </td>
                <td className={`py-3 px-3 text-right font-medium ${
                  budgetVsActual.variance.other_variance >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  ${formatCurrency(budgetVsActual.variance.other_variance)}
                </td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-3 px-3 font-semibold text-slate-200">Total</td>
                <td className="py-3 px-3 text-right font-semibold text-slate-200">
                  ${formatCurrency(budgetVsActual.budget.total_budget)}
                </td>
                <td className="py-3 px-3 text-right font-semibold text-emerald-300">
                  ${formatCurrency(budgetVsActual.actual.total_cost)}
                </td>
                <td className={`py-3 px-3 text-right font-bold ${
                  budgetVsActual.variance.total_variance >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  ${formatCurrency(budgetVsActual.variance.total_variance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Positive variance indicates budget remaining. Negative variance indicates over budget.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Project Costs</div>
          <button
            onClick={() => setShowCostForm(!showCostForm)}
            className="px-3 py-1.5 rounded-lg bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-300 text-sm border border-emerald-900/40"
          >
            {showCostForm ? "Cancel" : "+ Add Cost"}
          </button>
        </div>

        {showCostForm && (
          <form onSubmit={handleSubmitCost} className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Cost Type</label>
                <select
                  value={costFormData.costType}
                  onChange={(e) =>
                    setCostFormData({ ...costFormData, costType: e.target.value as CostType })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 text-sm"
                  required
                >
                  <option value="material">Material</option>
                  <option value="labor">Labor</option>
                  <option value="equipment">Equipment</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Date</label>
                <input
                  type="date"
                  value={costFormData.costDate}
                  onChange={(e) => setCostFormData({ ...costFormData, costDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 text-sm"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1.5">Description</label>
                <input
                  type="text"
                  value={costFormData.description}
                  onChange={(e) => setCostFormData({ ...costFormData, description: e.target.value })}
                  placeholder="e.g., Site labor for week ending 3/9"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costFormData.amount}
                  onChange={(e) => setCostFormData({ ...costFormData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 text-sm border border-emerald-900/50 disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Cost"}
              </button>
              <button
                type="button"
                onClick={() => setShowCostForm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {costs.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">
              No costs recorded yet. Add a cost to get started.
            </div>
          ) : (
            costs.map((cost) => (
              <div
                key={cost.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        cost.cost_type === "material"
                          ? "bg-blue-900/30 text-blue-300 border border-blue-900/40"
                          : cost.cost_type === "labor"
                          ? "bg-amber-900/30 text-amber-300 border border-amber-900/40"
                          : cost.cost_type === "equipment"
                          ? "bg-purple-900/30 text-purple-300 border border-purple-900/40"
                          : "bg-slate-800/50 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {cost.cost_type}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(cost.cost_date)}</span>
                  </div>
                  <div className="text-sm text-slate-200">{cost.description}</div>
                  {cost.notes && (
                    <div className="text-xs text-slate-500 mt-1">{cost.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-slate-200">
                    ${formatCurrency(Number(cost.amount))}
                  </div>
                  <button
                    onClick={() => handleDeleteCost(cost.id)}
                    className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Project Progress</div>
          <div className={`px-2 py-1 rounded text-xs font-medium border ${progressStatus.bgColor} ${progressStatus.color} ${progressStatus.borderColor}`}>
            {progressStatus.label}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Total Tasks</div>
            <div className="text-2xl font-semibold text-slate-200">{progress.total_tasks}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Completed Tasks</div>
            <div className="text-2xl font-semibold text-slate-200">{progress.completed_tasks}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500 mb-1">Progress</div>
            <div className={`text-2xl font-semibold ${progressStatus.color}`}>
              {progress.progress_percent}%
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${progressStatus.barColor} transition-all duration-500`}
              style={{ width: `${progress.progress_percent}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Project Schedule</div>
          <button
            onClick={() => setShowTaskForm(!showTaskForm)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
          >
            {showTaskForm ? "Cancel" : "+ Add Task"}
          </button>
        </div>

        {showTaskForm && (
          <form onSubmit={handleSubmitTask} className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Task Name</label>
              <input
                type="text"
                value={taskFormData.taskName}
                onChange={(e) => setTaskFormData({ ...taskFormData, taskName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter task name"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={taskFormData.startDate}
                  onChange={(e) => setTaskFormData({ ...taskFormData, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={taskFormData.endDate}
                  onChange={(e) => setTaskFormData({ ...taskFormData, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Status</label>
                <select
                  value={taskFormData.status}
                  onChange={(e) => setTaskFormData({ ...taskFormData, status: e.target.value as TaskStatus })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding..." : "Add Task"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTaskForm(false);
                  setTaskFormData({
                    taskName: "",
                    startDate: "",
                    endDate: "",
                    status: "planned",
                  });
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">
              No tasks scheduled yet. Add a task to get started.
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 mb-2">{task.task_name}</div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <div>
                        <span className="text-slate-500">Start:</span> {task.start_date ? formatDate(task.start_date) : "—"}
                      </div>
                      <div>
                        <span className="text-slate-500">End:</span> {task.end_date ? formatDate(task.end_date) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={task.status}
                      onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                      className={`px-2 py-1 rounded text-xs font-medium border ${
                        task.status === "complete"
                          ? "bg-emerald-900/30 text-emerald-300 border-emerald-900/40"
                          : task.status === "active"
                          ? "bg-blue-900/30 text-blue-300 border-blue-900/40"
                          : "bg-slate-800/50 text-slate-300 border-slate-700"
                      }`}
                    >
                      <option value="planned">Planned</option>
                      <option value="active">Active</option>
                      <option value="complete">Complete</option>
                    </select>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Project Documents</div>
          <label className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition cursor-pointer">
            {uploading ? "Uploading..." : "Upload File"}
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>

        <div className="space-y-2">
          {documents.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No documents uploaded yet
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {doc.file_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(doc.id, doc.file_url, doc.file_name)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Daily Site Log</div>
          <button
            onClick={() => handleOpenLogForm()}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
          >
            + Add Log
          </button>
        </div>

        {showLogForm && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium">
                {editingLog ? "Edit Log" : "New Log"}
              </div>
              <button
                onClick={handleCloseLogForm}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={logFormData.log_date}
                    onChange={(e) => setLogFormData({ ...logFormData, log_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Weather</label>
                  <input
                    type="text"
                    value={logFormData.weather}
                    onChange={(e) => setLogFormData({ ...logFormData, weather: e.target.value })}
                    placeholder="Sunny, Rainy, Cloudy..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Workers Count</label>
                <input
                  type="number"
                  value={logFormData.workers_count}
                  onChange={(e) => setLogFormData({ ...logFormData, workers_count: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Work Performed</label>
                <textarea
                  value={logFormData.work_performed}
                  onChange={(e) => setLogFormData({ ...logFormData, work_performed: e.target.value })}
                  placeholder="Describe the work completed today..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Deliveries</label>
                <textarea
                  value={logFormData.deliveries}
                  onChange={(e) => setLogFormData({ ...logFormData, deliveries: e.target.value })}
                  placeholder="Materials and equipment delivered..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Issues</label>
                <textarea
                  value={logFormData.issues}
                  onChange={(e) => setLogFormData({ ...logFormData, issues: e.target.value })}
                  placeholder="Problems or concerns encountered..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea
                  value={logFormData.notes}
                  onChange={(e) => setLogFormData({ ...logFormData, notes: e.target.value })}
                  placeholder="Additional notes and observations..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleCloseLogForm}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLog}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                >
                  {editingLog ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {dailyLogs.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              No daily logs recorded yet
            </div>
          ) : (
            dailyLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      {new Date(log.log_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                    {log.weather && (
                      <div className="text-xs text-slate-400 mt-1">
                        Weather: {log.weather}
                      </div>
                    )}
                    {log.workers_count > 0 && (
                      <div className="text-xs text-slate-400 mt-1">
                        Workers: {log.workers_count}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleOpenLogForm(log)}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteLog(log.id, log.log_date)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {log.work_performed && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Work Performed</div>
                      <div className="text-slate-300">{log.work_performed}</div>
                    </div>
                  )}

                  {log.deliveries && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Deliveries</div>
                      <div className="text-slate-300">{log.deliveries}</div>
                    </div>
                  )}

                  {log.issues && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Issues</div>
                      <div className="text-slate-300">{log.issues}</div>
                    </div>
                  )}

                  {log.notes && (
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1">Notes</div>
                      <div className="text-slate-300">{log.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Project Photo Log</div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Photo caption (optional)"
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <label className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition cursor-pointer">
              {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">
            No photos uploaded yet
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden"
              >
                <div className="aspect-square bg-slate-900 relative">
                  <img
                    src={(photo as any).publicUrl}
                    alt={photo.caption || 'Project photo'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 space-y-2">
                  {photo.caption && (
                    <div className="text-sm text-slate-300">{photo.caption}</div>
                  )}
                  <div className="text-xs text-slate-500">
                    {new Date(photo.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                  <button
                    onClick={() => handleDeletePhoto(photo.id, photo.photo_url)}
                    className="w-full px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold mb-4">Overview</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Client</div>
              <div className="mt-1 text-sm font-medium">{client?.name || "No client"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Site Address</div>
              <div className="mt-1 text-sm font-medium">{project.site_address || "—"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">Start Date</div>
              <div className="mt-1 text-sm font-medium">{project.start_date || "—"}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-500">End Date</div>
              <div className="mt-1 text-sm font-medium">{project.end_date || "—"}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs text-slate-500">Notes</div>
            <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
              {project.notes || "No notes added yet."}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Project Team</div>
            <div className="text-xs text-slate-400">{members.length} members</div>
          </div>

          {members.length === 0 ? (
            <div className="text-sm text-slate-400">No team members assigned yet.</div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="text-sm font-medium">
                    {member.full_name?.trim() || member.email || member.user_id}
                  </div>
                  {member.email && (
                    <div className="text-xs text-slate-400 mt-1">{member.email}</div>
                  )}
                  <div className="text-xs text-slate-500 mt-2">
                    Company role: {prettyRole(member.company_role)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Project role: {prettyRole(member.project_role)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="text-sm font-semibold mb-4">Recent Activity</div>

        {activities.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            No activity yet
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-start gap-3"
              >
                <div className="text-xl mt-0.5">
                  {getActivityIcon(activity.activity_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${getActivityColor(activity.activity_type)}`}>
                    {activity.message}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {activity.user_profile && (
                      <div className="text-xs text-slate-500">
                        {activity.user_profile.full_name || activity.user_profile.email || 'User'}
                      </div>
                    )}
                    <div className="text-xs text-slate-600">•</div>
                    <div className="text-xs text-slate-500">
                      {new Date(activity.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="text-sm font-semibold mb-4">Workspace</div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}/boq`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">BOQ</div>
            <div className="text-xs text-slate-400 mt-1">
              Build and manage bills of quantities for this project.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/takeoff`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Takeoff</div>
            <div className="text-xs text-slate-400 mt-1">
              Open the measurement workspace and drawing tools.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/procurement`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Procurement</div>
            <div className="text-xs text-slate-400 mt-1">
              Track materials, suppliers, and purchasing activity.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/finance`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Finance</div>
            <div className="text-xs text-slate-400 mt-1">
              Monitor project costs, valuations, and payment status.
            </div>
          </button>

          <button
            onClick={() => navigate(`/projects/${projectId}/reports`)}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Reports</div>
            <div className="text-xs text-slate-400 mt-1">
              Generate project summaries and management reports.
            </div>
          </button>

          <button
            onClick={() => navigate("/projects")}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:bg-slate-900/60 transition"
          >
            <div className="text-sm font-semibold">Manage Projects</div>
            <div className="text-xs text-slate-400 mt-1">
              Return to the full projects list and edit project details.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
