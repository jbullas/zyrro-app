import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IconArrowRight } from '@tabler/icons-react';
import IdentityHero from '@/components/IdentityHero';
import { IDENTITY_REPORT_COPY as COPY } from '@/lib/identity-report-copy';
import { loadSharedHero, siteUrl } from '@/lib/share-link';

// #7: the public share page. Server-rendered from hero fields only
// (loadSharedHero → toIdentityHero), and every component here renders on the
// server, so no report content is passed to the browser as props.

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hero = await loadSharedHero(slug);
  if (!hero) notFound();

  return {
    metadataBase: new URL(siteUrl()),
    title: hero.named_identity,
    description: COPY.shareDescription,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'Zyrro',
      title: hero.named_identity,
      description: COPY.shareDescription,
      url: `/s/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: hero.named_identity,
      description: COPY.shareDescription,
    },
  };
}

export default async function SharedIdentityPage({ params }: Props) {
  const { slug } = await params;
  const hero = await loadSharedHero(slug);
  if (!hero) notFound();

  return (
    <div className="flow-container flow-container--wide">
      <div className="scroll gap-16">

        <IdentityHero hero={hero} />

        {/* ── Prospect CTA (in place of the hero Path CTA) ────────── */}
        <div className="section-cta section-cta--report">
          <div className="flex flex-col gap-8">
            <h2>{COPY.prospectCta.heading}</h2>
            <p>{COPY.prospectCta.body}</p>
          </div>
          <div>
            <a href="/start" className="btn-cta btn-cta--light">
              {COPY.prospectCta.button}
              <IconArrowRight size={18} stroke={2.2} aria-hidden="true" />
            </a>
          </div>
        </div>

        <footer className="report-footer">
          <p className="documentation">{COPY.footer.disclaimer}</p>
        </footer>

      </div>
    </div>
  );
}
