"use client";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import SearchIcon from "@mui/icons-material/Search";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

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
    <div className="search-bar">
      <input
        type="search"
        placeholder="クリップ・プレイリストを検索"
        aria-label="クリップ・プレイリストを検索"
        value={searchText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        onClick={handleSearch}
        className="search-icon"
        aria-label="検索"
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
    return (
      <div className="user-menu">
        <div className="avatar-button" aria-hidden="true" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="user-menu">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => signIn("google")}
        >
          <AccountCircleIcon fontSize="small" />
          ログイン
        </button>
      </div>
    );
  }

  const displayName = session.user.name ?? session.user.email ?? "ユーザー";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} のメニュー`}
        onClick={() => setOpen((v) => !v)}
      >
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: "50%" }}
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-name">{displayName}</div>
          <Link
            href="/account"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            アカウント
          </Link>
          <Link
            href="/dashboard"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            ダッシュボード
          </Link>
          <button
            type="button"
            className="user-menu-item is-danger"
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

export default function HeadSearch() {
  return (
    <header className="header">
      <h1 className="header-title">サブスク切り抜き</h1>
      <Suspense
        fallback={
          <div className="search-bar">
            <input
              type="search"
              placeholder="クリップ・プレイリストを検索"
              disabled
            />
          </div>
        }
      >
        <SearchForm />
      </Suspense>
      <UserMenu />
    </header>
  );
}
