/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeRedirectPath(value: string | undefined, fallback = '/'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
