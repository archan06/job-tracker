const OFFICIAL = [
  { app: "Claude", name: /claude|anthropic/i, hosts: ["claude.ai", "claude.com", "anthropic.com"] },
  { app: "ChatGPT", name: /chatgpt|openai/i, hosts: ["chatgpt.com", "openai.com"] },
];

const onHost = (host: string, official: string) => host === official || host.endsWith(`.${official}`);

/** If an app uses a well-known assistant's name but sends users somewhere else, the name it's imitating. */
export function impersonatedApp(clientName: string, redirectHost: string): string | null {
  const match = OFFICIAL.find((o) => o.name.test(clientName));
  if (!match || match.hosts.some((h) => onHost(redirectHost, h))) return null;
  return match.app;
}
