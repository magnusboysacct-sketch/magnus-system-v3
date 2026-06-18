// src/lib/estimateIntelligence.ts
// AI Estimating Intelligence Engine — Magnus Boys Construction ERP
// Provides: Bid Health Score, Markup Advisor, Duration Estimator
// User always has final control — AI recommends, never applies automatically

import { supabase } from "./supabase";
import { magnusAI } from "./magnusAI";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EstimateFactors {
  project_type: "residential" | "commercial" | "government" | "infrastructure" | "renovation" | "";
  client_type: "new" | "existing" | "government" | "private" | "";
  payment_terms: "upfront" | "milestone" | "net30" | "net60" | "";
  project_complexity: "low" | "medium" | "high" | "";
  distance_km: number;
  weather_risk: "low" | "moderate" | "high" | "";
  rainfall_season: boolean;
  high_material_volatility: boolean;
  labor_scarce: boolean;
  long_material_lead_time: boolean;
}

export interface BidHealthScore {
  overall: number;           // 0-100, higher = healthier
  risk_level: "low" | "medium" | "high" | "critical";
  breakdown: {
    client_risk: number;     // 0-20
    location_risk: number;   // 0-15
    material_risk: number;   // 0-15
    weather_risk: number;    // 0-15
    labor_risk: number;      // 0-10
    schedule_risk: number;   // 0-10
    cashflow_risk: number;   // 0-10
    complexity_risk: number; // 0-5
  };
  risk_flags: string[];
}

export interface MarkupRecommendation {
  range_low: number;
  range_high: number;
  suggested: number;
  reasoning: string[];
  ai_powered: boolean;
}

export interface DurationEstimate {
  total_weeks: number;
  breakdown: { phase: string; weeks: number }[];
  risk_factors: string[];
  ai_powered: boolean;
}

export interface EstimateIntelligenceResult {
  bid_health: BidHealthScore;
  markup: MarkupRecommendation;
  duration: DurationEstimate;
  estimated_profit_at_suggested: number;
  estimated_profit_at_low: number;
  key_risks: string[];
  generated_at: string;
}

// ─── Bid Health Score (pure logic, no AI call needed) ─────────────────────────

export function calculateBidHealthScore(
  factors: EstimateFactors,
  estimateTotal: number
): BidHealthScore {
  const flags: string[] = [];

  // Client Risk (0-20, start at 20 and deduct)
  let client_risk = 20;
  if (factors.client_type === "new") { client_risk -= 8; flags.push("New client — payment history unknown"); }
  if (factors.client_type === "government") { client_risk -= 5; flags.push("Government client — slow payment risk"); }
  if (factors.payment_terms === "net60") { client_risk -= 6; flags.push("Net 60 payment terms — cash flow risk"); }
  else if (factors.payment_terms === "net30") { client_risk -= 3; }
  if (factors.payment_terms === "upfront") { client_risk += 3; } // bonus
  client_risk = Math.max(0, Math.min(20, client_risk));

  // Location Risk (0-15)
  let location_risk = 15;
  if (factors.distance_km > 80) { location_risk -= 10; flags.push("Remote location — high logistics cost"); }
  else if (factors.distance_km > 40) { location_risk -= 6; flags.push("Distant project — elevated logistics cost"); }
  else if (factors.distance_km > 20) { location_risk -= 3; }
  location_risk = Math.max(0, Math.min(15, location_risk));

  // Material Risk (0-15)
  let material_risk = 15;
  if (factors.high_material_volatility) { material_risk -= 8; flags.push("High material price volatility"); }
  if (factors.long_material_lead_time) { material_risk -= 5; flags.push("Long material lead times"); }
  material_risk = Math.max(0, Math.min(15, material_risk));

  // Weather Risk (0-15)
  let weather_risk = 15;
  if (factors.rainfall_season) { weather_risk -= 8; flags.push("Rainfall season — schedule delays likely"); }
  if (factors.weather_risk === "high") { weather_risk -= 6; flags.push("High weather exposure"); }
  else if (factors.weather_risk === "moderate") { weather_risk -= 3; }
  weather_risk = Math.max(0, Math.min(15, weather_risk));

  // Labor Risk (0-10)
  let labor_risk = 10;
  if (factors.labor_scarce) { labor_risk -= 7; flags.push("Labor scarcity in project area"); }
  labor_risk = Math.max(0, Math.min(10, labor_risk));

  // Schedule Risk (0-10)
  let schedule_risk = 10;
  if (factors.project_complexity === "high") { schedule_risk -= 6; flags.push("High project complexity"); }
  else if (factors.project_complexity === "medium") { schedule_risk -= 3; }
  schedule_risk = Math.max(0, Math.min(10, schedule_risk));

  // Cash Flow Risk (0-10)
  let cashflow_risk = 10;
  if (estimateTotal > 50000000) { cashflow_risk -= 4; flags.push("High value project — capital requirement"); }
  if (factors.payment_terms === "net60") { cashflow_risk -= 4; }
  cashflow_risk = Math.max(0, Math.min(10, cashflow_risk));

  // Complexity (0-5)
  let complexity_risk = 5;
  if (factors.project_type === "infrastructure") { complexity_risk -= 3; flags.push("Infrastructure project — high complexity"); }
  if (factors.project_complexity === "high") { complexity_risk -= 2; }
  complexity_risk = Math.max(0, Math.min(5, complexity_risk));

  const overall = client_risk + location_risk + material_risk + weather_risk +
    labor_risk + schedule_risk + cashflow_risk + complexity_risk;

  const risk_level =
    overall >= 80 ? "low" :
    overall >= 60 ? "medium" :
    overall >= 40 ? "high" : "critical";

  return {
    overall,
    risk_level,
    breakdown: {
      client_risk, location_risk, material_risk, weather_risk,
      labor_risk, schedule_risk, cashflow_risk, complexity_risk
    },
    risk_flags: flags
  };
}

// ─── Markup Recommendation (calls Claude) ────────────────────────────────────

export async function getMarkupRecommendation(
  factors: EstimateFactors,
  bidHealth: BidHealthScore,
  estimateTotal: number,
  historicalContext?: string
): Promise<MarkupRecommendation> {
  try {
    const prompt = `You are an expert construction estimator in Jamaica. Recommend a markup percentage for this bid.

BID DETAILS:
- Estimate Total (before markup): JMD ${estimateTotal.toLocaleString()}
- Project Type: ${factors.project_type || "General construction"}
- Client Type: ${factors.client_type || "Unknown"}
- Payment Terms: ${factors.payment_terms || "Unknown"}
- Project Complexity: ${factors.project_complexity || "Medium"}
- Distance from office: ${factors.distance_km || 0}km
- Weather Risk: ${factors.weather_risk || "Low"}
- Rainfall Season: ${factors.rainfall_season ? "Yes" : "No"}
- Material Volatility: ${factors.high_material_volatility ? "High" : "Normal"}
- Labor Availability: ${factors.labor_scarce ? "Scarce" : "Available"}
- Long Material Lead Times: ${factors.long_material_lead_time ? "Yes" : "No"}

BID HEALTH SCORE: ${bidHealth.overall}/100 (${bidHealth.risk_level} risk)
RISK FLAGS: ${bidHealth.risk_flags.join(", ") || "None"}

${historicalContext ? `COMPANY HISTORICAL DATA:\n${historicalContext}` : ""}

Respond in JSON only, no other text:
{
  "range_low": <number, minimum markup %>,
  "range_high": <number, maximum markup %>,
  "suggested": <number, single recommended markup %>,
  "reasoning": [<string>, <string>, <string>]
}`;

    const response = await magnusAI.chat(prompt);
    const clean = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      range_low: parsed.range_low || 20,
      range_high: parsed.range_high || 35,
      suggested: parsed.suggested || 28,
      reasoning: parsed.reasoning || ["Based on project conditions"],
      ai_powered: true
    };
  } catch {
    // Fallback: rule-based markup if AI fails
    const base = 25;
    const riskAdder = bidHealth.overall < 60 ? 8 : bidHealth.overall < 80 ? 4 : 0;
    const suggested = base + riskAdder;
    return {
      range_low: suggested - 5,
      range_high: suggested + 8,
      suggested,
      reasoning: ["Based on project risk profile", "AI unavailable — using rule-based estimate"],
      ai_powered: false
    };
  }
}

// ─── Duration Estimate (calls Claude) ────────────────────────────────────────

export async function getDurationEstimate(
  factors: EstimateFactors,
  estimateTotal: number,
  itemCount: number
): Promise<DurationEstimate> {
  try {
    const prompt = `You are an expert construction scheduler in Jamaica. Estimate project duration.

PROJECT DETAILS:
- Project Type: ${factors.project_type || "General construction"}
- Estimate Value: JMD ${estimateTotal.toLocaleString()}
- Number of line items in BOQ: ${itemCount}
- Complexity: ${factors.project_complexity || "Medium"}
- Labor Availability: ${factors.labor_scarce ? "Scarce" : "Available"}
- Material Lead Times: ${factors.long_material_lead_time ? "Long" : "Normal"}
- Rainfall Season: ${factors.rainfall_season ? "Yes" : "No"}
- Weather Risk: ${factors.weather_risk || "Low"}

Respond in JSON only, no other text:
{
  "total_weeks": <number>,
  "breakdown": [
    { "phase": "<phase name>", "weeks": <number> }
  ],
  "risk_factors": [<string>, <string>]
}`;

    const response = await magnusAI.chat(prompt);
    const clean = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      total_weeks: parsed.total_weeks || 8,
      breakdown: parsed.breakdown || [{ phase: "Construction", weeks: 8 }],
      risk_factors: parsed.risk_factors || [],
      ai_powered: true
    };
  } catch {
    // Fallback rule-based duration
    const baseWeeks = estimateTotal > 50000000 ? 16 : estimateTotal > 20000000 ? 10 : 6;
    const riskWeeks = factors.rainfall_season ? 2 : 0;
    return {
      total_weeks: baseWeeks + riskWeeks,
      breakdown: [{ phase: "Construction", weeks: baseWeeks + riskWeeks }],
      risk_factors: factors.rainfall_season ? ["Rainfall season may cause delays"] : [],
      ai_powered: false
    };
  }
}

// ─── Full Analysis (combines all three) ──────────────────────────────────────

export async function runEstimateIntelligence(
  factors: EstimateFactors,
  estimateTotal: number,
  itemCount: number,
  companyId: string
): Promise<EstimateIntelligenceResult> {
  // 1. Bid Health Score (instant, no AI)
  const bid_health = calculateBidHealthScore(factors, estimateTotal);

  // 2. Fetch historical context for this company
  let historicalContext = "";
  try {
    const { data: actuals } = await supabase
      .from("project_actuals")
      .select("project_type, actual_markup_pct, actual_cost, estimated_cost, was_profitable")
      .eq("company_id", companyId)
      .limit(20);

    if (actuals && actuals.length > 0) {
      const byType: Record<string, number[]> = {};
      actuals.forEach(a => {
        if (a.project_type && a.actual_markup_pct) {
          if (!byType[a.project_type]) byType[a.project_type] = [];
          byType[a.project_type].push(a.actual_markup_pct);
        }
      });
      const lines = Object.entries(byType).map(([type, markups]) => {
        const avg = markups.reduce((a, b) => a + b, 0) / markups.length;
        return `${type}: avg markup ${avg.toFixed(1)}% (${markups.length} projects)`;
      });
      if (lines.length > 0) {
        historicalContext = "Company historical averages:\n" + lines.join("\n");
      }
    }
  } catch { /* historical context optional */ }

  // 3. Markup + Duration (parallel AI calls)
  const [markup, duration] = await Promise.all([
    getMarkupRecommendation(factors, bid_health, estimateTotal, historicalContext),
    getDurationEstimate(factors, estimateTotal, itemCount)
  ]);

  // 4. Profit estimates
  const estimated_profit_at_suggested = estimateTotal * (markup.suggested / 100);
  const estimated_profit_at_low = estimateTotal * (markup.range_low / 100);

  return {
    bid_health,
    markup,
    duration,
    estimated_profit_at_suggested,
    estimated_profit_at_low,
    key_risks: bid_health.risk_flags.slice(0, 5),
    generated_at: new Date().toISOString()
  };
}

// ─── Save result to estimate_headers ─────────────────────────────────────────

export async function saveEstimateIntelligence(
  estimateId: string,
  result: EstimateIntelligenceResult,
  appliedMarkup?: number
) {
  await supabase.from("estimate_headers").update({
    bid_health_score: result.bid_health.overall,
    markup_suggested: result.markup.suggested,
    markup_applied: appliedMarkup ?? null,
    markup_reasoning: result.markup.reasoning,
    duration_estimated_weeks: result.duration.total_weeks,
    ai_analysis: result as any,
    ai_generated_at: result.generated_at
  }).eq("id", estimateId);
}