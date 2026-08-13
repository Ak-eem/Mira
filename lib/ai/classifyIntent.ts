export type ChatIntent =
  | "product_search"
  | "sizing_question"
  | "faq_question"
  | "model_question"
  | "greeting"
  | "general_chat";

export function classifyIntent(message: string): ChatIntent {
  const msg = message.toLowerCase().trim();

  // Model questions, check first to avoid false matches
  if (/\b(are you (an? )?(ai|robot|bot|human|real)|what (ai )?model|who are you|what are you|chatgpt|gemini|gpt|llm)\b/.test(msg)) {
    return "model_question";
  }

  // Sizing, pronouns + size words, or direct size queries
  if (/\b(it|this|that|the|one)\b.*\b(small|medium|large|xl|xxl|size|fit)\b/.test(msg) || /\b(what sizes?|do you have.*size|available.*size|size.*available)\b/.test(msg)) {
    return "sizing_question";
  }

  // FAQ patterns
  if (/\b(how (do|can|to|much)|delivery|deliver|return|refund|payment|pay|order|location|address|hours?\b|open|closed|policy|warranty|guarantee)\b/.test(msg)) {
    return "faq_question";
  }

  // Product search, mentions product categories, colours prices
  if (/\b(dress|shoe|heel|bag|gown|top|skirt|trouser|sandal|accessory|jewel|watch|outfit)\b/.test(msg) || /\b(red|blue|black|white|green|yellow|pink|purple|gold|silver|brown)\b/.test(msg) || /\b(under |less than |cheap|affordable|budget|₦)\b/.test(msg) || /\b(show me|looking for|i need|i want|get me|recommend|suggest|catalogue|products?)\b/.test(msg)) {
    return "product_search";
  }

  // Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b/.test(msg)) {
    return "greeting";
  }

  return "general_chat";
}
