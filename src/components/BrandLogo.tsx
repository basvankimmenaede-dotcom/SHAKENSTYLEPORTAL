import Image from 'next/image';

export default function BrandLogo({ compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <Image
      src="/shakenstyle-logo-dbe.png"
      alt="SHAKENSTYLE - Design, Build & Execute"
      width={compact ? 250 : 320}
      height={compact ? 70 : 90}
      className="brandLogoImage"
      priority
    />
  );
}
