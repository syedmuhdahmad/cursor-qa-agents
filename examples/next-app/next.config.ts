import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `next dev` adds a Next.js block to AGENTS.md when it runs under a coding
  // agent. This example keeps AGENTS.md exactly as the kit ships it.
  agentRules: false,
  // This app sits inside another repository that has its own lockfile.
  // Without this, Next.js picks that repository's root as the project root.
  turbopack: { root: __dirname },
}

export default nextConfig
