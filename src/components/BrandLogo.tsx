import Image from 'next/image';

export default function BrandLogo({ compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <Image
      src="/shakenstyle-logo-site.png"
      alt="SHAKENSTYLE - Design, Build & Execute"
      width={2048}
      height={2047}
      className={compact ? 'brandLogoImage brandLogoImageCompact' : 'brandLogoImage'}
      priority
    />
  );
}
