import Image from 'next/image';

export default function BrandLogo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <Image
      src={dark ? '/shakenstyle-logo-dark.svg' : '/shakenstyle-logo-light.svg'}
      alt="SHAKENSTYLE"
      width={compact ? 148 : 176}
      height={36}
      className="brandLogoImage"
      priority
    />
  );
}
