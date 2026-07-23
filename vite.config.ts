import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入党建红主色调变量
        additionalData: `$party-red: #C12C1F; $party-red-dark: #A01E1A; $party-red-light: #E84646;`,
      },
    },
  },
});
