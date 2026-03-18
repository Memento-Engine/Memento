import { getSkills, Skill } from "../skills";
import { getToolRegistry } from "../tools/registry";

/*
============================================================
SKILL & TOOL CONTEXT BUILDER
============================================================

Builds a consolidated context string describing all available
skills and tools for the planner LLM. This allows the planner
to make informed decisions about which capabilities to use.
============================================================
*/

export interface SkillSummary {
  name: string;
  description: string;
  tools: string[];
  whenToUse: string;
}

export interface ToolSummary {
  name: string;
  description: string;
}

/**
 * Extract "When to Use" section from skill content.
 */
function extractWhenToUse(content: string): string {
  const match = content.match(/## When to Use\n([\s\S]*?)(?=\n##|$)/);
  if (match) {
    return match[1]
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("-"))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .slice(0, 4) // Limit to 4 use cases
      .join("; ");
  }
  return "";
}

/**
 * Build skill summaries from loaded skills.
 */
export function buildSkillSummaries(skills: Map<string, Skill>): SkillSummary[] {
  const summaries: SkillSummary[] = [];

  for (const [name, skill] of skills) {
    // Skip meta/internal skills
    if (name === "database-schema" || name === "skill-selection") {
      continue;
    }

    summaries.push({
      name: skill.metadata.name,
      description: skill.metadata.description,
      tools: skill.metadata.tools,
      whenToUse: extractWhenToUse(skill.content),
    });
  }

  return summaries;
}

/**
 * Build tool summaries from the registry.
 */
export async function buildToolSummaries(): Promise<ToolSummary[]> {
  const registry = await getToolRegistry();
  const tools = registry.list();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
  }));
}

/**
 * Format skills for the planner prompt.
 */
export function formatSkillsForPrompt(summaries: SkillSummary[]): string {
  const lines: string[] = [];

  for (const skill of summaries) {
    lines.push(`### ${skill.name}`);
    lines.push(`${skill.description}`);
    if (skill.tools.length > 0) {
      lines.push(`Tools: ${skill.tools.join(", ")}`);
    }
    if (skill.whenToUse) {
      lines.push(`Use when: ${skill.whenToUse}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format tools for the planner prompt.
 */
export function formatToolsForPrompt(summaries: ToolSummary[]): string {
  return summaries.map((t) => `- **${t.name}**: ${t.description}`).join("\n");
}

/**
 * Build complete context for the planner including all skills and tools.
 */
export async function buildPlannerContext(): Promise<{
  skillsContext: string;
  toolsContext: string;
  skillNames: string[];
  toolNames: string[];
}> {
  const skills = await getSkills();
  const skillSummaries = buildSkillSummaries(skills);
  const toolSummaries = await buildToolSummaries();

  return {
    skillsContext: formatSkillsForPrompt(skillSummaries),
    toolsContext: formatToolsForPrompt(toolSummaries),
    skillNames: skillSummaries.map((s) => s.name),
    toolNames: toolSummaries.map((t) => t.name),
  };
}

/**
 * Get the database schema for context.
 */
export async function getDatabaseSchemaContext(): Promise<string> {
  const skills = await getSkills();
  const schemaSkill = skills.get("database-schema");
  
  if (!schemaSkill) {
    return "";
  }

  // Extract just the table definitions (more concise for planning)
  const content = schemaSkill.content;
  const tablesMatch = content.match(/## Tables([\s\S]*?)(?=## Common|$)/);
  
  if (tablesMatch) {
    return tablesMatch[1].trim();
  }
  
  return content;
}
