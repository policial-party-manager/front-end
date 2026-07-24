import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // 全局忽略文件，替代 .eslintignore
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "public/**",
      "*.d.ts",
      "vite.config.*",
      "src/assets/**",
    ],
  },

  // JS 官方基础推荐规则
  js.configs.recommended,

  // TS 官方推荐规则集
  ...tseslint.configs.recommended,

  // Vue3 扁平配置规则
  ...pluginVue.configs["flat/recommended"],

  // 关闭和 Prettier 冲突的规则
  eslintConfigPrettier,

  // 解析器、全局环境配置
  {
    languageOptions: {
      // 全局变量：浏览器 + node
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },

  // 自定义规则（业务常用宽松配置，可自行调整）
  {
    rules: {
      // TS 规则
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Vue 规则
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "warn",
      "vue/define-macros-order": "error",

      // JS 通用规则
      "no-console": process.env.NODE_ENV === "production" ? "error" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "warn",
      "no-unused-vars": "off", // 使用ts的未使用变量校验，关闭js原生
    },
  },
);
