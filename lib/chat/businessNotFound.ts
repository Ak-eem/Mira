import { NextResponse } from "next/server";

// The one response every public chat endpoint returns for a business that is
// missing, inactive or cancelled. `code` lets the widget tell this apart from
// other 404s and show "Business not found", then remove itself.
export const BUSINESS_NOT_FOUND_CODE = "business_not_found";

export function businessNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Business not found.", code: BUSINESS_NOT_FOUND_CODE }, { status: 404 });
}
