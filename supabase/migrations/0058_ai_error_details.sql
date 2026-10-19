-- Keep what actually went wrong when an AI reply fails, so the admin analytics page can show it when an error
-- is clicked. error_code was just the JavaScript error name ("Error"); it now holds a short code such as
-- http_429 / timeout / not_configured, and error_message holds the provider's own explanation (provider
-- error text only, bounded to 500 characters, never customer messages).
alter table public.ai_response_telemetry
  add column if not exists error_message text check (error_message is null or char_length(error_message) <= 500);
