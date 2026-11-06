import Image from "next/image";
import Link from "next/link";
import { LOCKUP_BLACK, LOCKUP_WHITE, MARK_BLACK, MARK_WHITE, productName } from "@/lib/brand";

const lockupFrame = "h-8 w-auto max-w-[11rem] [object-view-box:inset(31%_12%_31%_12%)]";
const markFrame = "[object-view-box:inset(20%)]";

export function BrandLockup({ href = "/dashboard" }: { href?: string }) {
  const name = productName();
  return (
    <Link href={href} className="inline-flex max-w-full items-center">
      <Image
        src={LOCKUP_BLACK}
        alt={name}
        width={176}
        height={32}
        priority
        className={`${lockupFrame} dark:hidden`}
      />
      <Image
        src={LOCKUP_WHITE}
        alt=""
        width={176}
        height={32}
        priority
        className={`${lockupFrame} hidden dark:block`}
      />
    </Link>
  );
}

export function BrandMark({ size = 36 }: { size?: number }) {
  const name = productName();
  return (
    <span className="inline-flex" style={{ width: size, height: size }}>
      <Image
        src={MARK_BLACK}
        alt={name}
        width={size}
        height={size}
        priority
        className={`${markFrame} size-full dark:hidden`}
      />
      <Image
        src={MARK_WHITE}
        alt=""
        width={size}
        height={size}
        priority
        className={`${markFrame} hidden size-full dark:block`}
      />
    </span>
  );
}
