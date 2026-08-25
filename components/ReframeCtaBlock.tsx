import PrimaryButton from '@/components/PrimaryButton';
import type { ReframeTeaser } from '@/lib/artifact-schemas';

type ReframeCtaBlockProps = {
  reframeTeaser: ReframeTeaser;
  primaryConstellation: { name: string }[];
  onCheckout: () => void;
  checkoutLoading: boolean;
};

/**
 * The single reframe-teaser CTA composition, rendered identically on both
 * /identity (just-finished-reading) and /path (arrived cold via nav) — see
 * docs/briefs/reframe-teaser-redesign-brief.md. A shared component rather
 * than copy-pasted JSX guarantees the two pages stay byte-for-byte
 * identical by construction, not by convention.
 */
export default function ReframeCtaBlock({
  reframeTeaser,
  primaryConstellation,
  onCheckout,
  checkoutLoading,
}: ReframeCtaBlockProps) {
  const constellationLabel = [primaryConstellation[0]?.name, primaryConstellation[1]?.name]
    .filter(Boolean)
    .join('/');

  return (
    <div className="section">
      <div className="cta-header">
        <p className="eyebrow">NOW THAT YOU KNOW WHO YOU ARE</p>
        <h2>Find Out Where It&rsquo;s Pointing You</h2>
      </div>

      <div className="cta-block">
        <p className="limits-body">{reframeTeaser.recap}</p>

        <p className="reframe-pullquote">{reframeTeaser.reframe}</p>

        <p className="limits-body">{reframeTeaser.forward_frame}</p>

        <ul className="limits-bullets">
          <li className="limits-bullet">
            4 genuinely different directions{constellationLabel ? ` your ${constellationLabel} constellation` : ' your constellation'} could take next, each grounded in your own evidence
          </li>
          <li className="limits-bullet">Why each one fits, and what it would actually cost you to pursue it</li>
          <li className="limits-bullet">A 7-day plan to start moving on whichever one you choose</li>
        </ul>

        <p className="limits-body">$49, one-time.</p>

        <PrimaryButton onClick={onCheckout} disabled={checkoutLoading}>
          {checkoutLoading ? 'Redirecting…' : 'Explore Your Path Options — $49'}
        </PrimaryButton>
      </div>
    </div>
  );
}
