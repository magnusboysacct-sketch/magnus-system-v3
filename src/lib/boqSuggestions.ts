import { supabase } from "./supabase";

export interface BOQItem {
  id?: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  category?: string;
}

export interface BOQSuggestion {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  category: string;
  reason: string;
  confidence: number;
  relatedTo?: string[];
  isAssembly: boolean;
  assemblyItems?: BOQItem[];
}

export interface BOQContext {
  projectType?: string;
  existingItems: BOQItem[];
  existingCategories: string[];
  totalItems: number;
  hasMaterials: boolean;
  hasLabor: boolean;
  hasEquipment: boolean;
}

const COMMON_ITEM_RELATIONSHIPS = {
  blockwork: [
    { item: "cement", reason: "Required for mortar" },
    { item: "sand", reason: "Required for mortar" },
    { item: "mortar", reason: "For block laying" },
    { item: "plaster", reason: "Wall finishing" },
  ],
  concrete: [
    { item: "cement", reason: "Concrete ingredient" },
    { item: "sand", reason: "Concrete aggregate" },
    { item: "gravel", reason: "Concrete aggregate" },
    { item: "rebar", reason: "Reinforcement" },
    { item: "formwork", reason: "Concrete molds" },
  ],
  framing: [
    { item: "lumber", reason: "Framing material" },
    { item: "nails", reason: "Fasteners" },
    { item: "screws", reason: "Fasteners" },
    { item: "sheathing", reason: "Wall covering" },
  ],
  drywall: [
    { item: "drywall sheets", reason: "Wall material" },
    { item: "joint compound", reason: "Finishing" },
    { item: "tape", reason: "Joint finishing" },
    { item: "screws", reason: "Fasteners" },
  ],
  roofing: [
    { item: "shingles", reason: "Roof covering" },
    { item: "underlayment", reason: "Moisture barrier" },
    { item: "flashing", reason: "Water protection" },
    { item: "nails", reason: "Fasteners" },
  ],
  plumbing: [
    { item: "pipes", reason: "Water distribution" },
    { item: "fittings", reason: "Connections" },
    { item: "fixtures", reason: "Endpoints" },
    { item: "sealant", reason: "Waterproofing" },
  ],
  electrical: [
    { item: "wire", reason: "Power distribution" },
    { item: "conduit", reason: "Wire protection" },
    { item: "outlets", reason: "Power access" },
    { item: "switches", reason: "Control" },
    { item: "breakers", reason: "Safety" },
  ],
  painting: [
    { item: "primer", reason: "Surface preparation" },
    { item: "paint", reason: "Finish coat" },
    { item: "brushes", reason: "Application" },
    { item: "rollers", reason: "Application" },
  ],
};

const COMMON_STARTER_ITEMS = [
  {
    category: "Site Work",
    items: [
      { code: "SW-001", desc: "Site Clearance", unit: "sqm", confidence: 0.9 },
      { code: "SW-002", desc: "Excavation", unit: "cum", confidence: 0.8 },
      { code: "SW-003", desc: "Fill Material", unit: "cum", confidence: 0.7 },
    ],
  },
  {
    category: "Foundation",
    items: [
      { code: "FN-001", desc: "Concrete Foundation", unit: "cum", confidence: 0.9 },
      { code: "FN-002", desc: "Rebar", unit: "kg", confidence: 0.8 },
      { code: "FN-003", desc: "Formwork", unit: "sqm", confidence: 0.7 },
    ],
  },
  {
    category: "Structure",
    items: [
      { code: "ST-001", desc: "Concrete Columns", unit: "cum", confidence: 0.8 },
      { code: "ST-002", desc: "Concrete Beams", unit: "cum", confidence: 0.8 },
      { code: "ST-003", desc: "Concrete Slab", unit: "cum", confidence: 0.9 },
    ],
  },
  {
    category: "Masonry",
    items: [
      { code: "MS-001", desc: "Blockwork", unit: "sqm", confidence: 0.9 },
      { code: "MS-002", desc: "Plaster", unit: "sqm", confidence: 0.8 },
      { code: "MS-003", desc: "Mortar", unit: "cum", confidence: 0.7 },
    ],
  },
];

export async function detectBOQContext(boqItems: BOQItem[]): Promise<BOQContext> {
  const existingCategories = [...new Set(boqItems.map((item) => item.category).filter(Boolean))];

  const descriptions = boqItems.map((item) => item.description.toLowerCase()).join(" ");

  const hasMaterials = descriptions.includes("material") || descriptions.includes("supply");
  const hasLabor = descriptions.includes("labor") || descriptions.includes("install");
  const hasEquipment = descriptions.includes("equipment") || descriptions.includes("rental");

  let projectType: string | undefined;
  if (descriptions.includes("residential") || descriptions.includes("house")) {
    projectType = "residential";
  } else if (descriptions.includes("commercial") || descriptions.includes("office")) {
    projectType = "commercial";
  } else if (descriptions.includes("industrial")) {
    projectType = "industrial";
  }

  return {
    projectType,
    existingItems: boqItems,
    existingCategories: existingCategories as string[],
    totalItems: boqItems.length,
    hasMaterials,
    hasLabor,
    hasEquipment,
  };
}

export async function generateBOQSuggestions(context: BOQContext): Promise<BOQSuggestion[]> {
  const suggestions: BOQSuggestion[] = [];

  if (context.totalItems === 0) {
    return generateStarterSuggestions();
  }

  const relatedSuggestions = await generateRelatedItemSuggestions(context);
  suggestions.push(...relatedSuggestions);

  const missingSuggestions = await generateMissingCommonItems(context);
  suggestions.push(...missingSuggestions);

  const assemblySuggestions = await generateAssemblySuggestions(context);
  suggestions.push(...assemblySuggestions);

  return suggestions.slice(0, 10);
}

function generateStarterSuggestions(): BOQSuggestion[] {
  const suggestions: BOQSuggestion[] = [];

  for (const categoryGroup of COMMON_STARTER_ITEMS) {
    for (const item of categoryGroup.items) {
      suggestions.push({
        id: `starter-${item.code}`,
        item_code: item.code,
        description: item.desc,
        unit: item.unit,
        category: categoryGroup.category,
        reason: "Common starting item for new BOQ",
        confidence: item.confidence,
        isAssembly: false,
      });
    }
  }

  return suggestions.slice(0, 6);
}

async function generateRelatedItemSuggestions(context: BOQContext): Promise<BOQSuggestion[]> {
  const suggestions: BOQSuggestion[] = [];
  const existingDescriptions = context.existingItems.map((item) =>
    item.description.toLowerCase()
  );

  for (const [keyword, relatedItems] of Object.entries(COMMON_ITEM_RELATIONSHIPS)) {
    const hasKeyword = existingDescriptions.some((desc) => desc.includes(keyword));

    if (hasKeyword) {
      for (const related of relatedItems) {
        const alreadyExists = existingDescriptions.some((desc) =>
          desc.includes(related.item.toLowerCase())
        );

        if (!alreadyExists) {
          const unit = getDefaultUnit(related.item);
          suggestions.push({
            id: `related-${keyword}-${related.item}`,
            item_code: generateItemCode(related.item),
            description: capitalizeWords(related.item),
            unit,
            category: getCategoryForItem(related.item),
            reason: related.reason,
            confidence: 0.8,
            relatedTo: [keyword],
            isAssembly: false,
          });
        }
      }
    }
  }

  return suggestions;
}

async function generateMissingCommonItems(context: BOQContext): Promise<BOQSuggestion[]> {
  const suggestions: BOQSuggestion[] = [];

  if (context.totalItems > 5 && !context.hasMaterials) {
    suggestions.push({
      id: "missing-materials",
      item_code: "GEN-MAT",
      description: "General Materials",
      unit: "lot",
      category: "Materials",
      reason: "No material items detected in BOQ",
      confidence: 0.6,
      isAssembly: false,
    });
  }

  if (context.totalItems > 5 && !context.hasLabor) {
    suggestions.push({
      id: "missing-labor",
      item_code: "GEN-LAB",
      description: "Labor",
      unit: "hours",
      category: "Labor",
      reason: "No labor items detected in BOQ",
      confidence: 0.6,
      isAssembly: false,
    });
  }

  return suggestions;
}

async function generateAssemblySuggestions(context: BOQContext): Promise<BOQSuggestion[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return [];

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", user.user.id)
      .maybeSingle();

    if (!profile?.company_id) return [];

    const { data: assemblies } = await supabase
      .from("assemblies")
      .select("*")
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .limit(5);

    if (!assemblies || assemblies.length === 0) return [];

    const suggestions: BOQSuggestion[] = [];

    for (const assembly of assemblies) {
      const alreadyExists = context.existingItems.some(
        (item) => item.description.toLowerCase() === assembly.name.toLowerCase()
      );

      if (!alreadyExists) {
        const { data: items } = await supabase
          .from("assembly_items")
          .select("item_code, description, unit, quantity")
          .eq("assembly_id", assembly.id);

        const assemblyItems =
          items?.map((item) => ({
            ...item,
            rate: 0,
          })) || [];

        suggestions.push({
          id: `assembly-${assembly.id}`,
          item_code: assembly.code || "ASM-001",
          description: assembly.name,
          unit: assembly.unit || "each",
          category: assembly.category || "Assemblies",
          reason: "Pre-built assembly from your library",
          confidence: 0.7,
          isAssembly: true,
          assemblyItems,
        });
      }
    }

    return suggestions;
  } catch (error) {
    console.error("Error generating assembly suggestions:", error);
    return [];
  }
}

function getDefaultUnit(itemName: string): string {
  const name = itemName.toLowerCase();

  if (name.includes("cement") || name.includes("mortar")) return "bags";
  if (name.includes("sand") || name.includes("gravel") || name.includes("concrete")) return "cum";
  if (name.includes("rebar") || name.includes("steel")) return "kg";
  if (name.includes("lumber") || name.includes("wood")) return "bdft";
  if (name.includes("drywall") || name.includes("sheathing") || name.includes("plywood"))
    return "sheets";
  if (name.includes("paint") || name.includes("primer")) return "gallons";
  if (name.includes("wire") || name.includes("cable")) return "meters";
  if (name.includes("pipe")) return "meters";
  if (name.includes("nails") || name.includes("screws")) return "kg";

  return "each";
}

function generateItemCode(itemName: string): string {
  const words = itemName.split(" ");
  if (words.length === 1) {
    return words[0].substring(0, 3).toUpperCase() + "-001";
  }

  const code = words
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
    .substring(0, 3);
  return code + "-001";
}

function getCategoryForItem(itemName: string): string {
  const name = itemName.toLowerCase();

  if (name.includes("cement") || name.includes("sand") || name.includes("gravel")) {
    return "Materials";
  }
  if (name.includes("rebar") || name.includes("steel")) {
    return "Structure";
  }
  if (name.includes("lumber") || name.includes("framing")) {
    return "Framing";
  }
  if (name.includes("drywall") || name.includes("plaster")) {
    return "Finishes";
  }
  if (name.includes("paint") || name.includes("primer")) {
    return "Painting";
  }
  if (name.includes("pipe") || name.includes("plumbing")) {
    return "Plumbing";
  }
  if (name.includes("wire") || name.includes("electrical")) {
    return "Electrical";
  }
  if (name.includes("roof")) {
    return "Roofing";
  }

  return "General";
}

function capitalizeWords(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function addSuggestionToBOQ(
  suggestion: BOQSuggestion,
  boqHeaderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return { success: false, error: "Not authenticated" };
    }

    if (suggestion.isAssembly && suggestion.assemblyItems) {
      for (const item of suggestion.assemblyItems) {
        const { error } = await supabase.from("boq_items").insert({
          boq_header_id: boqHeaderId,
          item_code: item.item_code,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          rate: 0,
        });

        if (error) {
          console.error("Error adding assembly item:", error);
          return { success: false, error: error.message };
        }
      }
    } else {
      const { error } = await supabase.from("boq_items").insert({
        boq_header_id: boqHeaderId,
        item_code: suggestion.item_code,
        description: suggestion.description,
        unit: suggestion.unit,
        quantity: 1,
        rate: 0,
      });

      if (error) {
        console.error("Error adding suggestion:", error);
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error in addSuggestionToBOQ:", error);
    return { success: false, error: "Failed to add item" };
  }
}
