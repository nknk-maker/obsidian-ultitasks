import { isValid, parseISO } from "date-fns";

/** Strict "YYYY-MM-DD" shape — rejects 5/6-digit years and other malformed strings up front. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 24-hour "HH:MM" — rejects out-of-range or malformed times. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parses a strict "YYYY-MM-DD" date string coming from user-authored task text, returning null
 * (never an Invalid Date) for anything malformed or non-existent (e.g. "2026-02-30"). This keeps
 * bad values from ever reaching date-fns `format`, which throws "Invalid time value".
 */
export function parseDateSafe(value: string | undefined | null): Date | null {
	if (!value || !ISO_DATE_RE.test(value)) return null;
	const date = parseISO(value);
	return isValid(date) ? date : null;
}

/** True when `value` is a real calendar date in strict "YYYY-MM-DD" form. */
export function isValidDate(value: string | undefined | null): boolean {
	return parseDateSafe(value) !== null;
}

/** True when `value` is a valid 24-hour "HH:MM" time. */
export function isValidTime(value: string | undefined | null): boolean {
	return !!value && TIME_RE.test(value);
}
