/**
 * System requirements API for onboarding
 * Checks if the system meets requirements for Memento to run.
 */

import { getBaseUrl } from "./base";

/**
 * Individual requirement check result
 */
export interface RequirementCheck {
  name: string;
  passed: boolean;
  message: string;
  fix_suggestion: string | null;
}

/**
 * System requirements check response
 */
export interface SystemRequirementsResponse {
  /** Whether all requirements are met */
  all_passed: boolean;
  /** Individual check results */
  checks: RequirementCheck[];
  /** Summary message */
  summary: string;
}

/**
 * Check system requirements (Windows version, OCR, ONNX runtime)
 */
export async function checkSystemRequirements(): Promise<SystemRequirementsResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/system/check`);
  
  if (!response.ok) {
    throw new Error(`Failed to check system requirements: ${response.statusText}`);
  }
  
  return response.json();
}
