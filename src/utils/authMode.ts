/** 仅用于开发环境的页面预览，不替代后端鉴权。 */
export const isDevSkipLoginEnabled = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === "true";
