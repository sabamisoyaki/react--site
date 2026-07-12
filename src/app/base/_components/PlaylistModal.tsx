"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

type PlaylistOption = {
  id: number;
  name: string;
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";

export default function PlaylistModal({
  isOpen,
  onClose,
  clipId,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  clipId: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [name, setName] = useState("");
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 既存プレイリスト取得
  useEffect(() => {
    if (!isOpen) return;
    setLoadState("loading");
    setErrorMessage("");
    (async () => {
      try {
        const res = await fetch("/api/v1/me/playlists");
        if (res.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPlaylists(data.data ?? []);
        setLoadState("ready");
      } catch {
        setLoadState("error");
      }
    })();
  }, [isOpen]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // 新規作成 ＋ clip 追加
  const createPlaylist = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/v1/me/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const playlist = await res.json();

      const addRes = await fetch(`/api/v1/playlists/${playlist.id}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
      });
      if (!addRes.ok) throw new Error(`HTTP ${addRes.status}`);

      onClose();
      router.push(`/playlists/${playlist.id}`);
    } catch {
      setErrorMessage(
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        "プレイリストを作成できませんでした。時間をおいて再度お試しください。",
      );
      setSubmitting(false);
    }
  };

  // 既存プレイリストに追加
  const addToPlaylist = async (playlistId: string) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/v1/playlists/${playlistId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onClose();
      router.push(`/playlists/${playlistId}`);
    } catch {
      setErrorMessage(
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        "プレイリストに追加できませんでした。時間をおいて再度お試しください。",
      );
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: 背景クリックで閉じる補助操作。キーボードは Escape で代替している。
    // biome-ignore lint/a11y/noStaticElementInteractions: 同上。
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上。
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="modal-title" id={titleId}>
          プレイリストに追加
        </h2>

        {loadState === "unauthorized" ? (
          <p>
            プレイリストを使うにはログインが必要です。
            <br />
            ヘッダーの「ログイン」からログインしてください。
          </p>
        ) : (
          <>
            {/* 新規作成 */}
            <div>
              <h3 className="section-title">新しいプレイリストを作成</h3>
              <div className="modal-field-row">
                <input
                  type="text"
                  placeholder="プレイリスト名"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createPlaylist();
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={createPlaylist}
                  disabled={!name.trim() || submitting}
                >
                  {/* biome-ignore lint/security/noSecrets: Japanese UI label is a false positive. */}
                  {submitting ? "作成中…" : "作成"}
                </button>
              </div>
            </div>

            <hr className="modal-divider" />

            {/* 既存プレイリスト */}
            <div>
              <h3 className="section-title">既存のプレイリストに追加</h3>
              {loadState === "loading" && (
                <p className="pager-info">読み込み中…</p>
              )}
              {loadState === "error" && (
                <p className="form-error">
                  プレイリストを読み込めませんでした。
                </p>
              )}
              {loadState === "ready" && (
                <div className="modal-list">
                  {playlists.length === 0 && (
                    <p className="pager-info">まだプレイリストがありません</p>
                  )}
                  {playlists.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="modal-list-item"
                      onClick={() => addToPlaylist(String(p.id))}
                      disabled={submitting}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {errorMessage && <p className="form-error">{errorMessage}</p>}

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
