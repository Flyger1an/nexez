import type { MetadataRoute } from 'next'
import { getBaseUrl } from '../lib/agent-page'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'],
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

