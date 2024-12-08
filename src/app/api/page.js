"use client";

import { useState, useEffect } from "react";

export default function Page() {
  // APIのURL
  const apiUrl = "";//URLを指定

  // ステートでデータとエラーメッセージを管理
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // データを取得する関数
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTPエラー! ステータスコード: ${response.status}`);
        }
        const json = await response.json();
        setData(json); // データをステートに保存
      } catch (err) {
        setError(err.message); // エラーメッセージをステートに保存
      }
    };

    fetchData();
  }, []); // 初回レンダリング時のみ実行

  return (
    <div>
      <h1>APIデータ取得</h1>
      {error ? (
        <p style={{ color: "red" }}>エラーが発生しました: {error}</p>
      ) : data ? (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      ) : (
        <p>データを取得中...</p>
      )}
    </div>
  );
}
