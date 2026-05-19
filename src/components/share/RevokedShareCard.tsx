export function RevokedShareCard() {
  return (
    <ShareTerminalCard
      eyebrow="Link no longer active"
      title="This share link has been revoked."
      body="The student turned off this link. You can ask them for a new one if you'd like to see their profile again."
      testId="share-revoked-card"
    />
  )
}

export function NotFoundShareCard() {
  return (
    <ShareTerminalCard
      eyebrow="Couldn't find that link"
      title="We don't have a record of this share link."
      body="The URL may have a typo, or the link may have been deleted. Double-check the link and try again."
      testId="share-not-found-card"
    />
  )
}

function ShareTerminalCard({
  eyebrow,
  title,
  body,
  testId,
}: {
  eyebrow: string
  title: string
  body: string
  testId: string
}) {
  return (
    <main
      className="mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      data-testid={testId}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2b2620]/55">
        {eyebrow}
      </span>
      <h1 className="text-[clamp(1.4rem,3vw,1.8rem)] font-semibold leading-tight tracking-tight text-[#2b2620]">
        {title}
      </h1>
      <p className="max-w-prose text-sm leading-relaxed text-[#2b2620]/70">{body}</p>
      <a
        href="/"
        className="mt-4 inline-flex h-10 items-center rounded-full bg-[#2b2620] px-5 text-sm font-medium text-[#fdfaf3] transition-colors hover:bg-[#2b2620]/85"
      >
        Visit SenseMake
      </a>
    </main>
  )
}
