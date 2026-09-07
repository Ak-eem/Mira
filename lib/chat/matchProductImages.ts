export type ProductImageRef = {
  productId: string;
  name: string;
  imageUrl: string;
};

export type ProductForMatching = {
  id: string;
  name: string;
  image_url: string | null;
};

const MAX_IMAGES_PER_REPLY = 3;

/**
 * Turn display text into comparable words without depending on a fuzzy matcher.
 * Punctuation becomes a separator, so matches always happen on whole words.
 */
function normalizeWords(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[.,!?;:()[\]{}'\"`~@#$%^&*_+=|\\/<>-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

function containsSequence(words: string[], candidate: string[]): boolean {
  if (candidate.length === 0 || candidate.length > words.length) return false;

  for (let index = 0; index <= words.length - candidate.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < candidate.length; offset += 1) {
      if (words[index + offset] !== candidate[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

function singularizeWords(words: string[]): string[] {
  return words.map(singularize);
}

/**
 * Match product names mentioned in an assistant reply to their image URLs.
 * Exact whole-name matches win over plural fallbacks; longer names win before
 * shorter names, and the result is capped at three images.
 */
export function matchProductImages(
  replyText: string,
  products: ProductForMatching[],
): ProductImageRef[] {
  const replyWords = normalizeWords(replyText);
  const singularReplyWords = singularizeWords(replyWords);
  const matches: Array<{ result: ProductImageRef; exact: boolean; wordCount: number; nameLength: number; index: number }> = [];

  products.forEach((product, index) => {
    const imageUrl = product.image_url?.trim();
    const nameWords = normalizeWords(product.name);
    if (!imageUrl || nameWords.length === 0) return;

    const exact = containsSequence(replyWords, nameWords);
    const pluralFallback = !exact && containsSequence(singularReplyWords, singularizeWords(nameWords));
    if (!exact && !pluralFallback) return;

    matches.push({
      result: { productId: product.id, name: product.name, imageUrl },
      exact,
      wordCount: nameWords.length,
      nameLength: nameWords.join(" ").length,
      index,
    });
  });

  matches.sort(
    (left, right) =>
      Number(right.exact) - Number(left.exact) ||
      right.wordCount - left.wordCount ||
      right.nameLength - left.nameLength ||
      left.index - right.index,
  );

  return matches.slice(0, MAX_IMAGES_PER_REPLY).map(({ result }) => result);
}
