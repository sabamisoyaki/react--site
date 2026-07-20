"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

const NAV_ITEMS = [
  { label: "みつける", href: "/" },
  { label: "マイビデオ", href: "/my_video" },
  { label: "マイリスト", href: "/playlists" },
];

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SearchForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // 検索結果ページを開いたとき、検索欄に現在の検索語を表示する
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");

  const handleSearch = () => {
    const q = searchText.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border-2 border-ink bg-white py-1.5 pr-1.5 pl-4 sm:max-w-xs">
      <input
        type="search"
        placeholder="作品・シーンをさがす"
        aria-label="作品・シーンをさがす"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-muted"
        value={searchText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        onClick={handleSearch}
        aria-label="検索"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-chip hover:text-ink"
      >
        <SearchIcon />
      </button>
    </div>
  );
}

function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリック・Escape キーで閉じる
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (status === "loading") {
    return <div className="h-9 w-9 rounded-full border-2 border-ink/20" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded-full bg-accent px-4 py-2 text-[13px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong"
        onClick={() => signIn("google")}
      >
        ログイン
      </button>
    );
  }

  const displayName = session.user.name ?? session.user.email ?? "ユーザー";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        className="grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-ink bg-marker text-[14px] font-extrabold hover:bg-marker-strong"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} のメニュー`}
        onClick={() => setOpen((v) => !v)}
      >
        {session.user.image ? (
          <Image src={session.user.image} alt="" width={36} height={36} />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          className="absolute top-11 right-0 z-50 min-w-48 rounded-xl border-2 border-ink bg-white py-2 shadow-sticker"
          role="menu"
        >
          <div className="truncate border-ink/10 border-b px-4 pb-2 font-extrabold text-[13.5px]">
            {displayName}
          </div>
          <Link
            href="/account"
            className="block px-4 py-2 text-[13.5px] font-bold hover:bg-chip"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            アカウント
          </Link>
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-[13.5px] font-bold hover:bg-chip"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            ダッシュボード
          </Link>
          <button
            type="button"
            className="block w-full cursor-pointer px-4 py-2 text-left text-[13.5px] font-bold text-accent hover:bg-chip"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="メインナビゲーション" className="flex gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-extrabold text-white"
                : "rounded-full px-3.5 py-1.5 text-[13px] font-bold text-ink-muted hover:text-ink"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-ink border-b-2 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:px-8">
        <Link href="/" className="shrink-0 text-[17px] font-black">
          サブスク<span className="marker">切り抜き</span>
        </Link>
        <NavLinks />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 max-sm:order-last max-sm:basis-full">
          <Suspense
            fallback={
              <div className="h-9 flex-1 rounded-full border-2 border-ink/20 sm:max-w-xs" />
            }
          >
            <SearchForm />
          </Suspense>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
