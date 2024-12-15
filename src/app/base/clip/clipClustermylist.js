import React, { useState ,useEffect} from "react";
function Clip({ name, title, epnum, username, icon, rating, url ,starttime, endtime}) {
    // Link 生成
    let urlLink;
    switch (icon) {
      case "netflix":
        urlLink = "https://www.netflix.com"+url;
        break;
      case "prime":
        urlLink = "https://www.amazon.co.jp/primevideo"+url;//暫定なので気にしないで
        break;
      default:
        urlLink = null; // Handle unknown cases
    }
    //クリック時の処理
    const handleClick = () =>{
      // cookie関係　starttime endtime拡張機能側への受け渡し
      document.cookie = `title=${name}; starttime=${starttime}; endtime=${endtime} `;
      console.log(document.cookie);
      alert("Cookieに値を書き込みました！");
      
      
      //リンクを開く処理
      if (urlLink) {
        window.open(urlLink, "_blank");
      } else {
        alert("Invalid link or unknown service");//eroorリンクへの変更
      }
  
    }
  
    return (
      <div className="list-item">
        <p>
          {name} — {title} {epnum} — {username}{" "}
          <button onClick={handleClick}>
            {icon}
          </button>{" "}
          {rating} +
        </p>
      </div>
    );
  }

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
