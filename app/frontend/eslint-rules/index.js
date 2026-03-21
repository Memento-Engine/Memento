/**
 * Custom ESLint Plugin: memento-rules
 * 
 * Contains custom rules for the Memento project to catch
 * common Windows deployment bugs at lint time.
 */

const noRawProcessEnvInvoke = require("./no-raw-process-env-invoke");

module.exports = {
  meta: {
    name: "eslint-plugin-memento",
    version: "1.0.0",
  },
  rules: {
    "no-raw-process-env-invoke": noRawProcessEnvInvoke,
  },
  configs: {
    recommended: {
      plugins: ["memento"],
      rules: {
        "memento/no-raw-process-env-invoke": "error",
      },
    },
  },
};
