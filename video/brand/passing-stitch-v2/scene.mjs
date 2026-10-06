import {markArtwork, wordmarkArtwork} from '../woven-logo-v1/artwork.mjs';
import {pose} from './motion.mjs';

const reveal = (d, width, amount) => `<path d="${d}" pathLength="1000" fill="none" stroke="white" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1000 1000" stroke-dashoffset="${1000 * (1 - amount)}" opacity="${amount > 0 ? 1 : 0}"/>`;

export function passingStitchSvg(time = 6.5) {
  const p = pose(time);
  const pieces = markArtwork.match(/<path[^>]+\/>/g);
  // Completed paths bypass their mask, retaining even the original edge pixels.
  const piece = (index, mask, complete) => `<g${complete ? '' : ` mask="url(#${mask})"`}>${pieces[index]}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="The first Time Tapestry t passes its stitch to the second">
  <defs>
    <mask id="first-t" maskUnits="userSpaceOnUse" x="-80" y="-80" width="650" height="700">
      ${reveal('M132 -65 V350 Q132 392 180 392 H280', 110, p.firstStem)}
      ${reveal('M132 151 H-65', 100, p.firstLeft)}
      ${reveal('M132 151 H180 Q238 151 268 222', 100, p.firstGive)}
    </mask>
    <mask id="first-foot" maskUnits="userSpaceOnUse" x="-80" y="-80" width="650" height="700">
      ${reveal('M132 -65 V350 Q132 392 180 392 H280', 110, p.firstStem)}
    </mask>
    <mask id="second-t" maskUnits="userSpaceOnUse" x="-80" y="-80" width="650" height="700">
      ${reveal('M186 186 C197 230 239 263 279 263 H525', 100, p.receive)}
      ${reveal('M324 263 V75', 110, p.secondTop)}
    </mask>
    <mask id="second-foot" maskUnits="userSpaceOnUse" x="-80" y="-80" width="650" height="700">
      ${reveal('M323 302 V417 Q323 464 376 464 H508', 110, p.secondFoot)}
    </mask>
  </defs>
  <rect width="1920" height="1080" fill="#fbfaf8"/>
  <g transform="translate(${p.x} ${p.y}) scale(${p.scale})">
    ${piece(0, 'first-t', Math.min(p.firstStem, p.firstLeft, p.firstGive) === 1)}
    ${piece(2, 'first-foot', p.firstStem === 1)}
    ${piece(1, 'second-t', Math.min(p.receive, p.secondTop) === 1)}
    ${piece(3, 'second-foot', p.secondFoot === 1)}
  </g>
  <g transform="translate(686.625 534) scale(.135)" opacity="${p.wordmark}">${wordmarkArtwork}</g>
  <text x="960" y="843" text-anchor="middle" font-family="Quicksand, sans-serif" font-size="34" font-weight="500" fill="#3B2A21" opacity="${p.tagline}">Stories woven together.</text>
  </svg>`;
}
