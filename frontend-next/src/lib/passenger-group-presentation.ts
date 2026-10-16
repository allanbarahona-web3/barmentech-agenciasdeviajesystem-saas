const DEFAULT_PASSENGER_GROUP_COLOR = '#64748b';

export function resolvePassengerGroupColor(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) return DEFAULT_PASSENGER_GROUP_COLOR;
  const hex = match[1];
  return hex.length === 3 ? `#${hex.split('').map((character) => character + character).join('')}` : `#${hex}`;
}

export function passengerGroupForegroundColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  return luminance > 0.72 ? '#1f2937' : color;
}
