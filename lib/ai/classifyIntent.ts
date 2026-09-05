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

  // 1. Hard jailbreak / instruction-override / system-prompt-extraction attempts.
  // These are checked first, with no exceptions -- there's no legitimate
  // customer message that combines this kind of phrasing with a genuine
  // request, so nothing downstream is allowed to override this match.
  if (
    /\b(ignore (all |your |previous )*(instructions|prompts|rules)|reveal (your |the )?(system prompt|instructions|system instructions)|repeat (the |all )?(above|system)|system prompt|developer mode|dan mode|jailbreak|disregard previous|override (system|rules|instructions)|pretend to be|act as (a|an)?)\b/.test(msg) ||
    /\b(what (are|were) your (initial|original|system) (instructions|prompt))\b/.test(msg)
  ) {
    return "prompt_injection";
  }

  // 2. Explicit request for a human. Checked before the softer
  // database-enumeration patterns below so a genuine handoff request
  // ("connect me to a person") isn't misclassified as an attack just
  // because it happens to share a word with those patterns.
  if (
    /\b(speak|talk|chat)\s+(to|with)\s+(a |an )?(human|person|agent|representative|someone|somebody|real person|human being|manager|customer (service|care))\b/.test(msg) ||
    /\b(connect|transfer|put)\s+me\s+(through\s+)?(to|with)\s+(a |an )?(human|person|agent|representative|someone|manager|customer (service|care))\b/.test(msg) ||
    /\b(want|need)\s+(a |an )?(real )?(human|person|agent|representative)\b/.test(msg) ||
    /\b(i ?wan|make ?i|abeg)\s+(talk|speak|yarn)\s+(to|with)?\s*(person|human|agent|somebody|human being)\b/.test(msg)
  ) {
    return "human_handoff";
  }

  // 3. Database enumeration / SQL-injection-shaped requests. Checked after
  // human_handoff (see above), but still ahead of everything else -- a
  // message with no genuine handoff phrasing that's fishing for records,
  // tables, or schema info is still an attack, not a real question.
  if (
    /\b(list|show|dump|get|select|fetch)\s+(all\s+)?(records|rows|tables?|data|schema|database|databases|entries)\b/.test(msg) ||
    /\b(show|dump|list)\s+(me\s+)?(the\s+)?(schema|database|db|tables?|businesses\s+table)\b/.test(msg) ||
    /\b(sql\s+injection|select\s+\*\s+from|drop\s+table|information_schema)\b/.test(msg)
  ) {
    return "prompt_injection";
  }

  // 4. Model questions (checked next to distinguish identity questions from handoffs)
  if (/\b(are you (an? )?(ai|robot|bot|human|real)|what (ai )?model|who are you|what are you|chatgpt|gemini|gpt|llm)\b/.test(msg)) {
    return "model_question";
  }

  // 5. Sizing questions
  if (/\b(it|this|that|the|one)\b.*\b(small|medium|large|xl|xxl|size|fit)\b/.test(msg) || /\b(what sizes?|do you have.*size|available.*size|size.*available)\b/.test(msg)) {
    return "sizing_question";
  }

  // 6. FAQ patterns
  if (/\b(how (do|can|to|much)|delivery|deliver|return|refund|payment|pay|order|location|address|hours?\b|open|closed|policy|warranty|guarantee)\b/.test(msg)) {
    return "faq_question";
  }

  // 7. Product search
  if (/\b(dress|shoe|heel|bag|gown|top|skirt|trouser|sandal|accessory|jewel|watch|outfit)\b/.test(msg) || /\b(red|blue|black|white|green|yellow|pink|purple|gold|silver|brown)\b/.test(msg) || /\b(under |less than |cheap|affordable|budget|₦)\b/.test(msg) || /\b(show me|looking for|i need|i want|get me|recommend|suggest|catalogue|products?)\b/.test(msg)) {
    return "product_search";
  }

  // 8. Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b/.test(msg)) {
    return "greeting";
  }

  return "general_chat";
}
