/**
 * Browser online/offline signals — drives shell UX (footer badge, disabling
 * network-only affordances). Uses Navigator.onLine only; it can be optimistic.
 */

export function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function setNetworkDocumentState(online: boolean): void {
  document.documentElement.dataset.network = online ? "online" : "offline";
  document.documentElement.classList.toggle("app-offline", !online);
}

/** Subscribe to online/offline; invokes listener immediately with current state. */
export function subscribeToNetworkChanges(onChange: (online: boolean) => void): () => void {
  const emit = () => onChange(isBrowserOnline());
  emit();
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
}
