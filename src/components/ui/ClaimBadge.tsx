"use client";

import { ExternalLink } from "lucide-react";
import { CLAIM_LABEL, CLAIM_MEANING, isUnsettledClaim, type Claim } from "../../lib/claim";
import { HoverCard } from "./HoverCard";

const BASE = "inline-flex cursor-help items-center rounded border px-1.5 text-xs font-normal focus-visible:outline focus-visible:outline-1";
const SETTLED = `${BASE} border-line text-neutral-400 hover:text-neutral-200 focus-visible:outline-neutral-400`;
const UNSETTLED = `${BASE} border-amber-400/40 text-amber-300 hover:text-amber-200 focus-visible:outline-amber-400/70`;

/** Host + path is what a reader needs to recognise a source; the full URL stays in the href. */
function shortUrl(url: string): string {
  const { host, pathname } = new URL(url);
  return `${host.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`;
}

function ClaimCard({ claim, titleId }: { claim: Claim; titleId: string }) {
  return (
    <div className="space-y-2">
      <div id={titleId} className="font-semibold text-neutral-50">
        {CLAIM_LABEL[claim.v]}
      </div>
      <p className="text-xs leading-5 text-neutral-400">{CLAIM_MEANING[claim.v]}</p>
      {claim.note && <p className="leading-6 text-neutral-200">{claim.note}</p>}
      {claim.src.length > 0 ? (
        <ul className="space-y-1 border-t border-line pt-2">
          {claim.src.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-neutral-400 hover:text-amber-200">
                {shortUrl(url)} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-2 text-xs text-neutral-400">No source cited.</p>
      )}
    </div>
  );
}

/**
 * How well a fact is backed, as a small inline chip; hover or tap for the sources and the note.
 * Amber only for unverified / conflicting facts, so the one accent keeps meaning "check this".
 */
export function ClaimBadge({ claim }: { claim: Claim }) {
  return (
    <HoverCard
      triggerClassName={isUnsettledClaim(claim.v) ? UNSETTLED : SETTLED}
      trigger={
        <>
          <span className="sr-only">evidence: </span>
          {CLAIM_LABEL[claim.v]}
        </>
      }
    >
      {(titleId) => <ClaimCard claim={claim} titleId={titleId} />}
    </HoverCard>
  );
}
