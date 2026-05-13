/**
 * Worker token rejection — friendly error + clean exit.
 *
 * When any worker RPC raises with Postgres errcode 42501 and the message
 * contains "worker token rejected", the daemon prints a human-readable
 * message and exits. launchd's KeepAlive cannot re-mint a token, so there
 * is no point in restarting — the user must re-install.
 */

export interface RpcError {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
}

export function isWorkerTokenRejection(error: RpcError): boolean {
  return (
    error.code === "42501" &&
    typeof error.message === "string" &&
    error.message.includes("worker token rejected")
  );
}

/**
 * Call after every worker RPC. If the error is a token rejection,
 * print the friendly message and exit(1). Otherwise return normally
 * so the caller can handle other errors.
 */
export function handleWorkerTokenRejection(error: RpcError): void {
  if (isWorkerTokenRejection(error)) {
    console.error(
      "[daemon] fatal: worker token rejected (revoked or expired)\n" +
        "  Re-install or mint a fresh token at https://rove-agiterra.vercel.app/setup",
    );
    process.exit(1);
  }
}
