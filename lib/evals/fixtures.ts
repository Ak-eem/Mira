import type { BusinessContext } from "@/lib/ai/buildContext";

// Two small, fully invented shops. The evals run the real prompt over these, so every price and policy a case relies on
// is written here in plain sight. Keep them realistic: Nigerian shops, naira, WhatsApp-style questions.

export type EvalFixture = { name: string; context: BusinessContext };

export const TECH_SHOP: EvalFixture = {
  name: "Demo Tech Hub",
  context: {
    found: true,
    business: { name: "Demo Tech Hub", currency: "NGN", ai_tone: "friendly and clear", ai_instructions: null, ai_order_taking: false, business_type: "tech_store" },
    products: [],
    contextText: [
      "BUSINESS: Demo Tech Hub is a phone and laptop shop in Computer Village, Ikeja, Lagos.",
      "CONTACT: WhatsApp +234 801 234 5678. Email sales@demotechhub.ng",
      "HOURS: Monday to Saturday 8:00 AM - 6:00 PM. Sunday closed.",
      "PRODUCTS:",
      "- iPhone 15 Pro 256GB - ₦1,450,000 - 3 in stock",
      "- Samsung Galaxy S24 Ultra - ₦1,300,000 - 2 in stock",
      "- Tecno Camon 30 - ₦285,000 - 10 in stock",
      "- HP Pavilion 15 laptop, 16GB RAM, 512GB SSD - ₦720,000 - 4 in stock",
      "- AirPods Pro 2 - ₦230,000 - out of stock",
      "SERVICES: Screen replacement from ₦45,000. Battery replacement from ₦25,000. Repairs take 1 to 3 days.",
      "FAQS:",
      "Q: Do you deliver? A: Yes. Within Lagos delivery is ₦3,000. Outside Lagos we ship by waybill; the customer pays the waybill fee.",
      "Q: Can I pay on delivery? A: No. Payment is by bank transfer before dispatch.",
      "POLICIES:",
      "- Returns: faulty items can be returned within 7 days with the receipt. Opened items that are not faulty cannot be returned.",
      "- Phones come with a 6 month shop warranty against hardware faults.",
    ].join("\n"),
  },
};

export const FASHION_SHOP: EvalFixture = {
  name: "Demo Menswear",
  context: {
    found: true,
    business: { name: "Demo Menswear", currency: "NGN", ai_tone: "warm and professional", ai_instructions: null, ai_order_taking: false, business_type: "general" },
    products: [],
    contextText: [
      "BUSINESS: Demo Menswear sells men's shirts, suits and shoes online from Lagos.",
      "CONTACT: WhatsApp +234 802 000 1111. Instagram @demomenswear",
      "HOURS: Monday to Saturday 9:00 AM - 5:00 PM. Sunday closed.",
      "PRODUCTS:",
      "- Classic White Shirt (sizes S-XXL) - ₦19,500 - in stock",
      "- Navy Two-Piece Suit (sizes 38-46) - ₦79,500 - 5 in stock",
      "- Leather Oxford Shoes (sizes 40-45) - ₦45,000 - in stock",
      "- Polo Shirt (sizes S-6XL) - ₦15,000 - in stock",
      "FAQS:",
      "Q: Do you deliver? A: Yes, nationwide. Lagos delivery takes 1 to 2 days and costs ₦2,500. Other states take 3 to 5 days and cost ₦5,000.",
      "Q: Can I exchange a wrong size? A: Yes, within 7 days if the item is unworn with tags.",
      "POLICIES:",
      "- We do not do made-to-measure orders.",
      "- Payment is by bank transfer or card on our website.",
    ].join("\n"),
  },
};
