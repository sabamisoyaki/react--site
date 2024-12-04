"use client";
import React, { useState } from "react";
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
      imageSrc = "N";//外部リンクに変える
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
  return (
    <div className="list-item">
      <p>
        {name} — {title} {epnum} — {username} {icon} {rating} +
      </p>
    </div>
  );
}

export default function TodoList() {

  return (
<>
  <Sidebar/>

  <div className="main-content">
  <HeadSearch/>

  <section className="content-grid">

    <PlayList title="test" epnum="ep1" mylistname="マイリスト１" username="ユーザー名" icon="prime"/>
    <PlayList title="test" epnum="ep10" mylistname="マイリスト5" username="ユーザー名" icon="netflix"/>
    

    

  </section>

  <section className="content-list">
      <Clip name="切り抜き名称" title="作品名" epnum="ep1" username="ユーザー名" icon="★"  />
      <Clip name="別の切り抜き" title="別作品" epnum="ep2" username="ユーザー名" icon="☆" />

  </section>
</div>
</>
);
}