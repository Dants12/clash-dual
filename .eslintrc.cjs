const path = require("node:path");

const resolveFromPackages = (request) => {
  const bases = [
    __dirname,
    path.join(__dirname, "client"),
    path.join(__dirname, "server"),
  ];

  for (const base of bases) {
    try {
      return require.resolve(request, { paths: [base] });
    } catch (error) {
      // Continue searching other package locations.
    }
  }

  return request;
};

module.exports = {
  root: true,
  env: {
    es2022: true,
  },
  parser: resolveFromPackages("@typescript-eslint/parser"),
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/stylistic",
    resolveFromPackages("eslint-config-prettier"),
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/array-type": "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/build/**",
  ],
  overrides: [
    {
      files: ["client/**/*.{ts,tsx,js,jsx}", "client/vite.config.ts"],
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      env: {
        browser: true,
      },
      plugins: ["react-hooks", "react-refresh"],
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-refresh/only-export-components": [
          "warn",
          {
            allowConstantExport: true,
          },
        ],
      },
    },
    {
      files: ["server/**/*.{ts,tsx,js}", "server/scripts/**/*.ts"],
      env: {
        node: true,
      },
    },
    {
      files: ["**/*.cjs"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
};
