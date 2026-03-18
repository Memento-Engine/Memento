import fs from "fs/promises";
import path from "path";
import { Skill, SkillMetadata } from "./types";
import { getLogger } from "../utils/logger";

/**
 * Parse YAML-like frontmatter from markdown content.
 */
function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, frontmatterStr, body] = match;
  const metadata: Record<string, string> = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return { metadata, body };
}

/**
 * Parse a skill file into a Skill object.
 */
export function parseSkillFile(content: string, filePath: string): Skill {
  const { metadata: raw, body } = parseFrontmatter(content);

  const metadata: SkillMetadata = {
    name: raw.name || path.basename(filePath, ".skill.md"),
    description: raw.description || "",
    tools: raw.tools ? raw.tools.split(",").map((t) => t.trim()) : [],
  };

  return {
    metadata,
    content: body.trim(),
    filePath,
  };
}

/**
 * Load all skills from the skills directory.
 */
export async function loadSkills(skillsDir?: string): Promise<Map<string, Skill>> {
  const logger = await getLogger();
  const dir = skillsDir || path.join(__dirname);
  const skills = new Map<string, Skill>();

  try {
    const files = await fs.readdir(dir);
    const skillFiles = files.filter((f) => f.endsWith(".skill.md"));

    for (const file of skillFiles) {
      const filePath = path.join(dir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const skill = parseSkillFile(content, filePath);
      skills.set(skill.metadata.name, skill);
      logger.debug(`Loaded skill: ${skill.metadata.name}`);
    }

    logger.info(`Loaded ${skills.size} skills from ${dir}`);
  } catch (error) {
    logger.error(`Failed to load skills: ${error instanceof Error ? error.message : String(error)}`);
  }

  return skills;
}

/**
 * Get the database schema skill content.
 * This should be prepended to any SQL generation prompt.
 */
export async function getSchemaSkill(skillsDir?: string): Promise<string | null> {
  const skills = await loadSkills(skillsDir);
  const schemaSkill = skills.get("database-schema");
  return schemaSkill?.content || null;
}

/**
 * Build a context string from selected skills for LLM prompts.
 */
export function buildSkillContext(skills: Map<string, Skill>, selectedSkills: string[]): string {
  const parts: string[] = [];

  // Always include schema first
  const schemaSkill = skills.get("database-schema");
  if (schemaSkill) {
    parts.push("## Database Schema\n" + schemaSkill.content);
  }

  // Add selected skills
  for (const skillName of selectedSkills) {
    const skill = skills.get(skillName);
    if (skill && skill.metadata.name !== "database-schema") {
      parts.push(`## Skill: ${skill.metadata.name}\n${skill.content}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

// Singleton cache for skills
let skillsCache: Map<string, Skill> | null = null;

/**
 * Get cached skills or load them.
 */
export async function getSkills(skillsDir?: string): Promise<Map<string, Skill>> {
  if (!skillsCache) {
    skillsCache = await loadSkills(skillsDir);
  }
  return skillsCache;
}

/**
 * Clear the skills cache (useful for testing or hot reload).
 */
export function clearSkillsCache(): void {
  skillsCache = null;
}
