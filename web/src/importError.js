// The sentence the import panel shows for a failed extraction. Errors from
// the API already carry a reason; this covers the failures that never got
// one: the request didn't reach the server, or the server died before it
// could answer in JSON (api.js then throws the bare status code). `t` is
// the translate function from useLanguage.
export function describeImportError(err, t) {
  const message = err?.message ?? '';
  if (
    err instanceof TypeError ||
    /failed to fetch|load failed|networkerror/i.test(message)
  ) {
    return t('importUnreachable');
  }
  if (/^\d{3}$/.test(message)) {
    return t('importServerDied', { status: message });
  }
  return message || t('importUnknown');
}
