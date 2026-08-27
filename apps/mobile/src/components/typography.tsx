import { Platform, Text, type TextProps } from 'react-native';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Props = TextProps & { className?: string };

/** Small uppercase monospace label — the design's "overline". */
export function Overline({ className = '', style, ...props }: Props & { tint?: 'sage' | 'muted' | 'light' }) {
  const tint = props.tint ?? 'muted';
  const color = tint === 'sage' ? 'text-sage' : tint === 'light' ? 'text-paper/70' : 'text-ink/45';
  return (
    <Text
      {...props}
      className={`text-[11px] uppercase ${color} ${className}`}
      style={[{ fontFamily: mono, letterSpacing: 1.6 }, style]}
    />
  );
}

/** Small monospace caption (not uppercase) — used for metadata like "60 m". */
export function Mono({ className = '', style, ...props }: Props) {
  return (
    <Text
      {...props}
      className={`text-[11px] ${className}`}
      style={[{ fontFamily: mono, letterSpacing: 0.2 }, style]}
    />
  );
}

/** Spectral serif display/heading text. */
export function Serif({ className = '', ...props }: Props) {
  return <Text {...props} className={`font-spectral text-ink-strong ${className}`} />;
}
