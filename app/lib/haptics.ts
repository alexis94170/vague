export function haptic(type: "light" | "medium" | "heavy" | "success" | "warning") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const patterns: Record<typeof type, number | number[]> = {
    light: 8,
    medium: 18,
    heavy: 30,
    success: [10, 50, 20],
    warning: [10, 30, 10, 30],
  };
  try {
    navigator.vibrate(patterns[type]);
  } catch {}
}
