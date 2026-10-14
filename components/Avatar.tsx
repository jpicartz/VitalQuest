import React from 'react';
import { VitalityState, BuildState, VitalityBand, BuildTone } from '../utils/avatar';

/**
 * The character drawing.
 *
 * Deliberately a single inline SVG with no art assets: every visual difference
 * is a number derived from the state, so the character is one shape that
 * *deforms* rather than five pictures that swap. That is what makes it read as
 * reactive instead of as a mood icon.
 *
 * Vitality drives posture, colour and the aura. Build drives shoulder width and
 * limb thickness — and nothing drives belly size, because nothing here is
 * allowed to depict the user as fat for eating (see utils/avatar.ts).
 */

interface AvatarFigureProps {
  vitality: VitalityState;
  build: BuildState;
  /** Pixel height. The viewBox is fixed, so this just scales. */
  size?: number;
}

/** How upright the character stands, 0 = slumped, 1 = tall. */
const POSTURE: Record<VitalityBand, number> = {
  depleted: 0, resting: 0.3, steady: 0.6, energised: 0.85, radiant: 1,
};

/** Skin/figure fill per band — grey when depleted, warm and bright when thriving. */
const FIGURE_FILL: Record<VitalityBand, string> = {
  depleted: 'rgb(148 163 184)',
  resting: 'rgb(161 161 170)',
  steady: 'rgb(132 204 142)',
  energised: 'rgb(74 190 110)',
  radiant: 'rgb(34 197 94)',
};

/** Shoulder half-width in viewBox units. Build only. */
const SHOULDER: Record<BuildTone, number> = { soft: 15, lean: 17, toned: 21, strong: 25 };
/** Limb stroke width. Build only. */
const LIMB: Record<BuildTone, number> = { soft: 5, lean: 5.5, toned: 7, strong: 8.5 };

export const AvatarFigure: React.FC<AvatarFigureProps> = ({ vitality, build, size = 200 }) => {
  const p = POSTURE[vitality.band];
  const fill = FIGURE_FILL[vitality.band];
  const shoulder = SHOULDER[build.tone];
  const limb = LIMB[build.tone];

  // Slumping lowers the head and rounds the spine. One interpolation drives
  // head position, spine curve and arm angle together, so the pose stays
  // coherent at every intermediate value rather than only at the five bands.
  const headY = 30 + (1 - p) * 10;
  const spineTopY = headY + 14;
  const spineBottomY = 104;
  const spineBend = (1 - p) * 9;          // px of forward lean in the torso
  const armDrop = 14 + (1 - p) * 12;      // how far the hands hang
  const armOut = 8 + p * 9;               // how far the elbows swing out

  const auraOpacity = vitality.band === 'radiant' ? 0.3
    : vitality.band === 'energised' ? 0.18 : 0;

  return (
    <svg
      viewBox="0 0 120 160"
      width={size * 0.75}
      height={size}
      role="img"
      aria-label={`Character at ${vitality.band} vitality and ${build.tone} build`}
      className="overflow-visible"
    >
      {/* Aura only at the top two bands, so it reads as earned. */}
      {auraOpacity > 0 && (
        <circle cx="60" cy="70" r="52" fill={fill} opacity={auraOpacity}>
          <animate attributeName="r" values="48;56;48" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values={`${auraOpacity};${auraOpacity * 0.45};${auraOpacity}`} dur="3s" repeatCount="indefinite" />
        </circle>
      )}

      <g
        fill="none"
        stroke={fill}
        strokeWidth={limb}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'stroke 600ms ease, stroke-width 600ms ease' }}
      >
        {/* Head */}
        <circle cx="60" cy={headY} r="12" fill={fill} stroke="none"
          style={{ transition: 'fill 600ms ease, cy 600ms ease' }} />

        {/* Spine — quadratic so the slump is a curve, not a tilt */}
        <path d={`M 60 ${spineTopY} Q ${60 + spineBend} ${(spineTopY + spineBottomY) / 2} 60 ${spineBottomY}`}
          style={{ transition: 'd 600ms ease' }} />

        {/* Shoulders */}
        <path d={`M ${60 - shoulder} ${spineTopY + 10} L ${60 + shoulder} ${spineTopY + 10}`}
          style={{ transition: 'd 600ms ease' }} />

        {/* Arms */}
        <path d={`M ${60 - shoulder} ${spineTopY + 10} Q ${60 - shoulder - armOut} ${spineTopY + 10 + armDrop * 0.6} ${60 - shoulder - armOut * 0.4} ${spineTopY + 10 + armDrop}`}
          style={{ transition: 'd 600ms ease' }} />
        <path d={`M ${60 + shoulder} ${spineTopY + 10} Q ${60 + shoulder + armOut} ${spineTopY + 10 + armDrop * 0.6} ${60 + shoulder + armOut * 0.4} ${spineTopY + 10 + armDrop}`}
          style={{ transition: 'd 600ms ease' }} />

        {/* Legs — stance widens slightly with posture, which reads as planted */}
        <path d={`M 60 ${spineBottomY} L ${60 - 11 - p * 3} 142`} style={{ transition: 'd 600ms ease' }} />
        <path d={`M 60 ${spineBottomY} L ${60 + 11 + p * 3} 142`} style={{ transition: 'd 600ms ease' }} />
      </g>
    </svg>
  );
};
