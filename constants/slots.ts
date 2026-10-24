/**
 * constants/slots.ts — the half-hour grid every bookable provider picks from.
 *
 * Lifted out of the hospital dashboard when scanning centres arrived: a doctor
 * and a scan choose their slots from the SAME grid, and two copies would drift
 * the moment either side added a time. The strings are the wire format — the
 * backend stores them verbatim in `Doctor.slots` / `Scan.slots` and the patient
 * screens render them as-is, so "09:00 AM" is data, not presentation.
 */
export const DEFAULT_SLOTS: string[] = [
  "12:00 AM","12:30 AM","01:00 AM","01:30 AM","02:00 AM","02:30 AM",
  "03:00 AM","03:30 AM","04:00 AM","04:30 AM","05:00 AM","05:30 AM",
  "06:00 AM","06:30 AM","07:00 AM","07:30 AM","08:00 AM","08:30 AM",
  "09:00 AM","09:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","01:00 PM","01:30 PM","02:00 PM","02:30 PM",
  "03:00 PM","03:30 PM","04:00 PM","04:30 PM","05:00 PM","05:30 PM",
  "06:00 PM","06:30 PM","07:00 PM","07:30 PM","08:00 PM","08:30 PM",
  "09:00 PM","09:30 PM","10:00 PM","10:30 PM","11:00 PM","11:30 PM",
];

export const SLOT_SECTIONS = [
  { label: "Late Night / Early Morning", slots: DEFAULT_SLOTS.slice(0, 12) },
  { label: "Morning",                    slots: DEFAULT_SLOTS.slice(12, 24) },
  { label: "Afternoon",                  slots: DEFAULT_SLOTS.slice(24, 32) },
  { label: "Evening",                    slots: DEFAULT_SLOTS.slice(32, 40) },
  { label: "Night",                      slots: DEFAULT_SLOTS.slice(40, 48) },
];

/**
 * One-tap hours for the slot picker. Mirrors SLOT_PRESETS in the website's
 * src/hospital/Hdashboard.js: change one, change both. `to` is the LAST start
 * time, so "9 AM – 9 PM" ends at 08:30 PM: 9 PM is closing time, not a slot.
 */
export const SLOT_PRESETS = [
  { label: '9 AM – 9 PM', from: '09:00 AM', to: '08:30 PM' },
  { label: '9 AM – 1 PM', from: '09:00 AM', to: '12:30 PM' },
  { label: '9 AM – 6 PM', from: '09:00 AM', to: '05:30 PM' },
  { label: '6 PM – 9 PM', from: '06:00 PM', to: '08:30 PM' },
];

export const presetSlots = ({ from, to }: { from: string; to: string }): string[] =>
  DEFAULT_SLOTS.slice(DEFAULT_SLOTS.indexOf(from), DEFAULT_SLOTS.indexOf(to) + 1);

/** Days of the week a provider is available on (separate from time slots). */
export const DAYS_OF_WEEK: { key: string; label: string }[] = [
  { key: 'Mon', label: 'Monday'    },
  { key: 'Tue', label: 'Tuesday'   },
  { key: 'Wed', label: 'Wednesday' },
  { key: 'Thu', label: 'Thursday'  },
  { key: 'Fri', label: 'Friday'    },
  { key: 'Sat', label: 'Saturday'  },
  { key: 'Sun', label: 'Sunday'    },
];
