import { addDays, addMonths, addWeeks, addYears, format, parseISO } from "date-fns";
import { RepeatRule } from "./task";

function step(date: Date, repeat: RepeatRule): Date {
	switch (repeat) {
		case "daily":
			return addDays(date, 1);
		case "weekly":
			return addWeeks(date, 1);
		case "monthly":
			return addMonths(date, 1);
		case "yearly":
			return addYears(date, 1);
		case "never":
		default:
			return date;
	}
}

/** Advances a "YYYY-MM-DD" date string by one repeat interval. Returns the input unchanged for "never". */
export function advanceDate(dateStr: string, repeat: RepeatRule): string {
	if (repeat === "never") return dateStr;
	const next = step(parseISO(dateStr), repeat);
	return format(next, "yyyy-MM-dd");
}
