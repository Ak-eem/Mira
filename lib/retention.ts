// Single source of truth for how long temporary message-processing records
// are kept. Read by the daily cleanup job (app/api/cron/cleanup) AND rendered
// into the Privacy Policy and Terms pages, so what we tell people and what the
// code does can't drift apart.
//
// The WhatsApp / email inbound queues hold the raw webhook payload (message
// text and sender identifier) while a message is processed, and double as the
// duplicate-delivery guard. 30 days comfortably outlasts any provider's webhook
// retry window, so deleting after this is safe.
export const INBOUND_QUEUE_RETENTION_DAYS = 30;
