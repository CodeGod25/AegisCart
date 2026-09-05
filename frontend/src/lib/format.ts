/**
 * Format paise to Indian Rupees (INR) string.
 * Matches the backend's inr function in public/app.js
 */
export function formatINR(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) {
    return "₹0.00";
  }
  const n = Number(paise);
  const safe = Number.isFinite(n) ? n : 0;
  const [ip, dp] = (Math.abs(safe) / 100).toFixed(2).split(".");
  const whole = ip || "0";
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return (safe < 0 ? "-₹" : "₹") + grouped + "." + (dp || "00");
}