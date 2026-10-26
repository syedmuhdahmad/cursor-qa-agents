import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Next app example</h1>
      <p>A small app the QA agent kit is tested against.</p>
      <Link href="/sign-in">Sign in</Link>
    </main>
  )
}
