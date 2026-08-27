/**
 * Raw design tokens — the same palette encoded in tailwind.config.js, exported
 * for places className can't reach (SVG strokes/fills, gradients, status bar).
 */
export const colors = {
  paper: '#F5F1E8',
  paperRaised: '#FFFCF5',
  sand: '#E9E2D2',
  sandDeep: '#E4DCCB',
  sage: '#7A8B6F',
  sageDark: '#63735A',
  ink: '#2E2B26',
  inkStrong: '#26241F',
  // common translucent inks used for hairlines / muted text
  ink60: 'rgba(46,43,38,0.6)',
  ink50: 'rgba(46,43,38,0.5)',
  ink45: 'rgba(46,43,38,0.45)',
  ink40: 'rgba(46,43,38,0.4)',
  ink18: 'rgba(46,43,38,0.18)',
  ink10: 'rgba(46,43,38,0.1)',
  sageWash: 'rgba(122,139,111,0.16)',
} as const;

export const fonts = {
  spectral: 'Spectral_400Regular',
  spectralMedium: 'Spectral_500Medium',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemibold: 'InstrumentSans_600SemiBold',
} as const;
