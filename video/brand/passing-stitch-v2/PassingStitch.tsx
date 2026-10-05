import React from 'react';
import {AbsoluteFill, Composition, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {passingStitchSvg} from './scene.mjs';

export const PassingStitch: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill style={{backgroundColor: '#fbfaf8'}}>
    <style>{`@font-face{font-family:Quicksand;src:url('${staticFile('brand/fonts/quicksand-latin.woff2')}') format('woff2');font-weight:300 700;font-display:block}`}</style>
    <div style={{width: '100%', height: '100%'}} dangerouslySetInnerHTML={{__html: passingStitchSvg(frame / fps)}} />
  </AbsoluteFill>;
};

export const PassingStitchRoot: React.FC = () => <Composition
  id="TimeTapestryPassingStitch"
  component={PassingStitch}
  width={1920}
  height={1080}
  fps={30}
  durationInFrames={195}
/>;
