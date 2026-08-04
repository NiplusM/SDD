// Comment/note preview data for attachment chips. Extracted from App.jsx so the chat composer and
// the AI Review popup build previews with the very same code.

export function normalizeCommentTarget(target) {
  const kind = target?.kind;
  const index = target?.index;

  if ((kind === 'ac' || kind === 'plan') && Number.isInteger(index) && index >= 0) {
    return { kind, index };
  }

  return null;
}

export function getCommentIssueSourceLabel(issue = null) {
  const secondaryText = typeof issue?.secondaryText === 'string' ? issue.secondaryText.trim() : '';
  if (!secondaryText) return 'AI Note';

  return secondaryText.replace(/:\d+$/u, '');
}

export function getCommentIssueSourceLabelWithoutLine(issue = null) {
  return getCommentIssueSourceLabel(issue)
    .replace(/\s*·\s*Line\s+\d+\s*$/iu, '')
    .replace(/:\d+\s*$/u, '')
    .trim();
}

export function normalizeStoredDiffCommentsState(diffComments = {}) {
  if (!diffComments || typeof diffComments !== 'object') {
    return {};
  }

  return Object.entries(diffComments).reduce((nextState, [rowId, comments]) => {
    const nextComments = Array.isArray(comments)
      ? comments.reduce((entries, comment) => {
          if (typeof comment === 'string') {
            const text = comment.trim();
            return text.length > 0 ? [...entries, text] : entries;
          }

          if (comment && typeof comment === 'object') {
            const text = typeof comment.text === 'string' ? comment.text.trim() : '';
            if (text.length === 0) return entries;
            const lineLabel = typeof comment.lineLabel === 'string' ? comment.lineLabel.trim() : '';
            return [
              ...entries,
              {
                ...comment,
                text,
                ...(lineLabel.length > 0 ? { lineLabel } : {}),
              },
            ];
          }

          return entries;
        }, [])
      : [];

    if (nextComments.length > 0) {
      nextState[rowId] = nextComments;
    }

    return nextState;
  }, {});
}

export function flattenStoredDiffCommentsState(diffComments = {}) {
  const seenComments = new Set();

  return Object.values(normalizeStoredDiffCommentsState(diffComments))
    .flat()
    .map(getStoredCommentText)
    .filter((comment) => {
      const normalizedComment = comment.trim().toLowerCase();
      if (seenComments.has(normalizedComment)) {
        return false;
      }
      seenComments.add(normalizedComment);
      return true;
    });
}

export function getStoredCommentText(comment) {
  if (typeof comment === 'string') return comment;
  return typeof comment?.text === 'string' ? comment.text : '';
}

export function getStoredCommentLineLabel(comment) {
  return typeof comment?.lineLabel === 'string' ? comment.lineLabel.trim() : '';
}

export function getLatestThreadUserText(comment) {
  if (comment && typeof comment === 'object' && typeof comment.userReply === 'string' && comment.userReply.trim().length > 0) {
    return comment.userReply;
  }
  return getStoredCommentText(comment);
}

export function normalizeSpecVersionCommentEntries(commentEntries = []) {
  if (!Array.isArray(commentEntries)) {
    return [];
  }

  return commentEntries.reduce((entries, entry, entryIndex) => {
    const diffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    const directComments = Array.isArray(entry?.comments)
      ? entry.comments.filter((comment) => getStoredCommentText(comment).trim().length > 0)
      : [];
    const comments = directComments.length > 0
      ? directComments
      : flattenStoredDiffCommentsState(diffComments);

    if (comments.length === 0 && Object.keys(diffComments).length === 0) {
      return entries;
    }

    const normalizedEntry = {
      id: typeof entry?.id === 'string' && entry.id.length > 0
        ? entry.id
        : `spec-version-comment-${entryIndex}`,
      line: typeof entry?.line === 'string' ? entry.line : '',
      sectionTitle: typeof entry?.sectionTitle === 'string' ? entry.sectionTitle : '',
      comments,
    };

    if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey.length > 0) {
      normalizedEntry.rowStableKey = entry.rowStableKey;
    }

    if (Number.isInteger(entry?.rowIndex) && entry.rowIndex >= 0) {
      normalizedEntry.rowIndex = entry.rowIndex;
    }

    if (Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0) {
      normalizedEntry.rawIndex = entry.rawIndex;
    }

    const normalizedCheckTarget = normalizeCommentTarget(entry?.checkTarget);
    if (normalizedCheckTarget) {
      normalizedEntry.checkTarget = normalizedCheckTarget;
    }

    const normalizedIssueTarget = normalizeCommentTarget(entry?.issueTarget);
    if (normalizedIssueTarget) {
      normalizedEntry.issueTarget = normalizedIssueTarget;
    }

    if (typeof entry?.issueSeverity === 'string' && entry.issueSeverity.length > 0) {
      normalizedEntry.issueSeverity = entry.issueSeverity;
    }

    if (entry?.hideInlineInDocument) {
      normalizedEntry.hideInlineInDocument = true;
    }

    if (typeof entry?.sourceKind === 'string' && entry.sourceKind.length > 0) {
      normalizedEntry.sourceKind = entry.sourceKind;
    }

    if (typeof entry?.sourceLabel === 'string' && entry.sourceLabel.length > 0) {
      normalizedEntry.sourceLabel = entry.sourceLabel;
    }

    if (typeof entry?.sourceIcon === 'string' && entry.sourceIcon.length > 0) {
      normalizedEntry.sourceIcon = entry.sourceIcon;
    }

    if (typeof entry?.sourceNavigationTabId === 'string' && entry.sourceNavigationTabId.length > 0) {
      normalizedEntry.sourceNavigationTabId = entry.sourceNavigationTabId;
    }

    if (typeof entry?.sourceNavigationRowId === 'string' && entry.sourceNavigationRowId.length > 0) {
      normalizedEntry.sourceNavigationRowId = entry.sourceNavigationRowId;
    }

    if (Number.isInteger(entry?.sourceLineNumber) && entry.sourceLineNumber > 0) {
      normalizedEntry.sourceLineNumber = entry.sourceLineNumber;
    }

    if (Object.keys(diffComments).length > 0) {
      normalizedEntry.diffComments = diffComments;
    }

    entries.push(normalizedEntry);
    return entries;
  }, []);
}

export function getAiChatAttachmentCommentPreviewItems(attachment = null) {
  if (!attachment || typeof attachment !== 'object') {
    return [];
  }

  const selectionPreviewItems = getSelectionContextPreviewItems(attachment);
  const hasCommentPayload = Boolean(
    attachment.diffComments
    || attachment.isChatAnnotation
    || attachment.sddCommentEntries
    || attachment.sddRelatedCommentIssues,
  );

  if (attachment.isSelectionContext && !hasCommentPayload) {
    return selectionPreviewItems;
  }

  if (attachment.isChatAnnotation && Array.isArray(attachment.annotations)) {
    const annotationPreviewItems = attachment.annotations
      .filter((annotation) => typeof annotation?.comment === 'string' && annotation.comment.trim().length > 0)
      .map((annotation, index) => ({
        text: annotation.comment.trim(),
        sourceLabel: 'Quotes',
        lineLabel: typeof annotation.lineLabel === 'string' && annotation.lineLabel.trim().length > 0
          ? annotation.lineLabel.trim().replace(/^Annotation\b/iu, 'Quote')
          : `Quote ${index + 1}`,
        selectedText: annotation.selectedText ?? '',
        createdAt: Number.isFinite(annotation.createdAt) ? annotation.createdAt : null,
      }));
    return [...annotationPreviewItems, ...selectionPreviewItems]
      .sort((left, right) => {
        const leftCreatedAt = Number.isFinite(left.createdAt) ? left.createdAt : Number.POSITIVE_INFINITY;
        const rightCreatedAt = Number.isFinite(right.createdAt) ? right.createdAt : Number.POSITIVE_INFINITY;
        return leftCreatedAt - rightCreatedAt;
      })
      .map((item, index) => ({
        ...item,
        lineLabel: `Quote ${index + 1}`,
      }));
  }

  const seenComments = new Set();
  const normalizePreviewSourceLabel = (sourceLabel = '') => (
    typeof sourceLabel === 'string'
      ? sourceLabel
        .replace(/\s*·\s*Line\s+\d+\s*$/iu, '')
        .replace(/:\d+\s*$/u, '')
        .trim()
      : ''
  );
  const addComment = (items, comment, sourceLabel = '') => {
    const agentUserReply = comment && typeof comment === 'object' && comment.author === 'agent' && typeof comment.userReply === 'string'
      ? comment.userReply.trim()
      : '';
    if (comment && typeof comment === 'object' && comment.author === 'agent' && agentUserReply.length === 0) return items;
    const trimmedComment = getLatestThreadUserText(comment).trim();
    if (!trimmedComment) return items;

    const normalizedSourceLabel = normalizePreviewSourceLabel(sourceLabel);
    const lineLabel = getStoredCommentLineLabel(comment);
    // The agent's reply in the thread (shown under the note on hover), so the
    // preview carries the whole exchange, not just the question.
    const agentReply = comment && typeof comment === 'object' && typeof comment.agentReply === 'string'
      ? comment.agentReply.trim()
      : '';
    const normalizedComment = `${normalizedSourceLabel.toLowerCase()}|${trimmedComment.toLowerCase()}`;
    if (seenComments.has(normalizedComment)) return items;
    seenComments.add(normalizedComment);
    items.push({
      text: trimmedComment,
      sourceLabel: normalizedSourceLabel,
      lineLabel,
      agentReply,
    });
    return items;
  };

  const items = [];
  // Row-aware so a reply can be linked to its note. The agent reply lives in one
  // of two shapes: as an `agentReply` field on the note (live composer chip), or
  // as a separate { author: 'agent' } entry right after it (sent-message
  // snapshot). Handle both so hover shows the reply everywhere.
  Object.values(normalizeStoredDiffCommentsState(attachment.diffComments)).forEach((rowComments) => {
    let lastItem = null;
    (Array.isArray(rowComments) ? rowComments : []).forEach((comment) => {
      const isAgentReplyEntry = comment && typeof comment === 'object'
        && comment.author === 'agent'
        && !(typeof comment.userReply === 'string' && comment.userReply.trim().length > 0);
      if (isAgentReplyEntry) {
        const replyText = getStoredCommentText(comment).trim();
        if (lastItem && replyText && !lastItem.agentReply) lastItem.agentReply = replyText;
        return;
      }
      const before = items.length;
      addComment(items, comment, attachment.label);
      if (items.length > before) lastItem = items[items.length - 1];
    });
  });
  normalizeSpecVersionCommentEntries(attachment.sddCommentEntries).forEach((entry) => {
    const documentSourceLabel = attachment.isSddDocument ? attachment.label : entry.sourceLabel;
    (entry.comments ?? []).forEach((comment) => addComment(items, comment, documentSourceLabel));
    const entrySourceLabel = entry.sourceLabel || entry.sectionTitle || entry.sourceNavigationTabId || attachment.label;
    Object.values(normalizeStoredDiffCommentsState(entry.diffComments)).flat().forEach((comment) => addComment(items, comment, entrySourceLabel));
  });
  (Array.isArray(attachment.sddRelatedCommentIssues) ? attachment.sddRelatedCommentIssues : []).forEach((issue) => {
    addComment(items, issue?.label, getCommentIssueSourceLabelWithoutLine(issue));
  });

  return [...items, ...selectionPreviewItems];
}

export function getSelectionContextItems(attachment = null) {
  if (!attachment?.isSelectionContext && !Array.isArray(attachment?.selections)) return [];

  const selections = Array.isArray(attachment.selections) && attachment.selections.length > 0
    ? attachment.selections
    : [attachment];

  return selections
    .map((selection, index) => ({
      ...selection,
      id: selection.id ?? `${attachment.id}:selection-${index + 1}`,
      sourceLabel: selection.sourceLabel ?? attachment.sourceLabel ?? '',
      sourceTabId: selection.sourceTabId ?? attachment.sourceTabId ?? null,
      isChatSelectionContext: Boolean(selection.isChatSelectionContext ?? attachment.isChatSelectionContext),
      selectedText: typeof selection.selectedText === 'string' ? selection.selectedText.trim() : '',
      lineLabel: typeof selection.lineLabel === 'string' ? selection.lineLabel : (attachment.lineLabel ?? ''),
      messageId: selection.messageId ?? attachment.messageId ?? null,
      blockId: selection.blockId ?? attachment.blockId ?? null,
      startOffset: Number.isFinite(selection.startOffset) ? selection.startOffset : attachment.startOffset,
      endOffset: Number.isFinite(selection.endOffset) ? selection.endOffset : attachment.endOffset,
      order: index + 1,
      isSelectionContext: true,
    }))
    .filter((selection) => selection.selectedText.length > 0);
}

export function getSelectionContextPreviewItems(attachment = null) {
  return getSelectionContextItems(attachment).map((selection, index) => {
    const normalizedLineLabel = selection.isChatSelectionContext
      ? `Quote ${index + 1}`
      : (typeof selection.lineLabel === 'string'
        ? selection.lineLabel
          .replace(/^Comment to line\s+/i, 'Quote for line ')
          .replace(/^Comment to lines from\s+/i, 'Quote for lines ')
          .replace(/^Line\s+/i, 'Quote for line ')
          .replace(/^Lines\s+/i, 'Quote for lines ')
          .replace(/\s+to\s+/i, '–')
          .trim()
        : '');
    return {
      text: selection.selectedText,
      sourceLabel: '',
      // No line label (a spec document has no gutter) — fall back to the chat-style counter.
      lineLabel: normalizedLineLabel || `Quote ${index + 1}`,
      selectedText: selection.selectedText,
      isSelectionContextPreview: true,
      createdAt: Number.isFinite(selection.createdAt) ? selection.createdAt : null,
    };
  });
}
