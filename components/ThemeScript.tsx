import { THEME_INIT_SCRIPT } from "@/lib/theme";

/** Sets the theme before first paint so there is no light flash. Render once, at the top of a themed layout. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
