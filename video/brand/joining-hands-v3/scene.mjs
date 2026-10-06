import {markArtwork, wordmarkArtwork} from '../woven-logo-v1/artwork.mjs';
import {pose} from './motion.mjs';

const pieces = markArtwork.match(/<path[^>]+\/>/g);
const smooth = (n) => {
  const p = Math.max(0, Math.min(1, n));
  return p * p * (3 - 2 * p);
};

// The two crossbar ends can reach while their stems stay anchored. At rest,
// return the exact source tag, without serialization or contour changes.
export function reachArm(tag, side, amount) {
  if (amount === 0) return tag;
  const path = tag.match(/d="([^"]+)"/)[1];
  const [tx] = tag.match(/translate\(([^)]+)\)/)[1].split(/[ ,]+/).map(Number);
  const tokens = path.match(/[A-Za-z]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g);
  const result = [];
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (/^[A-Za-z]$/.test(token)) {
      if (!['M', 'C', 'Z'].includes(token)) throw new Error('Unsupported approved logo path command');
      result.push(token);
      i++;
      continue;
    }
    const x = Number(tokens[i++]);
    const y = Number(tokens[i++]);
    const weight = side === 'first' ? smooth((x + tx - 174) / 71) : smooth((282 - x - tx) / 64);
    const direction = side === 'first' ? 1 : -1;
    result.push(String(x + direction * 12 * weight * amount), String(y - direction * 1.5 * weight * amount));
  }
  return tag.replace(`d="${path}"`, `d="${result.join(' ')}"`);
}

export function joiningHandsSvg(time = 7) {
  const p = pose(time);
  const first = reachArm(pieces[0], 'first', p.reach);
  const second = reachArm(pieces[1], 'second', p.reach);
  // A temporary paper seam makes the over/under clasp readable as the ends
  // interlace. It disappears before the exact approved final silhouette holds.
  const handSeam = first.replace('fill="#3B2A21"', 'fill="none"').replace('/>', ` stroke="#fbfaf8" stroke-width="7" stroke-linejoin="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="Two Time Tapestry t forms reach, join hands, and settle into the stitch">
  <defs><clipPath id="hand-contact"><rect x="180" y="170" width="130" height="130"/></clipPath></defs>
  <rect width="1920" height="1080" fill="#fbfaf8"/>
  <g transform="translate(${p.x} ${p.y}) scale(${p.scale})" opacity="${p.visible}">
    <g transform="translate(${p.firstX} ${p.firstY})">${pieces[2]}</g>
    <g transform="translate(${p.secondX} ${p.secondY})">${second}${pieces[3]}</g>
    ${p.seam > 0 ? `<g transform="translate(${p.firstX} ${p.firstY})" clip-path="url(#hand-contact)" opacity="${p.seam}">${handSeam}</g>` : ''}
    <g transform="translate(${p.firstX} ${p.firstY})">${first}</g>
  </g>
  <g transform="translate(686.625 534) scale(.135)" opacity="${p.wordmark}">${wordmarkArtwork}</g>
  <text x="960" y="843" text-anchor="middle" font-family="Quicksand, sans-serif" font-size="34" font-weight="500" fill="#3B2A21" opacity="${p.tagline}">Stories woven together.</text>
  </svg>`;
}
