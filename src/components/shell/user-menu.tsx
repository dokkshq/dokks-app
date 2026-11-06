"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  ChartNoAxesColumn,
  Monitor,
  Moon,
  Shield,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useTheme } from "@/components/theme/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/lib/theme";
import { initialsFor } from "@/lib/profile/avatar";

export type MenuUser = {
  login: string;
  name: string | null;
  imageUrl: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
};

const themeOptions: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="px-1.5 py-1">
      <div
        role="group"
        aria-label="Theme"
        className="grid grid-cols-3 gap-0.5 rounded-control bg-muted p-0.5"
      >
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-label={option.label}
              aria-pressed={active}
              title={option.label}
              className={cn(
                "flex h-7 items-center justify-center rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SignOutItem() {
  const { pending } = useFormStatus();
  return (
    <DropdownMenuItem
      disabled={pending}
      variant="destructive"
      render={<button type="submit" className="w-full text-left" />}
    >
      {pending ? "Signing out..." : "Sign out"}
    </DropdownMenuItem>
  );
}

export function UserMenu({
  user,
  side = "bottom",
  align = "end",
  fullWidth = false,
}: {
  user: MenuUser;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  fullWidth?: boolean;
}) {
  const avatar = user.imageUrl || user.avatarUrl || "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn("h-9 gap-2 px-1.5", fullWidth ? "w-full justify-start pr-2" : "pr-3")}
          >
            <Avatar size="sm">
              {avatar ? <AvatarImage src={avatar} alt="" /> : null}
              <AvatarFallback>{initialsFor(user.name, user.login)}</AvatarFallback>
            </Avatar>
            <span className={cn("truncate text-sm", fullWidth ? "min-w-0 flex-1 text-left" : "max-w-32")}>
              {user.name || user.login}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.name || user.login}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserRound />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/dashboard/usage" />}>
          <ChartNoAxesColumn />
          Usage
        </DropdownMenuItem>
        {user.role === "ADMIN" ? (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <Shield />
            Admin
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <ThemeSwitcher />
        <DropdownMenuSeparator />
        <form action="/api/auth/sign-out" method="post">
          <SignOutItem />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
