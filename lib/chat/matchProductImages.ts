export type ProductImageRef = { productId: string; name: string; imageUrl: string };
export type ProductForMatching = { id: string; name: string; image_url: string | null };

const MAX_IMAGES_PER_REPLY = 3;

// Matching on the reply text rather than having the model emit structured
// output/URLs: the model only ever needs to know a product has a photo
// (buildContext gives it "[has photo]"), never the URL itself, so there's
// nothing for it to garble, and rendering doesn't depend on prompt
// engineering holding up. Simple case-insensitive substring match --
// products all have distinct catalog names already (grounding is what the
// whole prompt is built around), so this doesn't need to be fuzzy.
export function matchProductImages(
  replyText: string,
  products: ProductForMatching[],
): ProductImageRef[] {
  const lowerReply = replyText.toLowerCase();
  const matches: ProductImageRef[] = [];

  for (const product of products) {
    if (!product.image_url) continue;
    if (!lowerReply.includes(product.name.toLowerCase())) continue;

    matches.push({ productId: product.id, name: product.name, imageUrl: product.image_url });
    if (matches.length >= MAX_IMAGES_PER_REPLY) break;
  }

  return matches;
}
