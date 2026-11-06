import Image from "next/image";
import { MARK_BLUE, marketingUrl, productName } from "@/lib/brand";

export function BuiltWith({ placement = "fixed" }: { placement?: "fixed" | "inline" | "contained" }) {
  return (
    <a
      href={marketingUrl()}
      className={
        placement === "fixed"
          ? "fixed right-4 bottom-4 z-40 hidden items-center gap-1.5 rounded-control border border-border bg-white px-3 py-1.5 text-xs text-foreground md:inline-flex dark:bg-card"
          : placement === "contained"
            ? "inline-flex items-center gap-1.5 self-start rounded-control border border-border bg-white px-3 py-1.5 text-xs text-foreground dark:bg-card"
            : "inline-flex items-center gap-1.5 self-start rounded-control border border-border bg-white px-3 py-1.5 text-xs text-foreground md:hidden dark:bg-card"
      }
    >
      <Image
        src={MARK_BLUE}
        alt=""
        width={18}
        height={18}
        className="size-[18px] [object-view-box:inset(22%)]"
      />
      Built with {productName()}
    </a>
  );
}
