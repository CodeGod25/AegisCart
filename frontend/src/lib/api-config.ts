function formatApiUrl(url?: string): string {
  let formatted = (url || "").trim();
  
  // Default to live backend on Render if env var is empty or wrongly typed aegis-cart-backend
  if (!formatted || formatted.includes("your-backend") || formatted.includes("aegis-cart-backend")) {
    return "https://aegiscart-backend.onrender.com";
  }

  // Add https protocol if missing
  if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
    formatted = `https://${formatted}`;
  }

  // Remove trailing slash
  formatted = formatted.replace(/\/+$/, "");

  // Fix domain hostname underscores if typed with underscores
  try {
    const parsed = new URL(formatted);
    if (parsed.hostname.includes("_")) {
      parsed.hostname = parsed.hostname.replace(/_/g, "-");
      formatted = parsed.origin + parsed.pathname;
      formatted = formatted.replace(/\/+$/, "");
    }
  } catch {
    formatted = formatted.replace(/(https?:\/\/)([^/]+)/, (_, proto, host) => proto + host.replace(/_/g, "-"));
  }

  return formatted;
}

export const API_BASE_URL = formatApiUrl(
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ""
);
