export type ChatIntent =
  | "human_handoff"
  | "product_search"
  | "sizing_question"
  | "faq_question"
  | "model_question"
  | "greeting"
  | "general_chat";

export function classifyIntent(message: string): ChatIntent {
  const msg = message.toLowerCase().trim();

  // Explicit request for a human, checked before everything else so it
  // always wins regardless of what the rest of the message is about --
  // "I want to speak to a human about my order" should escalate, not
  // fall through to faq_question because of "order". Requires a
  // wanting/connecting verb directly next to the human-noun (not just
  // the word "human"/"person" anywhere in the message), so an identity
  // question like "are you human?" -- handled by model_question below --
  // or an unrelated sentence that happens to mention "someone" doesn't
  // false-positive into a handoff.
  if (
    /\b(speak|talk|chat)\s+(to|with)\s+(a |an )?(human|person|agent|representative|someone|somebody|real person|human being|manager|customer (service|care))\b/.test(msg) ||
    /\b(connect|transfer|put)\s+me\s+(through\s+)?(to|with)\s+(a |an )?(human|person|agent|representative|someone|manager|customer (service|care))\b/.test(msg) ||
    /\b(want|need)\s+(a |an )?(real )?(human|person|agent|representative)\b/.test(msg) ||
    /\b(i ?wan|make ?i|abeg)\s+(talk|speak|yarn)\s+(to|with)?\s*(person|human|agent|somebody|human being)\b/.test(msg)
  ) {
    return "human_handoff";
  }

  // Model questions, checked next (after the handoff check above) to avoid false matches
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
