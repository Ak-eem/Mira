// A business owner asking Mira's team to delete their account and data. There is no
// table for it on purpose: the request is recorded in the existing activity log (so it
// shows in Admin > Activity and on the business's settings page) and emailed to the
// operator. Deletion itself stays a manual admin action (docs/data-retention.md).
export const DELETE_REQUEST_WORD = "DELETE";
export const DELETE_REQUEST_SUMMARY = "Account deletion requested";
