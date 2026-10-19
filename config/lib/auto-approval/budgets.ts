// Deterministic resource limits and primitives for the auto-approval classifier.
// The library is pure and mechanism-agnostic: T3 wires it to the OpenCode hooks.

/** Maximum UTF-8 bytes of classifier input (live request, action and history). */
export const INPUT_BYTES = 32 * 1024;
/** Maximum tokens requested for the classifier verdict. */
export const OUTPUT_TOKENS = 512;
/** Maximum time a single classification may take before it is abandoned. */
export const DEADLINE_MS = 15_000;

/** UTF-8 byte length of a string. */
export function utf8Bytes(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

/**
 * Longest prefix of `text` that fits in `maxBytes` UTF-8 bytes, never slicing a
 * code point in half. Non-positive or non-finite budgets yield "".
 */
export function truncateToBytes(text: string, maxBytes: number): string {
	if (!Number.isFinite(maxBytes) || maxBytes <= 0) return "";
	if (utf8Bytes(text) <= maxBytes) return text;
	let used = 0;
	let kept = "";
	for (const point of text) {
		const size = utf8Bytes(point);
		if (used + size > maxBytes) break;
		used += size;
		kept += point;
	}
	return kept;
}

/**
 * Deterministic deadline clamp: positive finite values are capped at
 * DEADLINE_MS; invalid values fall back to DEADLINE_MS (never unlimited).
 */
export function clampDeadlineMs(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEADLINE_MS;
	return Math.min(value, DEADLINE_MS);
}

export interface InFlightGuard {
	isBusy(): boolean;
	/** Returns true only for the first caller while no classification is in flight. */
	tryEnter(): boolean;
	/** Releases the slot; safe to call more than once. */
	exit(): void;
}

/** Allows exactly one classification in flight; concurrent callers are skipped. */
export function createInFlightGuard(): InFlightGuard {
	let busy = false;
	return {
		isBusy: () => busy,
		tryEnter: () => {
			if (busy) return false;
			busy = true;
			return true;
		},
		exit: () => {
			busy = false;
		},
	};
}
