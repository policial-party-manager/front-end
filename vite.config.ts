import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
  server: {
    proxy: {
      // 开发环境将 /api 转发到本地后端
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
});
