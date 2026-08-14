/* Synchronisation présentateur <-> écran public via BroadcastChannel (même navigateur, fonctionne hors ligne). */
export function createChannel(sessionId, onMessage) {
  const ch = new BroadcastChannel('docbingo-session-' + sessionId);
  ch.onmessage = (e) => onMessage(e.data);
  return {
    send: (msg) => ch.postMessage(msg),
    close: () => ch.close()
  };
}
