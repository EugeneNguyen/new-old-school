import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number | string;
  className?: string;
  variant?: 'full' | 'icon'; // 'icon' is monogram variant for small sizes
}

export function Logo({ size = 32, className = '', variant = 'full' }: LogoProps) {
  const numSize = typeof size === 'string' ? parseInt(size) : size;

  // Use monogram variant for small sizes (favicon)
  if (variant === 'icon' || numSize <= 20) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn('text-primary', className)}
      >
        {/* Rounded rectangle background */}
        <rect
          width="32"
          height="32"
          rx="8"
          fill="currentColor"
        />
        {/* "n" monogram in white */}
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="white"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          n
        </text>
      </svg>
    );
  }

  // Full "nos" text variant for larger sizes
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-primary', className)}
    >
      {/* Rounded rectangle background */}
      <rect
        width="80"
        height="80"
        rx="16"
        fill="currentColor"
      />
      {/* "nos" text in white */}
      <text
        x="40"
        y="56"
        textAnchor="middle"
        fontSize="40"
        fontWeight="700"
        fill="white"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        nos
      </text>
    </svg>
  );
}
