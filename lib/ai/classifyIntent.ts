export type ChatIntent =
  | "human_handoff"
  | "prompt_injection"
  | "product_search"
  | "sizing_question"
  | "faq_question"
  | "model_question"
  | "greeting"
  | "general_chat";

export function classifyIntent(message: string): ChatIntent {
  const msg = message.toLowerCase().trim();

  // 1. Explicit request for a human (checked first so escalations always take priority)
  if (
    /\b(speak|talk|chat)\s+(to|with)\s+(a |an )?(human|person|agent|representative|someone|somebody|real person|human being|manager|customer (service|care))\b/.test(msg) ||
    /\b(connect|transfer|put)\s+me\s+(through\s+)?(to|with)\s+(a |an )?(human|person|agent|representative|someone|manager|customer (service|care))\b/.test(msg) ||
    /\b(want|need)\s+(a |an )?(real )?(human|person|agent|representative)\b/.test(msg) ||
    /\b(i ?wan|make ?i|abeg)\s+(talk|speak|yarn)\s+(to|with)?\s*(person|human|agent|somebody|human being)\b/.test(msg)
  ) {
    return "human_handoff";
  }

  // 2. Prompt injection, role override, or system prompt extraction attempts
  if (
    /\b(ignore (all |your |previous )?(instructions|prompts|rules)|reveal (your |the )?(system prompt|instructions|system instructions)|repeat (the |all )?(above|system)|system prompt|developer mode|dan mode|jailbreak|disregard previous|override (system|rules|instructions)|pretend to be|act as (a|an)?)\b/.test(msg) ||
    /\b(what (are|were) your (initial|original|system) (instructions|prompt))\b/.test(msg)
  ) {
    return "prompt_injection";
  }

  // 3. Model questions (checked next to distinguish identity questions from handoffs)
  if (/\b(are you (an? )?(ai|robot|bot|human|real)|what (ai )?model|who are you|what are you|chatgpt|gemini|gpt|llm)\b/.test(msg)) {
    return "model_question";
  }

  // 4. Sizing questions
  if (/\b(it|this|that|the|one)\b.*\b(small|medium|large|xl|xxl|size|fit)\b/.test(msg) || /\b(what sizes?|do you have.*size|available.*size|size.*available)\b/.test(msg)) {
    return "sizing_question";
  }

  // 5. FAQ patterns
  if (/\b(how (do|can|to|much)|delivery|deliver|return|refund|payment|pay|order|location|address|hours?\b|open|closed|policy|warranty|guarantee)\b/.test(msg)) {
    return "faq_question";
  }

  // 6. Product search
  if (/\b(dress|shoe|heel|bag|gown|top|skirt|trouser|sandal|accessory|jewel|watch|outfit)\b/.test(msg) || /\b(red|blue|black|white|green|yellow|pink|purple|gold|silver|brown)\b/.test(msg) || /\b(under |less than |cheap|affordable|budget|₦)\b/.test(msg) || /\b(show me|looking for|i need|i want|get me|recommend|suggest|catalogue|products?)\b/.test(msg)) {
    return "product_search";
  }

  // 7. Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b/.test(msg)) {
    return "greeting";
  }

  return "general_chat";
}
