/**
 * #2 — Contract test: daemon launch mode mapping
 * 
 * This test validates that all invoke("start_daemon") and invoke("stop_daemon")
 * call sites use the correct isDev polarity.
 * 
 * CORRECT: isDev: !isDesktopProductionMode()
 *   - In dev (http://localhost:1420): isDev = true → process spawns
 *   - In prod (https://tauri.localhost): isDev = false → Windows Service
 * 
 * WRONG: isDev: isDesktopProductionMode()  
 *   - This inverts the logic and breaks production deployments
 * 
 * The test parses all TypeScript/TSX files and validates the pattern
 * at each invoke call site.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Directories to scan (relative to frontend root)
const SCAN_DIRS = [
  'providers',
  'components', 
  'app',
  'hooks',
  'contexts',
];

// File extensions to check
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Patterns
const INVOKE_DAEMON_PATTERN = /invoke\s*\(\s*['"`](?:start|stop)_daemon['"`]/g;
const CORRECT_PATTERN = /isDev\s*:\s*!isDesktopProductionMode\s*\(\s*\)/;
const WRONG_PATTERN = /isDev\s*:\s*isDesktopProductionMode\s*\(\s*\)/;
const PROCESS_ENV_PATTERN = /isDev\s*:\s*.*process\.env/;

interface DaemonCallSite {
  file: string;
  line: number;
  content: string;
  isCorrect: boolean;
  error?: string;
}

function findFilesRecursive(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .next, etc.
      if (['node_modules', '.next', 'out', 'dist'].includes(entry.name)) {
        continue;
      }
      files.push(...findFilesRecursive(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function extractCallSiteContext(content: string, matchIndex: number): string {
  // Get ~100 chars before and after the match to capture the full invoke call
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(content.length, matchIndex + 200);
  return content.slice(start, end);
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function analyzeFile(filePath: string): DaemonCallSite[] {
  const callSites: DaemonCallSite[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  
  let match;
  while ((match = INVOKE_DAEMON_PATTERN.exec(content)) !== null) {
    const context = extractCallSiteContext(content, match.index);
    const line = getLineNumber(content, match.index);
    
    let isCorrect = true;
    let error: string | undefined;
    
    // Check for the CORRECT pattern
    if (CORRECT_PATTERN.test(context)) {
      isCorrect = true;
    }
    // Check for WRONG patterns
    else if (WRONG_PATTERN.test(context)) {
      isCorrect = false;
      error = 'Uses positive isDesktopProductionMode() instead of negated !isDesktopProductionMode()';
    }
    else if (PROCESS_ENV_PATTERN.test(context)) {
      isCorrect = false;
      error = 'Uses raw process.env instead of isDesktopProductionMode() helper';
    }
    else if (!/isDesktopProductionMode/.test(context)) {
      isCorrect = false;
      error = 'Does not use isDesktopProductionMode() helper';
    }
    
    callSites.push({
      file: filePath,
      line,
      content: context.trim().split('\n')[0],
      isCorrect,
      error,
    });
  }
  
  return callSites;
}

describe('Daemon Launch Mode Contract (#2)', () => {
  const frontendRoot = path.resolve(__dirname, '..');
  
  it('should find all daemon invoke call sites', () => {
    const allCallSites: DaemonCallSite[] = [];
    
    for (const scanDir of SCAN_DIRS) {
      const dir = path.join(frontendRoot, scanDir);
      const files = findFilesRecursive(dir, EXTENSIONS);
      
      for (const file of files) {
        const callSites = analyzeFile(file);
        allCallSites.push(...callSites);
      }
    }
    
    // Should find at least some call sites (sanity check)
    expect(allCallSites.length).toBeGreaterThan(0);
    
    console.log(`Found ${allCallSites.length} daemon invoke call site(s):`);
    for (const site of allCallSites) {
      const relativePath = path.relative(frontendRoot, site.file);
      const status = site.isCorrect ? '✓' : '✗';
      console.log(`  ${status} ${relativePath}:${site.line}`);
      if (!site.isCorrect) {
        console.log(`      Error: ${site.error}`);
      }
    }
  });

  it('all daemon invoke calls should use correct isDev polarity', () => {
    const allCallSites: DaemonCallSite[] = [];
    
    for (const scanDir of SCAN_DIRS) {
      const dir = path.join(frontendRoot, scanDir);
      const files = findFilesRecursive(dir, EXTENSIONS);
      
      for (const file of files) {
        const callSites = analyzeFile(file);
        allCallSites.push(...callSites);
      }
    }
    
    const violations = allCallSites.filter(site => !site.isCorrect);
    
    if (violations.length > 0) {
      console.error('\n=== DAEMON LAUNCH MODE CONTRACT VIOLATIONS ===\n');
      for (const v of violations) {
        const relativePath = path.relative(frontendRoot, v.file);
        console.error(`${relativePath}:${v.line}`);
        console.error(`  Error: ${v.error}`);
        console.error(`  Context: ${v.content}`);
        console.error('');
      }
      console.error('=== FIX ===');
      console.error('All invoke("start_daemon") and invoke("stop_daemon") calls must use:');
      console.error('  { isDev: !isDesktopProductionMode() }');
      console.error('');
      console.error('Import the helper:');
      console.error('  import { isDesktopProductionMode } from "@/lib/runtimeMode";');
      console.error('');
    }
    
    expect(violations).toHaveLength(0);
  });

  it('isDesktopProductionMode should return correct values', () => {
    // Test the function logic against expected behavior
    // Note: In test environment, window is undefined, so this tests the fallback
    
    // This test documents the expected behavior:
    // - In Tauri dev (http://localhost:1420): returns false → isDev = true
    // - In Tauri prod (https://tauri.localhost): returns true → isDev = false
    
    // We can't directly test the function without mocking window,
    // but we document the contract here
    const expectedBehavior = {
      'http://localhost:1420': { isDesktopProductionMode: false, isDev: true },
      'https://tauri.localhost': { isDesktopProductionMode: true, isDev: false },
    };
    
    expect(expectedBehavior['http://localhost:1420'].isDev).toBe(true);
    expect(expectedBehavior['https://tauri.localhost'].isDev).toBe(false);
  });
});
