// The Digital Target mark: four right triangles, one in each quarter of a square.
// Drawn as SVG so it stays sharp at any size and can pop in triangle by triangle
// (DT Retail splash). `currentColor` fills it; the caller picks the colour.
interface Props {
  size?: number;
  className?: string;
  /** Pop the triangles in one after another (the splash). */
  animate?: boolean;
}

const TRIANGLES = ['0,0 1,0 1,1', '1,0 2,0 2,1', '0,1 1,1 1,2', '1,1 2,1 2,2'];

export default function DtMark({ size = 48, className, animate = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2 2"
      role="img"
      aria-label="Digital Target"
      className={className}
      fill="currentColor"
    >
      {TRIANGLES.map((points, i) => (
        <polygon
          key={points}
          points={points}
          className={animate ? 'dtr-mark-tri' : undefined}
          style={animate ? { animationDelay: `${0.1 + i * 0.2}s`, transformOrigin: `${i % 2 ? 1.5 : 0.5}px ${i > 1 ? 1.5 : 0.5}px`, transformBox: 'view-box' as never } : undefined}
        />
      ))}
    </svg>
  );
}
