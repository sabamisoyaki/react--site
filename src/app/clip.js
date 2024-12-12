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

export default function ClipList({clipApiUrl}){
       // ステートでデータとエラーメッセージを管理
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
  
    // データを取得する関数
    useEffect(() => {
      const fetchData = async () => {
        try {
          const response = await fetch(clipApiUrl);
          if (!response.ok) {
            throw new Error(`HTTPエラー! ステータスコード: ${response.status}`);
          }
          const json = await response.json();

          //console.log("取得したデータ:", json); // データ構造を確認
          setData(json); // データをステートに保存
        } catch (err) {
          console.error("データ取得エラー:", err);
          setError(err.message); // エラーメッセージをステートに保存

        }
      };
  
      fetchData();
    }, [clipApiUrl]); // 初回レンダリング時のみ実行
  return(
    
    <>
    <section className="content-list">
    {error && <p className="error">エラー: {error}</p>}
      {data && data.allReceivedData ? (
        data.allReceivedData.map((item, index) => (
          <Clip
            key={index}
            name="切り抜き"
            title={item.title || "タイトルがありません"}
            epnum={item.epnumber || "エラー"}
            url={item.URL || "/browse"}//エラーを表示できるようにする
            username="ユーザー名"
            icon="netflix" // 動的に変更可能にする
            starttime={item.StartTime}
            endtime={item.EndTime}
          />
        ))
      ) : (
        <p>データを読み込み中...</p>
      )}
    </section>

    </>
  );

}
