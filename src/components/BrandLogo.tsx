import Image from 'next/image';

export default function BrandLogo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const classes = [
    'brandLogoImage',
    compact ? 'brandLogoImageCompact' : '',
    dark ? 'brandLogoImageDark' : 'brandLogoImageLight',
  ].filter(Boolean).join(' ');

  return (
    <Image
      src="/shakenstyle-logo-site.png"
      alt="SHAKENSTYLE - Design, Build & Execute"
      width={1129}
      height={212}
      className={classes}
      priority
    />
  );
}
