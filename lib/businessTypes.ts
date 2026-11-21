// What kind of business this is. It tunes the AI and what the portal shows. "school" is switched on by Mira staff
// (it adds the school calendar and fee lookup); owners pick general or tech store when they sign up.
export type BusinessType = "general" | "tech_store" | "school";

export const SIGNUP_BUSINESS_TYPES: { value: Exclude<BusinessType, "school">; label: string; hint: string }[] = [
  { value: "general", label: "Something else", hint: "Fashion, beauty, food, services and more" },
  { value: "tech_store", label: "Tech store", hint: "Phones, laptops, gadgets and accessories" },
];

export const ALL_BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "general", label: "General business" },
  { value: "tech_store", label: "Tech store" },
  { value: "school", label: "School" },
];
