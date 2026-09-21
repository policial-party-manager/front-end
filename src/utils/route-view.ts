import type { Role } from "@/config/permissions";
import type { RouteLocationNormalizedLoaded } from "vue-router";

/** 页面在路由路径或角色变化时重新创建；query/hash 变化保留页面状态。 */
export function getRouteViewKey(route: Pick<RouteLocationNormalizedLoaded, "path">, role: Role): string {
  return `${route.path}:${role}`;
}
