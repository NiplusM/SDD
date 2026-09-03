// A stored Code-review comment can carry an inline agent reply and a user
// reply-to-agent as fields on a single object, so one stored comment can
// represent a whole thread of up to three messages:
//   your note → Claude Agent reply → your reply.
// A standalone { author: 'agent' } entry is its own single message.
//
// All comment counters (gutter balloon, chat-history folder, composer chip)
// must agree on this, otherwise a 3-message thread reads as "1".
export function getCommentThreadMessageCount(comment) {
  if (!comment || typeof comment !== 'object') return 1;
  const isAgentAuthored = comment.author === 'agent';
  let count = 1; // the note itself, or the agent's own message
  // A non-agent note can carry an agent reply; either kind can carry a user reply.
  // (Previously an agent-authored entry short-circuited to 1, so a reply added
  // under it — agent or user — never grew the counter.)
  if (!isAgentAuthored && typeof comment.agentReply === 'string' && comment.agentReply.trim().length > 0) count += 1;
  if (typeof comment.userReply === 'string' && comment.userReply.trim().length > 0) count += 1;
  return count;
}

// The single rule for "is this text a question the agent should answer,
// vs. an instruction it should just carry out?" — a "?" anywhere in the text.
// Used both for the original note and for the user's reply to the agent, so a
// follow-up like "do it" (no "?") resolves the thread instead of continuing it.
export function textLooksLikeQuestion(text) {
  return typeof text === 'string' && text.includes('?');
}

// Sum thread messages across a list of stored comments (strings count as 1).
export function countCommentThreadMessages(comments = []) {
  return (Array.isArray(comments) ? comments : []).reduce(
    (sum, comment) => sum + getCommentThreadMessageCount(comment),
    0,
  );
}
