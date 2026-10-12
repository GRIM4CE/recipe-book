// The sentence the import panel shows for a failed extraction. Errors from
// the API already carry a reason; this covers the failures that never got
// one: the request didn't reach the server, or the server died before it
// could answer in JSON (api.js then throws the bare status code).
export function describeImportError(err) {
  const message = err?.message ?? '';
  if (
    err instanceof TypeError ||
    /failed to fetch|load failed|networkerror/i.test(message)
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/^\d{3}$/.test(message)) {
    return `The server stopped responding (error ${message}). It may have run out of time reading that page — try again, or paste the recipe text instead.`;
  }
  return message || 'Import failed for an unknown reason.';
}
