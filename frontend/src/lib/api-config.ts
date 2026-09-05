function formatApiUrl(url?: string): string {
  if (!url) return "";
  let formatted = url.trim();
  if (!formatted) return "";

  // Add https protocol if missing
  if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
    formatted = `https://${formatted}`;
  }

  // Remove trailing slash
  formatted = formatted.replace(/\/+$/, "");

  // Render domain names use hyphens, not underscores. Auto-fix aegis_cart_backend -> aegis-cart-backend if typed with underscores
  try {
    const parsed = new URL(formatted);
    if (parsed.hostname.includes("_")) {
      parsed.hostname = parsed.hostname.replace(/_/g, "-");
      formatted = parsed.origin + parsed.pathname;
      formatted = formatted.replace(/\/+$/, "");
    }
  } catch {
    // Fallback simple replace if URL parsing fails
    formatted = formatted.replace(/(https?:\/\/)([^/]+)/, (_, proto, host) => proto + host.replace(/_/g, "-"));
  }

  return formatted;
}

export const API_BASE_URL = formatApiUrl(
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ""
);
