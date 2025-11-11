// Handles normalization of parsed responses and notification dispatch
function normalizeError(parsed) {
  if (!parsed) return { isError: false };
  if (parsed.error) {
    const msg = (parsed.error && parsed.error.message) ? parsed.error.message : String(parsed.error);
    return { isError: true, message: msg, original: parsed.error };
  }
  if (typeof parsed.rawText === 'string' && parsed.rawText.indexOf('Error:') === 0) {
    return { isError: true, message: parsed.rawText, original: parsed.rawText };
  }
  return { isError: false };
}

// Dispatch notifications (onError/onResult/onUnauthorized) according to parsed result.
// Returns { error: message } when an error was detected, otherwise returns the parsed object.
function handleParsed(ctx = {}, endpoint, method, parsed) {
  const norm = normalizeError(parsed);
  if (norm.isError) {
    try {
      if (ctx.onError) ctx.onError(norm.original);
    } catch (e) {
      // swallow
    }
    return { error: norm.message };
  }

  try {
    if (ctx.onResult) ctx.onResult({ endpoint, method, parsed });
  } catch (e) {
    // swallow
  }

  if (parsed && (parsed.lastStatus === 401 || parsed.lastStatus === 403)) {
    try {
      if (ctx.onUnauthorized) ctx.onUnauthorized();
    } catch (e) {}
  }

  return parsed;
}

module.exports = { normalizeError, handleParsed };
