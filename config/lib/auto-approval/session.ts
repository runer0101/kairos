// Marker shared by every consumer that must ignore the classifier's internal
// sessions: the classifier creates them with this title and the notification
// plugin uses it to stay silent. Keep both sides on this single source.

/** Title the auto-approval classifier gives to its internal sessions. */
export const CLASSIFIER_SESSION_TITLE = "kairos auto-approval classifier";
