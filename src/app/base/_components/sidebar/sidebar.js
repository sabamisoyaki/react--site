"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarData } from "./sidebarData";

function isActive(pathname, link) {
  if (link === "/") return pathname === "/";
  return pathname === link || pathname.startsWith(`${link}/`);
}

function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション">
      <Link href="/" className="sidebar-brand">
        サブスク切り抜き
      </Link>
      <ul className="sidebarList">
        {SidebarData.map((value) => (
          <li key={value.link}>
            <Link
              href={value.link}
              className="row"
              aria-current={isActive(pathname, value.link) ? "page" : undefined}
            >
              <span className="icon">{value.icon}</span>
              <span className="title">{value.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Sidebar;
