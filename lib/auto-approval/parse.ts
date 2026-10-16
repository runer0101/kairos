// Strict verdict parsing: exactly one JSON object with the two string fields
// `decision` ("allow" | "deny") and `reason`. Whitespace and a single
// unambiguous fenced block are tolerated; anything else is null, never a throw.

export type Decision = "allow" | "deny";

export interface Verdict {
	decision: Decision;
	reason: string;
}

/** Maximum characters accepted in a verdict reason. */
export const REASON_MAX_CHARS = 1024;

// Mirrors gentle-pi's strict verdict shape: exactly two string-valued fields,
// either order, no duplicate keys, no trailing or surrounding text.
const VERDICT_OBJECT =
	/^\s*\{\s*"(decision|reason)"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"(decision|reason)"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*$/;
// One fenced block, optionally tagged `json`, spanning the whole input.
const FENCED_BLOCK = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

function unfence(text: string): string | null {
	if (!text.startsWith("```")) return text;
	const match = FENCED_BLOCK.exec(text);
	if (!match || match[1].includes("```")) return null;
	return match[1].trim();
}

/** Parses a classifier verdict strictly; returns null for every invalid shape. */
export function parseVerdict(text: unknown): Verdict | null {
	try {
		if (typeof text !== "string") return null;
		const trimmed = text.trim();
		if (trimmed === "") return null;
		const body = unfence(trimmed);
		if (body === null) return null;
		const match = VERDICT_OBJECT.exec(body);
		if (!match || match[1] === match[2]) return null;
		const parsed = JSON.parse(body) as { decision?: unknown; reason?: unknown };
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		const { decision, reason } = parsed;
		if (decision !== "allow" && decision !== "deny") return null;
		if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_CHARS) return null;
		if (/[\p{Cc}\p{Cf}]/u.test(reason)) return null;
		return { decision, reason };
	} catch {
		return null;
	}
}
