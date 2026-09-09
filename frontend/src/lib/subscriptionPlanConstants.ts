/** Default Pro included credit (FORMA_PRO_USAGE_ALLOWANCE_USD). */
export const PRO_INCLUDED_CREDIT_USD = 30;
/** Pro+ included credit — 2× Pro. */
export const PRO_PLUS_INCLUDED_CREDIT_USD = PRO_INCLUDED_CREDIT_USD * 2;
/** Default Team credit per seat (FORMA_ENTERPRISE_USAGE_ALLOWANCE_USD_PER_SEAT). */
export const TEAM_INCLUDED_CREDIT_PER_SEAT_USD = 25;

export type SubscriptionPlan = "free" | "pro";
export type WorkspaceEnterprisePlan = "free" | "enterprise";
export type PlanCatalogId = "pro" | "proPlus" | "team";
