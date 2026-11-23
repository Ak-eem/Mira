// The assistant writes light markdown (**bold**, "- " lists, [text](url)). An email client shows that as
// raw symbols, so every reply is converted before sending: a clean plain-text part and a small HTML part.
// Pure (no I/O) so it is tested in formatReply.test.ts. HTML is built from escaped text only.

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Keeps a Gmail/Outlook "smart link" out of the text: [60 Iyalode St](https://maps...) -> "60 Iyalode St (https://maps...)".
export function markdownToPlainText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => (text.trim() === url ? url : `${text} (${url})`))
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
      const href = url.replace(/&amp;/g, "&");
      return SAFE_URL.test(href) ? `<a href="${escapeHtml(href)}">${text}</a>` : `${text} (${url})`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,!?:;]|<|$)/g, "$1<em>$2</em>")
    .replace(/`([^`\n]+)`/g, "$1")
    // A bare link the model wrote as plain text.
    .replace(/(^|[\s(>])(https?:\/\/[^\s<)]+[^\s<).,;!?])/g, (_m, lead: string, url: string) => `${lead}<a href="${url}">${url}</a>`);
}

export function markdownToHtml(input: string): string {
  const lines = markdownToPlainTextKeepingBold(input).split("\n");
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (list.length) out.push(`<ul style="margin:0 0 12px;padding-left:20px;">${list.map((i) => `<li style="margin:0 0 4px;">${i}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushPara = () => {
    if (para.length) out.push(`<p style="margin:0 0 12px;">${para.join("<br>")}</p>`);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!line.trim()) {
      flushList();
      flushPara();
    } else if (bullet) {
      flushPara();
      list.push(inline(escapeHtml(bullet[1])));
    } else {
      flushList();
      para.push(inline(escapeHtml(line.replace(/^\s{0,3}#{1,6}\s+/, ""))));
    }
  }
  flushList();
  flushPara();
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;">${out.join("")}</div>`;
}

// Only normalises line endings and blank lines; bold/links are handled in inline().
function markdownToPlainTextKeepingBold(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
