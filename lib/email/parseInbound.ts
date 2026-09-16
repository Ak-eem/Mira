import { htmlToText } from "@/lib/ai/urlFetch";

function quoteStart(value: string): number {
  const markers = [
    /^\s*On .+ wrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  ];
  return markers.reduce((earliest, marker) => {
    const match = marker.exec(value);
    return match && match.index < earliest ? match.index : earliest;
  }, value.length);
}

export function extractReplyText(rawText: string, rawHtml?: string): string {
  const htmlWithQuoteMarkers = rawHtml?.replace(/<blockquote\b[^>]*>/gi, "\n> ").replace(/<\/blockquote>/gi, "\n") ?? "";
  const source = rawText.trim() || (rawHtml ? htmlToText(htmlWithQuoteMarkers) : "");
  const withoutQuotedBlock = source.slice(0, quoteStart(source));
  return withoutQuotedBlock
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}