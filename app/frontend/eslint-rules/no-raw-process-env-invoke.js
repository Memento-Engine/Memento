/**
 * ESLint Rule: no-raw-process-env-invoke
 * 
 * #3 — Blocks direct process.env usage in Tauri invoke() payloads.
 * Forces use of the isDesktopProductionMode() helper from @/lib/runtimeMode.
 * 
 * BAD:
 *   invoke("start_daemon", { isDev: process.env.NODE_ENV !== "production" })
 *   invoke("stop_daemon", { isDev: !process.env.PROD })
 * 
 * GOOD:
 *   invoke("start_daemon", { isDev: !isDesktopProductionMode() })
 *   invoke("stop_daemon", { isDev: !isDesktopProductionMode() })
 * 
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw process.env in Tauri invoke() payloads",
      category: "Possible Errors",
      recommended: true,
      url: "https://github.com/your-repo/docs/rules/no-raw-process-env-invoke.md",
    },
    fixable: null, // Not auto-fixable - requires understanding context
    schema: [],
    messages: {
      noRawProcessEnv:
        "Do not use process.env directly in invoke() payloads. Use isDesktopProductionMode() from '@/lib/runtimeMode' instead. Pattern: isDev: !isDesktopProductionMode()",
      noRawNodeEnv:
        "Do not use NODE_ENV checks in invoke() payloads. Use isDesktopProductionMode() from '@/lib/runtimeMode' instead.",
    },
  },

  create(context) {
    // Track if we're inside an invoke() call
    let invokeCallDepth = 0;
    let inInvokePayload = false;

    /**
     * Check if a node is a call to invoke()
     */
    function isInvokeCall(node) {
      return (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "invoke"
      );
    }

    /**
     * Check if a node is a daemon-related invoke call
     */
    function isDaemonInvokeCall(node) {
      if (!isInvokeCall(node)) return false;
      
      const firstArg = node.arguments[0];
      if (!firstArg) return false;
      
      // Check for string literal "start_daemon" or "stop_daemon"
      if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
        return ["start_daemon", "stop_daemon"].includes(firstArg.value);
      }
      
      // Check for template literal
      if (firstArg.type === "TemplateLiteral" && firstArg.quasis.length === 1) {
        const value = firstArg.quasis[0].value.raw;
        return ["start_daemon", "stop_daemon"].includes(value);
      }
      
      return false;
    }

    /**
     * Check if a MemberExpression is process.env.*
     */
    function isProcessEnvAccess(node) {
      if (node.type !== "MemberExpression") return false;
      
      const obj = node.object;
      if (obj.type !== "MemberExpression") return false;
      
      // Check for process.env
      return (
        obj.object.type === "Identifier" &&
        obj.object.name === "process" &&
        obj.property.type === "Identifier" &&
        obj.property.name === "env"
      );
    }

    /**
     * Check if a node references NODE_ENV
     */
    function referencesNodeEnv(node) {
      const code = context.getSourceCode().getText(node);
      return /NODE_ENV|process\.env/.test(code);
    }

    return {
      // Enter invoke() call - track depth for nested calls
      CallExpression(node) {
        if (isDaemonInvokeCall(node)) {
          invokeCallDepth++;
          
          // Check the payload argument (second arg)
          const payloadArg = node.arguments[1];
          if (payloadArg) {
            inInvokePayload = true;
          }
        }
      },

      // Check for process.env access inside invoke payloads
      MemberExpression(node) {
        if (invokeCallDepth > 0 && isProcessEnvAccess(node)) {
          context.report({
            node,
            messageId: "noRawProcessEnv",
          });
        }
      },

      // Check for NODE_ENV checks in object properties of invoke payloads
      Property(node) {
        if (invokeCallDepth === 0) return;
        
        // Check if this is an isDev property
        if (
          node.key.type === "Identifier" &&
          node.key.name === "isDev" &&
          node.value
        ) {
          // Check if the value contains process.env or NODE_ENV
          const valueText = context.getSourceCode().getText(node.value);
          
          if (/process\.env/.test(valueText)) {
            context.report({
              node: node.value,
              messageId: "noRawProcessEnv",
            });
          } else if (/NODE_ENV/.test(valueText)) {
            context.report({
              node: node.value,
              messageId: "noRawNodeEnv",
            });
          }
        }
      },

      // Exit invoke() call
      "CallExpression:exit"(node) {
        if (isDaemonInvokeCall(node)) {
          invokeCallDepth--;
          if (invokeCallDepth === 0) {
            inInvokePayload = false;
          }
        }
      },
    };
  },
};
