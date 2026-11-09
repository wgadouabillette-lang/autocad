const token = import.meta.env.VITE_MIXPANEL_TOKEN?.trim() ?? "";

function track(event: string, distinctId: string, properties: Record<string, string>): void {
  if (!token || !distinctId) return;
  const payload = [
    {
      event,
      properties: {
        token,
        distinct_id: distinctId,
        time: Math.floor(Date.now() / 1000),
        $insert_id: crypto.randomUUID(),
        ...properties,
      },
    },
  ];
  void fetch("https://api.mixpanel.com/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Mixpanel stays optional when the network call fails.
  });
}

export function trackMixpanel(
  distinctId: string,
  event: string,
  properties: Record<string, string> = {},
): void {
  track(event, distinctId, properties);
}
