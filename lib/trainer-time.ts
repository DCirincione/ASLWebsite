// Interpret wall-clock inputs in the training network's Eastern time zone, including DST.
export function easternSessionTime(date: string, time: string) {
  const wall = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(wall.getTime())) throw new Error("Choose a valid date and time.");
  let instant = wall.getTime();
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const local = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`).getTime();
    const offset = wall.getTime() - local;
    if (offset === 0) return new Date(instant);
    instant += offset;
  }
  throw new Error("That time does not exist during the daylight-saving transition. Choose another time.");
}
