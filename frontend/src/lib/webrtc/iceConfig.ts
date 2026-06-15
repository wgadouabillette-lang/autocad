function readEnv(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrl = readEnv("VITE_TURN_URL");
  const turnUsername = readEnv("VITE_TURN_USERNAME");
  const turnCredential = readEnv("VITE_TURN_CREDENTIAL");
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
    return servers;
  }

  // Relais public de secours — utile derrière NAT / firewalls stricts en dev.
  servers.push({
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  });
  return servers;
}

export const DEFAULT_ICE_SERVERS = buildIceServers();

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
}
