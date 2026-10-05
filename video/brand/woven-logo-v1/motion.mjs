// Shared deterministic choreography for Remotion and HyperFrames.
export const DURATION = 10;
export const FPS = 30;
export const MOTION = [
  {id:'intro-threads',attr:'opacity',from:0,to:1,start:0,duration:.45,ease:'sine.inOut'},
  {id:'intro-threads',attr:'opacity',from:1,to:0,start:4.4,duration:.9,ease:'sine.inOut'},
  {id:'loose-a',attr:'stroke-dashoffset',from:1000,to:0,start:.1,duration:3.5,ease:'power2.inOut'},
  {id:'loose-b',attr:'stroke-dashoffset',from:1000,to:0,start:.35,duration:3.8,ease:'power2.inOut'},
  {id:'reveal-0',attr:'stroke-dashoffset',from:1000,to:0,start:.7,duration:1.9,ease:'power2.inOut'},
  {id:'reveal-1',attr:'stroke-dashoffset',from:1000,to:0,start:1.05,duration:2.25,ease:'power2.inOut'},
  {id:'reveal-2',attr:'stroke-dashoffset',from:1000,to:0,start:1.85,duration:2.4,ease:'power2.inOut'},
  {id:'reveal-3',attr:'stroke-dashoffset',from:1000,to:0,start:2.15,duration:1.7,ease:'power2.inOut'},
  {id:'reveal-4',attr:'stroke-dashoffset',from:1000,to:0,start:2.2,duration:2.2,ease:'power2.inOut'},
  {id:'reveal-5',attr:'stroke-dashoffset',from:1000,to:0,start:3.05,duration:1.85,ease:'power2.inOut'},
  {id:'mark-camera',attr:'transform',from:'translate(627 164) scale(1.42)',to:'translate(453 344) scale(.64)',start:4.4,duration:2.3,ease:'power3.inOut'},
  {id:'word-reveal',attr:'transform',from:'translate(-4350 0)',to:'translate(0 0)',start:5.0,duration:1.8,ease:'power2.inOut'},
  {id:'wordmark-group',attr:'opacity',from:0,to:1,start:5.15,duration:.7,ease:'sine.inOut'},
  {id:'tagline',attr:'opacity',from:0,to:1,start:6.65,duration:.9,ease:'sine.inOut'},
  {id:'tagline',attr:'transform',from:'translate(0 14)',to:'translate(0 0)',start:6.65,duration:.9,ease:'power2.out'},
];
const clamp=(v)=>Math.max(0,Math.min(1,v));
function ease(p,name){
 if(name==='sine.inOut')return -(Math.cos(Math.PI*p)-1)/2;
 if(name==='power2.out')return 1-Math.pow(1-p,3);
 const power=name==='power3.inOut'?4:3;
 return p<.5?Math.pow(2*p,power)/2:1-Math.pow(2-2*p,power)/2;
}
function mix(a,b,p){
 if(typeof a==='number')return a+(b-a)*p;
 const nums=a.match(/-?\d*\.?\d+/g).map(Number); let i=0;
 return b.replace(/-?\d*\.?\d+/g,n=>String(nums[i]+(Number(n)-nums[i++])*p));
}
export function motionValue(id,attr,time,defaultValue){
 const tracks=MOTION.filter(t=>t.id===id&&t.attr===attr);
 let value=tracks.length?tracks[0].from:defaultValue;
 for(const t of tracks){if(time<t.start)break;value=mix(t.from,t.to,ease(clamp((time-t.start)/t.duration),t.ease));}
 return value;
}
