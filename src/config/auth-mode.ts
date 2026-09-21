import type { Role } from "@/config/permissions";

export function shouldRedirectToLogin(devSkipLogin: boolean, isPublicRoute: boolean, isLoggedIn: boolean): boolean {
  return !devSkipLogin && !isPublicRoute && !isLoggedIn;
}

export function shouldSkipUnauthorizedRefresh(devSkipLogin: boolean, hasAccessToken: boolean): boolean {
  return devSkipLogin && !hasAccessToken;
}

export function canSwitchPreviewRole(devSkipLogin: boolean, hasAccessToken: boolean): boolean {
  return devSkipLogin && !hasAccessToken;
}

export function getFallbackRole(devSkipLogin: boolean, hasAccessToken: boolean): Role {
  return devSkipLogin && !hasAccessToken ? "super_admin" : "party_member";
}
