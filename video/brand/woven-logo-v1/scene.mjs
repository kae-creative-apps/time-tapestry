import {markArtwork,wordmarkArtwork} from './artwork.mjs';
import {motionValue} from './motion.mjs';

// Every visible fiber is clipped to the approved icon, preserving its contours.
export function wovenSvg(time=10){
 const pieces=markArtwork.match(/<path[^>]+\/>/g);
 const attr=(id,name,fallback)=>`${name}="${motionValue(id,name,time,fallback)}"`;
 const reveal=(id,d,width)=>`<path id="${id}" d="${d}" pathLength="1000" fill="none" stroke="white" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1000 1000" ${attr(id,'stroke-dashoffset',0)}/>`;
 const bundle=(id,d)=>`<g id="${id}" pathLength="1000" stroke-dasharray="1000 1000" ${attr(id,'stroke-dashoffset',0)} fill="none" stroke-linecap="round">
 <path d="${d}" pathLength="1000" stroke="#3B2A21" stroke-width="7.3" opacity=".12" transform="translate(0 4)"/>
 <path d="${d}" pathLength="1000" stroke="#6A5747" stroke-width="5.1"/>
 <path d="${d}" pathLength="1000" stroke="#B98B74" stroke-width="1.2" transform="translate(0 -1.4)"/>
 <path d="${d}" pathLength="1000" stroke="#fbfaf8" stroke-width=".5" transform="translate(0 -2.1)" opacity=".8"/>
 <path d="${d}" pathLength="1000" stroke="#3B2A21" stroke-width=".7" transform="translate(0 1.2)"/>
 </g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-label="Threads weaving into the Time Tapestry logo">
 <defs>
 <radialGradient id="paper-light" cx=".5" cy=".43" r=".65"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#fbfaf8"/></radialGradient>
 <linearGradient id="warp-shade" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#3B2A21"/><stop offset=".34" stop-color="#927c68"/><stop offset=".55" stop-color="#6A5747"/><stop offset="1" stop-color="#35261f"/></linearGradient>
 <linearGradient id="weft-shade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#3B2A21"/><stop offset=".26" stop-color="#8a7460"/><stop offset=".46" stop-color="#6A5747"/><stop offset=".85" stop-color="#493429"/><stop offset="1" stop-color="#30231d"/></linearGradient>
 <linearGradient id="silk-shine" x1="0" x2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <pattern id="woven-fibers" width="10" height="10" patternUnits="userSpaceOnUse">
 <rect width="10" height="10" fill="#3B2A21"/>
 <rect x=".7" y="0" width="3.9" height="10" rx="1.8" fill="url(#warp-shade)"/>
 <rect x="5.7" y="0" width="3.9" height="10" rx="1.8" fill="url(#warp-shade)"/>
 <path d="M2 0v10M7 0v10" stroke="#b39a80" stroke-width=".35" opacity=".5"/>
 <rect x="0" y=".5" width="5" height="4.2" rx="1.9" fill="url(#weft-shade)"/>
 <rect x="5" y="5.5" width="5" height="4.2" rx="1.9" fill="url(#weft-shade)"/>
 <path d="M.8 1.8h3.4M5.8 6.8h3.4" stroke="#bda88f" stroke-width=".4" opacity=".65"/>
 <path d="M.8 3.7h3.4M5.8 8.7h3.4" stroke="#2b201b" stroke-width=".45" opacity=".55"/>
 </pattern>
 <pattern id="paper-weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1h6M1 0v6" stroke="#6A5747" stroke-width=".4" opacity=".04"/></pattern>
 <filter id="thread-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.3" stdDeviation="1.8" flood-color="#3B2A21" flood-opacity=".2"/></filter>
 ${pieces.map((p,i)=>`<clipPath id="approved-icon-${i}">${p}</clipPath>`).join('')}
 ${[
 [reveal('reveal-0','M132 -35 L132 157',100),reveal('reveal-1','M-35 151 L183 151 Q236 151 267 213',110)],
 [reveal('reveal-3','M324 95 L324 263',105),reveal('reveal-4','M174 184 C210 220 240 263 278 263 L494 263',105)],
 [reveal('reveal-2','M132 180 L132 350 Q132 391 181 391 L271 391',106)],
 [reveal('reveal-5','M323 298 L323 416 Q323 464 370 464 L480 464',110)]
 ].map((paths,i)=>`<mask id="thread-growth-${i}" maskUnits="userSpaceOnUse" x="-30" y="-40" width="540" height="580">${paths.join('')}</mask>`).join('')}
 <mask id="word-growth" maskUnits="userSpaceOnUse" x="0" y="0" width="4350" height="1900"><rect id="word-reveal" ${attr('word-reveal','transform','translate(0 0)')} width="4350" height="1900" fill="white"/></mask>
 </defs>
 <rect width="1920" height="1080" fill="url(#paper-light)"/>

 <g id="mark-camera" ${attr('mark-camera','transform','translate(453 344) scale(.64)')}>
 <g id="intro-threads" ${attr('intro-threads','opacity',0)}>
 ${bundle('loose-a','M-540 265 C-380 265 -230 94 -87 114 C12 128 52 210 83 143 C123 53 133 -23 132 38 L132 139')}
 ${bundle('loose-b','M920 92 C709 45 633 430 474 390 C395 370 365 268 420 231 C483 188 529 280 450 302 C411 313 354 264 324 233 L324 159')}
 </g>
 <g filter="url(#thread-shadow)">
 ${pieces.map((_,i)=>`<g clip-path="url(#approved-icon-${i})" mask="url(#thread-growth-${i})"><rect x="-10" y="-10" width="500" height="550" fill="url(#woven-fibers)"/>
 <path d="M129 0V150H0M324 124V265H461M132 199V356Q132 393 183 393H240M323 312V423Q323 467 380 467H451" fill="none" stroke="#B98B74" stroke-width="1" opacity=".55"/>
 <path d="M136 0V150H0M329 124V265H461M137 199V356Q137 388 183 388H240M328 312V423Q328 462 380 462H451" fill="none" stroke="#fbfaf8" stroke-width=".55" opacity=".4"/>
 </g>`).join('')}
 </g></g>
 <g id="wordmark-group" transform="translate(815 347) scale(.162)" ${attr('wordmark-group','opacity',1)} mask="url(#word-growth)">${wordmarkArtwork}</g>
 <g id="tagline" ${attr('tagline','opacity',1)} ${attr('tagline','transform','translate(0 0)')}><text x="960" y="777" text-anchor="middle" fill="#3B2A21" font-family="Quicksand, sans-serif" font-size="40" font-weight="500" letter-spacing=".1">Stories woven together.</text></g>
 </svg>`;
}
