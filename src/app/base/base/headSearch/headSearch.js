import React, { useState } from "react";
export default function HeadSearch(){ //ヘッダー
  
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
