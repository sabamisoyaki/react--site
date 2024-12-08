"use client";
import React, { useState ,useEffect} from "react";
import './styles.css';

//import getData from'./api.js';


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
    searchText = "";
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


function PlayList({ title, epnum , mylistname, username ,icon}){
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
    </div>
  );
}

function Clip({ name, title, epnum, username, icon, rating }) {
  //iconを☆するかどうかはともかくボタンにする

  return (
    <div className="list-item">
      <p>
        {name} — {title} {epnum} — {username} <button>{icon} </button> {rating} +
      </p>
    </div>
  );
}

function ClipList(){
    // APIのURL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    console.log("URL",process.env.NEXT_PUBLIC_API_URL);
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

          console.log("取得したデータ:", json); // データ構造を確認
          setData(json); // データをステートに保存
        } catch (err) {
          console.error("データ取得エラー:", err);
          setError(err.message); // エラーメッセージをステートに保存

        }
      };
  
      fetchData();
    }, []); // 初回レンダリング時のみ実行
  return(
    <>
    <section className="content-list">
  {/* 最初の Clip */}
  <Clip 
    name="切り抜き" 
    title={data && data.allReceivedData && data.allReceivedData[0] ? data.allReceivedData[0].title : "タイトルがありません"} 
    epnum={data && data.allReceivedData && data.allReceivedData[0] ? data.allReceivedData[0].epnumber : "エラー"} 
    username="ユーザー名" 
    icon="★" 
  />

  {/* 別の Clip */}

  <Clip 
    name="切り抜き" 
    title={data && data.allReceivedData && data.allReceivedData[1] ? data.allReceivedData[1].title : "タイトルがありません"} 
    epnum={data && data.allReceivedData && data.allReceivedData[1] ? data.allReceivedData[1].epnumber : "エラー"} 
    username="ユーザー名" 
    icon="★" 
  />
  <Clip 
    name="切り抜き" 
    title={data && data.allReceivedData && data.allReceivedData[2] ? data.allReceivedData[2].title : "タイトルがありません"} 
    epnum={data && data.allReceivedData && data.allReceivedData[2] ? data.allReceivedData[2].epnumber : "エラー"} 
    username="ユーザー名" 
    icon="★" 
  />
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

  <section className="content-grid">

    <PlayList title="test" epnum="ep1" mylistname="マイリスト１" username="ユーザー名" icon="prime"/>
    <PlayList title="test" epnum="ep10" mylistname="マイリスト5" username="ユーザー名" icon="netflix"/>
    

    

  </section>
  <ClipList/>
  


</div>


</>
);
}