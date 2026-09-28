export type Interval = { start: number; end: number };
export type BusinessWindow = Interval & { slotMinutes: number };

export function toMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horario inválido");
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function overlaps(first: Interval, second: Interval): boolean {
  return first.start < second.end && second.start < first.end;
}

export function getAvailableSlots(
  windows: readonly BusinessWindow[],
  durationMinutes: number,
  occupied: readonly Interval[],
  nowMinutes?: number,
): Interval[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error("Duración inválida");
  const slots: Interval[] = [];

  for (const window of windows) {
    if (window.start < 0 || window.end > 1440 || window.end <= window.start ||
        !Number.isInteger(window.slotMinutes) || window.slotMinutes <= 0) {
      throw new Error("Horario comercial inválido");
    }
    const stepMinutes = Math.max(window.slotMinutes, durationMinutes);
    for (let start = window.start; start + durationMinutes <= window.end; start += stepMinutes) {
      const slot = { start, end: start + durationMinutes };
        if ((nowMinutes === undefined || start > nowMinutes) &&
          !occupied.some((item) => overlaps(slot, item)) &&
          !slots.some((item) => overlaps(slot, item))) {
        slots.push(slot);
      }
    }
  }

  return slots;
}