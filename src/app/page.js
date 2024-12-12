"use client";
import React, { useState ,useEffect} from "react";
import './styles.css';


function Sidebar(){//リンク
  return (
  <aside className="sidebar">
      <button>home</button>
      <button>account</button>
      <button>my_video</button>
      <button>mylist</button>
  </aside>
  );
}

function HeadSearch(){ //ヘッダー

  const [searchText, setSearchText] = useState("");

  // 入力値が変更されたときに状態を更新
  const handleInputChange = (e) => {
    setSearchText(e.target.value);
  };
  // ボタンが押されたときにアラートを表示
  const handleClick = (e) => {
    alert(`ボタンの内容: ${searchText}`);
  //searchtextをサーバー側に送信する処理

  //受け取ったデータをもって画面移行1-5

  //ボックス内を消去

  };  
  return(
      <header className="header">
      <h1>サブスク切り抜き</h1>
      <div className="search-bar">
        <input type="text" placeholder="Hinted search text"  
        value={searchText} // 状態を入力値にバインド
        onChange={handleInputChange} // 状態を更新するイベント
        />
        <button onClick={handleClick} className="search-icon" >🔍</button>
      </div>
      <div className="profile-icon">👤</div>
      </header>
  );
}


function PlayList({ title, epnum , mylistname, username ,icon,data}){
  let imageSrc;
  switch(icon){
    case "netflix":
      imageSrc = "N";//ローカルを参照　./image/
      break;
    case "prime":
      imageSrc ="P";
      break;
    default:
      imageSrc ="Unknown";
  }
  const handleClick = () =>{
    // cookie関係　starttime endtime拡張機能側への受け渡し
    let cookiedata = `title=${title}; data= ${data};`;
    console.log(cookiedata);
    alert("この値をCookieに書き込みたい！");

  };
  return(
   
  <div className="grid-item">
      <p>
        <strong>{title}</strong>
        <br />
        <em>{epnum}</em>
      </p>
      <p>{mylistname}</p>
      <p>{username}</p>
      <p>{imageSrc}</p>
      <button onClick={handleClick}>go</button>
    </div>
  );
}

function PlayListCluster({ PlayList_Data_Url }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(PlayList_Data_Url);
        if (!response.ok) {
          throw new Error(`HTTPエラー! ステータスコード: ${response.status}`);
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [PlayList_Data_Url]);

  if (loading) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>Error: {error}</p>;
  }
  return(
    <section className="content-grid">
      {data && data.allReceivedData ? (
        data.allReceivedData.map((item, index) => (
          <PlayList
            key={index}
            title={item.my_list_name}
            epnum="test サブタイトルにするかもね"
            mylistname="ここ どうしよ"
            username={item.user_name}
            icon={item.icon}
            data={item.data}
          />
        ))
      ) : (
        <p>データが見つかりません。</p>
      )}
    </section>
  )
}


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



function ClipList({clipApiUrl}){

    // APIのURL
    
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





export default function app() {



  return (
<>
  <Sidebar/>

<div className="main-content">
  <HeadSearch/>
  <ClipList clipApiUrl={process.env.NEXT_PUBLIC_API_URL} />
  <PlayListCluster PlayList_Data_Url="/test_data/mylist.json"/>
</div>
</>
);
}