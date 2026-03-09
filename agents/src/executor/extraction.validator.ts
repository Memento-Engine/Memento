import { getLogger, logger } from "../utils/logger";
import { DatabaseQuery, PlannerStep } from "../planner/planner.schema";
import { PLACEHOLDER_REGEX, ValidState } from "../planner/planner.validator";
import _ from "lodash";
import { ExecutorError, ErrorCode } from "../types/errors";

/**
 * Validate step output against expected type schema.
 * Returns validation result with detailed error message if invalid.
 */
export function validateStepOutput(
  step: PlannerStep,
  result: any,
): ValidState<string> {
  const type = step.expectedOutput.type;

  if (type === "value") {
    const isValid =
      typeof result === "string" ||
      typeof result === "number" ||
      typeof result === "boolean" ||
      result === null;

    if (isValid) {
      return { valid: true, data: "Valid value output" };
    }

    return {
      valid: false,
      error: `Expected value type (string|number|boolean|null) but got ${typeof result}. Received: ${JSON.stringify(result).slice(0, 200)}`,
    };
  }

  if (type === "table") {
    if (Array.isArray(result) && result.every((r) => typeof r === "object")) {
      return { valid: true, data: "Valid table output" };
    }

    return {
      valid: false,
      error: `Expected table type (array of objects) but got ${
        Array.isArray(result) ? "array of non-objects" : typeof result
      }. Received: ${JSON.stringify(result).slice(0, 200)}`,
    };
  }

  if (type === "list") {
    if (Array.isArray(result)) {
      return { valid: true, data: "Valid list output" };
    }

    return {
      valid: false,
      error: `Expected list type (array) but got ${typeof result}. Received: ${JSON.stringify(result).slice(0, 200)}`,
    };
  }

  if (type === "object") {
    if (
      typeof result === "object" &&
      result !== null &&
      !Array.isArray(result)
    ) {
      return { valid: true, data: "Valid object output" };
    }

    logger.info("Object type validation failed", {
      isType: "object",
      resultType: typeof result,
      isNull: result === null,
      isArray: Array.isArray(result),
    }); // Detailed logging for debugging

    return {
      valid: false,
      error: `Expected object type but got ${
        Array.isArray(result) ? "array" : typeof result
      }. Received: ${JSON.stringify(result).slice(0, 200)}`,
    };
  }

  return {
    valid: false,
    error: `Unknown expected output type: ${type}`,
  };
}

/**
 * Resolve placeholder references in database query.
 * Replaces {{stepX.output}} with actual step results.
 * Throws if references are invalid or circular.
 */
export async function resolveDatabaseQuery(
  databaseQuery: DatabaseQuery,
  dependsOn: string[],
  stepResults: Record<string, any>,
): Promise<DatabaseQuery> {
  const logger = await getLogger();
  const query = _.cloneDeep(databaseQuery);

  function traverse(obj: any, path: string[] = []) {
    _.forOwn(obj, (value: any, key: any) => {
      const currentPath = [...path, String(key)];

      if (_.isString(value)) {
        const matches = [...value.matchAll(PLACEHOLDER_REGEX)];

        for (const match of matches) {
          const fullMatch = match[0]; // {{step1.output}}
          const stepId = match[1]; // step1

          // Validate reference exists in dependencies
          if (!dependsOn.includes(stepId)) {
            throw new ExecutorError(
              `Invalid placeholder reference: ${fullMatch} in ${currentPath.join(".")}`,
              {
                placeholder: fullMatch,
                stepId,
                availableDependencies: dependsOn,
              },
            );
          }

          // Validate result exists
          if (!(stepId in stepResults)) {
            throw new ExecutorError(
              `Missing result for dependency step: ${stepId}`,
              {
                stepId,
                missingDependency: true,
              },
            );
          }

          // Replace placeholder with actual value
          const replacementValue = stepResults[stepId];

          if (fullMatch === value) {
            // Entire value is the placeholder
            obj[key] = replacementValue;
          } else {
            // Partial replacement (should be rare in this context)
            obj[key] = value.replace(
              fullMatch,
              JSON.stringify(replacementValue),
            );
          }

          logger.debug("Placeholder resolved");
        }
      }

      if (_.isObject(value)) {
        traverse(value, currentPath);
      }
    });
  }

  try {
    traverse(query);
    return query;
  } catch (error) {
    if (error instanceof ExecutorError) {
      throw error;
    }
    throw new ExecutorError(
      `Failed to resolve database query placeholders: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
