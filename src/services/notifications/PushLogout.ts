/** Keep AuthService independent of native notification/router initialization. */
let cleanup: ((nextAccountId?: string) => Promise<void>) | null = null;
export function registerPushLogout(handler: (nextAccountId?: string) => Promise<void>) {
  cleanup = handler;
  return () => { if (cleanup === handler) cleanup = null; };
}
export async function revokePushBeforeLogout(nextAccountId?: string) {
  if (!cleanup) return;
  const operation = cleanup(nextAccountId); // Suspends the account synchronously, before I/O.
  // Native Firebase unregister may wait for connectivity. Do not strand the
  // existing offline logout/cache-clear flow behind it. The coordinator keeps
  // subsequent native token acquisition ordered after that cleanup completes.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([operation, new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]);
  } finally { if (timer) clearTimeout(timer); }
}
