import React, { useState ,useEffect} from "react";
import Clip from '@/app/base/clip/clipData';

export default function ClipList({ clipApiUrl }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
  
    useEffect(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          const response = await fetch(clipApiUrl);
          if (!response.ok) {
            throw new Error(`HTTPエラー! ステータスコード: ${response.status}`);
          }
  
          const text = await response.text();
          if (!text) {
            throw new Error("レスポンスが空です");
          }
  
          try {
            const json = JSON.parse(text);
            setData(json);
          } catch {
            throw new Error("レスポンスが有効なJSONではありません");
          }
        } catch (err) {
          console.error("データ取得エラー:", err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }, [clipApiUrl]);

    useEffect(() => {
      // データが読み込まれ、レンダリングが完了したタイミングで実行
      if (!loading && data && data.allReceivedData) {
        console.log("clip要素の生成が完了しました");
        // カスタムイベントを発火させる例
        const event = new CustomEvent("clipListElementsRendered", {
          detail: {
            itemCount: data.allReceivedData.length,
          },
        });
        window.dispatchEvent(event);
      }
    }, [loading, data]);
  
    if (loading) {
      return <p>Loading...</p>;
    }
  
    if (error) {
      return <p>Error: {error}</p>;
    }
  
    return (
      <section className="content-list">
        {data?.allReceivedData && data.allReceivedData.length > 0 ? (
          data.allReceivedData.map((item, index) => (
            <Clip
              key={index}
              name="切り抜き"
              title={item.title || "タイトルがありません"}
              epnum={item.epnumber || "エラー"}
              url={item.URL || "/browse"}
              username="ユーザー名"
              icon="netflix"
              starttime={item.StartTime}
              endtime={item.EndTime}
            />
          ))
        ) : (
          <p>データが見つかりません。</p>
      )}
    </section>
  );
}
