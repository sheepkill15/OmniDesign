import type { ProviderId } from './types.js'

const providerSetupUrls: Readonly<Record<ProviderId, string>> = {
  codex: 'https://developers.openai.com/codex/cli/',
  claude: 'https://code.claude.com/docs/en/installation',
}

export function providerSetupUrl(providerId: ProviderId): string {
  return providerSetupUrls[providerId]
}
