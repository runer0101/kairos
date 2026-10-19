// Pure decision table for the auto-approval classifier. Fail-safe by
// construction: every failure kind leaves the current decision untouched
// (passthrough), never weakens a hard layer and never turns a missing verdict
// into permission.
import type { Verdict } from "./parse.ts";

export type CurrentStatus = "ask" | "allow";
export type FailureKind = "none" | "timeout" | "error" | "invalid";
export type PolicyEffect = "allow" | "deny" | "passthrough";

export interface PolicyInput {
	/** Current configured effect for the action being classified. */
	currentStatus: CurrentStatus;
	/** Classifier verdict, or null when none was produced. */
	verdict: Verdict | null;
	/** Outcome of the classification attempt. */
	failure: FailureKind;
}

/**
 * ask + allow verdict + no failure        -> allow
 * allow + deny verdict + no failure       -> deny
 * every other combination (any failure)   -> passthrough
 */
export function decidePolicy(input: PolicyInput): PolicyEffect {
	if (!input || input.failure !== "none") return "passthrough";
	if (input.currentStatus === "ask" && input.verdict?.decision === "allow") return "allow";
	if (input.currentStatus === "allow" && input.verdict?.decision === "deny") return "deny";
	return "passthrough";
}
