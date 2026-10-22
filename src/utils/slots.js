// Visit slots: 8:00 AM to 9:00 PM, each visit 30 min, with a 15 min gap before the next one.
export const OPEN_MIN = 8 * 60;     // 8:00 AM
export const CLOSE_MIN = 21 * 60;   // 9:00 PM (a visit must END by this time)
export const VISIT_MIN = 30;        // length of one visit
export const GAP_MIN = 15;          // minimum gap between two slots
export const LEAD_MIN = 30;         // can't book a slot starting within 30 min from now

const label = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const ALL_SLOTS = (() => {
  const out = [];
  for (let s = OPEN_MIN; s + VISIT_MIN <= CLOSE_MIN; s += VISIT_MIN + GAP_MIN) out.push({ time: label(s), start: s });
  return out;
})();

// Current date (YYYY-MM-DD) and minutes-since-midnight in India time
export function nowIST() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Returns [{ time, available }] for a property on a date, or null if the date is invalid/past.
// Slots held by other people (paid, or unpaid within the last 15 minutes). A customer's own unpaid hold never blocks them.
const takenFilter = (excludeCustomerId) => {
  const holdCutoff = new Date(Date.now() - 15 * 60 * 1000);
  return {
    bookingStatus: { $ne: 'Cancelled' },
    $or: [
      { paymentStatus: 'Paid' },
      { paymentStatus: 'Pending', createdAt: { $gte: holdCutoff }, ...(excludeCustomerId ? { customer: { $ne: excludeCustomerId } } : {}) },
    ],
  };
};

export async function getSlots(Booking, propertyId, dateStr, excludeCustomerId = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(new Date(dateStr).getTime())) return null;
  const now = nowIST();
  if (dateStr < now.date) return null;

  const taken = new Set(await Booking.find({
    property: propertyId,
    preferredDate: new Date(dateStr),
    ...takenFilter(excludeCustomerId),
  }).distinct('preferredTime'));

  return ALL_SLOTS.map(({ time, start }) => ({
    time,
    available: !taken.has(time) && !(dateStr === now.date && start < now.minutes + LEAD_MIN),
  }));
}

// Number of free slots for each of the next `days` days (one database query)
export async function getDaysAvailability(Booking, propertyId, days = 14, excludeCustomerId = null) {
  const now = nowIST();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.date); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
  });
  const bookings = await Booking.find({
    property: propertyId,
    preferredDate: { $gte: new Date(dates[0]), $lte: new Date(dates[dates.length - 1]) },
    ...takenFilter(excludeCustomerId),
  }).select('preferredDate preferredTime');
  const takenBy = {};
  for (const b of bookings) (takenBy[b.preferredDate.toISOString().slice(0, 10)] ||= new Set()).add(b.preferredTime);
  return dates.map((date) => {
    const taken = takenBy[date] || new Set();
    const available = ALL_SLOTS.filter(({ time, start }) => !taken.has(time) && !(date === now.date && start < now.minutes + LEAD_MIN)).length;
    return { date, available };
  });
}
