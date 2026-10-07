/**
 * Phase 3 design-dashboard integration contract.
 *
 * This file is intentionally type-only with respect to application behavior: it
 * adds no route, database query, credential, or authorization path. The screen
 * map identifies existing production contracts and makes gaps explicit so a
 * design screen cannot silently fall back to mock fields or an invented API.
 *
 * IMPORTANT: "supported" means an existing server action/query has been
 * verified for the stated use; it does not grant that action new permissions.
 */

export type DashboardScreen =
  | "catalog"
  | "analytics"
  | "orders"
  | "faqs"
  | "hours"
  | "policies"
  | "promotions"
  | "settings";

export interface ScreenAdapterContract {
  readonly status: "partial" | "query-only" | "unsupported";
  readonly authorization: string;
  readonly supported: readonly string[];
  readonly unsupported: readonly string[];
  readonly sources: readonly string[];
  readonly databaseShape?: readonly string[];
}

/** Exact analytics query signature and result shape from lib/analytics/queries.ts. */
type AnalyticsQuery = typeof import("../analytics/queries")["getAnalyticsSnapshot"];
type AnalyticsQueryResult = Awaited<ReturnType<AnalyticsQuery>>;
export type AnalyticsSnapshot = NonNullable<AnalyticsQueryResult["data"]>;
export type AnalyticsRange = typeof import("../analytics/queries")["parseAnalyticsRange"] extends (
  value: string | undefined,
) => infer Range
  ? Range
  : never;

/** Types are derived from existing server actions; no runtime imports are made. */
type PortalOrderActions = typeof import("../../app/portal/(protected)/[businessId]/orders/actions");
export type CreateOrderInput = Parameters<PortalOrderActions["createOrder"]>[0];
export type UpdateOrderStatusArgs = Parameters<PortalOrderActions["updateOrderStatus"]>;
export type ListRecentConversationsArgs = Parameters<PortalOrderActions["listRecentConversations"]>;
export type RecentConversation = Awaited<ReturnType<PortalOrderActions["listRecentConversations"]>>[number];

type PortalSettingsActions = typeof import("../../app/portal/(protected)/[businessId]/settings/actions");
export type SavePromptDraftInput = Parameters<PortalSettingsActions["savePromptDraft"]>[0];
export type SaveAgentSettingsArgs = Parameters<PortalSettingsActions["saveAgentSettings"]>;
export type SaveOrderTakingArgs = Parameters<PortalSettingsActions["saveOrderTaking"]>;
export type SaveGroundingSettingsArgs = Parameters<PortalSettingsActions["saveGroundingSettings"]>;
export type PromotePromptReleaseArgs = Parameters<PortalSettingsActions["promotePromptRelease"]>;

/** Migration-backed row shapes; closed hours are represented by null times, not a DB `closed` column. */
export interface ProductDatabaseShape {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number | null;
  is_available: boolean;
  availability_note: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaqDatabaseShape {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessHoursDatabaseShape {
  id: string;
  business_id: string;
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
}

export interface PolicyDatabaseShape {
  id: string;
  business_id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromotionDatabaseShape {
  id: string;
  business_id: string;
  service_id: string | null;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OrderDatabaseShape {
  id: string;
  business_id: string;
  conversation_id: string | null;
  customer_identifier: string;
  status: "cart" | "placed" | "shipped" | "delivered" | "cancelled";
  total: number;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItemDatabaseShape {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
}

/**
 * Screen-by-screen source-of-truth map. Unavailable design fields and reads are
 * listed instead of being coerced into a similarly named production field.
 */
export const DESIGN_DASHBOARD_ADAPTER = {
  catalog: {
    status: "unsupported",
    authorization:
      "Product table RLS in migration 0005 is platform-admin-only. Admin product actions call getCurrentAdmin; the portal inventory assistant has an owner check but is not a verified owner CRUD/list contract under that RLS. Do not route design writes through it or a service-role client.",
    supported: [],
    unsupported: [
      "Design catalog list/filter and direct create/update/delete forms",
      "Product image upload/remove from a business-owner screen",
      "Category, categoryId, or other category fields (not in the verified product schema)",
      "Treating mock `available` / `stock` fields as DB columns: use `is_available` / `stock_quantity` only when a permitted real operation exists",
    ],
    sources: [
      "supabase/migrations/0005_products.sql (platform-admin-only RLS)",
      "app/admin/(protected)/businesses/[businessId]/products/actions.ts (getCurrentAdmin)",
      "app/portal/(protected)/[businessId]/inventory/actions.ts (owner-scoped assistant; not promoted here to direct CRUD)",
    ],
    databaseShape: [
      "products: id, business_id, name, description, price, stock_quantity, is_available, availability_note, created_at, updated_at; image_url is used by the existing admin image actions",
      "No category/categoryId column is declared in the verified product migration",
    ],
  },
  analytics: {
    status: "query-only",
    authorization:
      "Reuse only the existing server query and its authenticated Supabase client/RLS. This contract adds no query or broader scope; keep businessId set for business analytics and do not use a platform-wide null scope in an owner dashboard.",
    supported: ["lib/analytics/queries.ts:getAnalyticsSnapshot(businessId, requestedRange)"],
    unsupported: ["New direct database reads or platform-wide analytics from a business dashboard"],
    sources: ["lib/analytics/queries.ts", "app/admin/(protected)/businesses/[businessId]/analytics/page.tsx"],
    databaseShape: ["Typed result is exported as AnalyticsSnapshot from the existing query; it includes the exact snapshot fields, not design mock metrics"],
  },
  orders: {
    status: "partial",
    authorization:
      "Existing portal order actions verify the signed-in user's business membership before create/status updates; keep using those actions. The current page's order-list read is a server-component query under the existing RLS and is not re-exported as a new owner action here.",
    supported: [
      "createOrder(input) with input typed from the existing portal action",
      "updateOrderStatus(businessId, orderId, status) with arguments typed from the existing portal action",
      "listRecentConversations(businessId) for the existing customer/conversation picker",
    ],
    unsupported: ["A new listOrders API/action; retain the existing page read until safely extracted with identical auth and RLS"],
    sources: [
      "app/portal/(protected)/[businessId]/orders/actions.ts",
      "app/portal/(protected)/[businessId]/orders/page.tsx",
      "supabase/migrations/0015_orders.sql",
    ],
    databaseShape: [
      "orders: id, business_id, conversation_id, customer_identifier, status, total, status_changed_at, created_at, updated_at",
      "order_items: id, order_id, product_id, name, quantity, unit_price",
      "Statuses: cart, placed, shipped, delivered, cancelled",
    ],
  },
  faqs: {
    status: "unsupported",
    authorization: "Existing FAQ mutations are platform-admin actions and FAQ RLS is platform-admin-only; no owner-scoped FAQ action is verified.",
    supported: [],
    unsupported: ["Owner FAQ list/create/update/delete; do not call the admin actions from a business-owner design screen"],
    sources: [
      "app/admin/(protected)/businesses/[businessId]/faqs/actions.ts",
      "supabase/migrations/0002_knowledge_model.sql",
    ],
    databaseShape: ["faqs: id, business_id, question, answer, is_active, created_at, updated_at"],
  },
  hours: {
    status: "unsupported",
    authorization: "Existing saveHours is a platform-admin action and business_hours RLS is platform-admin-only; no owner-scoped hours action is verified.",
    supported: [],
    unsupported: ["Owner hours read/write; do not call the admin action or add an owner DB write"],
    sources: [
      "app/admin/(protected)/businesses/[businessId]/hours/actions.ts",
      "supabase/migrations/0002_knowledge_model.sql",
    ],
    databaseShape: ["business_hours: id, business_id, day_of_week, opens_at, closes_at; closed days have null times, not a `closed` column"],
  },
  policies: {
    status: "unsupported",
    authorization: "Existing policy mutations are platform-admin actions and policies RLS is platform-admin-only; no owner-scoped policy action is verified.",
    supported: [],
    unsupported: ["Owner policies list/create/update/delete; do not call the admin actions from a business-owner design screen"],
    sources: [
      "app/admin/(protected)/businesses/[businessId]/policies/actions.ts",
      "supabase/migrations/0002_knowledge_model.sql",
    ],
    databaseShape: ["policies: id, business_id, title, content, is_active, created_at, updated_at"],
  },
  promotions: {
    status: "unsupported",
    authorization: "Existing promotion mutations are platform-admin actions and promotions RLS is platform-admin-only; no owner-scoped promotion action is verified.",
    supported: [],
    unsupported: [
      "Owner promotions list/create/update/delete",
      "Design title, code, and discount fields: production promotions use description, service_id, starts_at, ends_at, and is_active",
    ],
    sources: [
      "app/admin/(protected)/businesses/[businessId]/promotions/actions.ts",
      "supabase/migrations/0002_knowledge_model.sql",
    ],
    databaseShape: ["promotions: id, business_id, service_id, description, starts_at, ends_at, is_active, created_at"],
  },
  settings: {
    status: "partial",
    authorization:
      "Use only the existing portal settings actions; those check business membership and apply owner-only checks to high-impact settings. The admin updateBusiness action is not an owner API.",
    supported: [
      "savePromptDraft(input)",
      "promotePromptRelease(businessId, releaseId)",
      "saveAgentSettings(businessId, enabled, provider)",
      "saveOrderTaking(businessId, enabled)",
      "saveGroundingSettings(businessId, reviewLevel, escalateRepeat)",
    ],
    unsupported: [
      "Owner business profile update via admin updateBusiness",
      "Design-only industry, city, brandColor, and greeting fields unless verified against a real owner action and schema",
    ],
    sources: [
      "app/portal/(protected)/[businessId]/settings/actions.ts",
      "app/admin/(protected)/businesses/[businessId]/settings/actions.ts (admin-only updateBusiness)",
    ],
  },
} as const satisfies Record<DashboardScreen, ScreenAdapterContract>;
