/** Default Pro included credit (FORMA_PRO_USAGE_ALLOWANCE_USD). */
export const PRO_INCLUDED_CREDIT_USD = 30;
/** Pro+ included credit — 2× Pro. */
export const PRO_PLUS_INCLUDED_CREDIT_USD = PRO_INCLUDED_CREDIT_USD * 2;
/** Siège Meetra : 15 $ US. Le crédit IA par siège reste sous ce prix (marge + frais). */
export const SEAT_PRICE_USD = 15;
export const SEAT_PRICE_CENTS = 1500;
/** Crédit IA retail inclus par siège. Coût fournisseur ≈ crédit / 1,333, donc sous 15 $. */
export const SEAT_INCLUDED_CREDIT_USD = 10;
/** Default Team credit per seat (FORMA_ENTERPRISE_USAGE_ALLOWANCE_USD_PER_SEAT). */
export const TEAM_INCLUDED_CREDIT_PER_SEAT_USD = SEAT_INCLUDED_CREDIT_USD;

export type SubscriptionPlan = "free" | "pro";
export type WorkspaceEnterprisePlan = "free" | "enterprise";
export type PlanCatalogId = "pro" | "proPlus" | "team";
