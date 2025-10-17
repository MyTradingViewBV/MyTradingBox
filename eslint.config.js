const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const angularEslint = require("@angular-eslint/eslint-plugin");
const angularEslintTemplate = require("@angular-eslint/eslint-plugin-template");
const angularTemplateParser = require("@angular-eslint/template-parser");

module.exports = [
  // TypeScript rules for .ts files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.app.json", "tsconfig.spec.json"],
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "@angular-eslint": angularEslint,
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/no-empty-function": "error",
      "@typescript-eslint/no-empty-interface": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/no-var-requires": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/prefer-for-of": "error",
      "@typescript-eslint/member-ordering": "error",

      // Angular rules (add/remove as you wish)
      "@angular-eslint/component-class-suffix": [
        "error",
        { suffixes: ["Component", "View"] },
      ],
      "@angular-eslint/directive-class-suffix": [
        "error",
        { suffixes: ["Directive"] },
      ],
      "@angular-eslint/use-lifecycle-interface": "error",
      "@angular-eslint/no-input-rename": "error",
      "@angular-eslint/no-output-on-prefix": "error",
      "@angular-eslint/use-injectable-provided-in": "error",
      "@angular-eslint/no-output-native": "error",
    },
  },
  // Angular template rules for .html files
  {
    files: ["**/*.html"],
    languageOptions: {
      parser: angularTemplateParser,
    },
    plugins: {
      "@angular-eslint/template": angularEslintTemplate,
    },
    rules: {
      "@angular-eslint/template/banana-in-box": "error",
      "@angular-eslint/template/no-negated-async": "error",
      "@angular-eslint/template/eqeqeq": "error",
      //"@angular-eslint/template/no-call-expression": "error",
      "@angular-eslint/template/conditional-complexity": "error",
      "@angular-eslint/template/cyclomatic-complexity": [
        "error",
        { maxComplexity: 50 },
      ],
      // "@angular-eslint/template/no-any": "error",
    },
  },
];
