module.exports = {
  parser: "@typescript-eslint/parser",

  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },

  plugins: ["@typescript-eslint"],

  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],

  env: {
    node: true,
    es2022: true,
  },

  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-unused-expressions": "off",

    "prefer-const": "off",
    "no-useless-escape": "off",
  },

  ignorePatterns: ["dist", "node_modules"],
};