-- Lets a business owner decide (a) whether their portal inventory
-- assistant is allowed to make changes at all, and (b) which LLM
-- provider handles it, rather than both being fixed platform-wide
-- defaults. Off by default: this is a new, real write capability (see
-- app/portal/.../inventory/), so existing and new businesses alike
-- start opted OUT until the owner explicitly turns it on, rather than
-- silently gaining write access to their own data.
--
-- Scope: this only gates the PORTAL inventory assistant. The admin
-- Command Center (Mira staff, app/admin/.../command/) is unaffected --
-- staff need consistent access to every business regardless of a
-- given business's own toggle, same reasoning as staff not being
-- paywall-locked out of a business's admin pages.
alter table businesses add column if not exists command_agent_enabled boolean not null default false;
alter table businesses add column if not exists command_agent_provider text not null default 'groq'
  check (command_agent_provider in ('groq', 'gemini'));
