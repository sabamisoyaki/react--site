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
    // Cookie関係: name, username, starttime, endtime を設定
    document.cookie = `name=${encodeURIComponent(name)}; path=/; max-age=3600; secure; samesite=lax`;
    document.cookie = `title=${encodeURIComponent(title)}; path=/; max-age=3600; secure; samesite=lax`;
    document.cookie = `username=${encodeURIComponent(username)}; path=/; max-age=3600; secure; samesite=lax`;
    document.cookie = `starttime=${encodeURIComponent(starttime)}; path=/; max-age=3600; secure`;
    document.cookie = `endtime=${encodeURIComponent(endtime)}; path=/; max-age=3600; secure`;
    // Cookie設定確認用（必要なら削除）
    console.log("Cookie設定: ", document.cookie);    
    //カスタムイベント発火
    const event = new CustomEvent("clipSelected", {
      detail: { name, username, starttime, endtime },
    });
    window.dispatchEvent(event);

      //リンクを開く処理
      if (urlLink) {
        console.log("open URL");
        //window.open(urlLink, "_blank");// 実際にリンクを開く処理（コメントアウト中）

      } else {
        alert("Invalid link or unknown service");//eroorリンクへの変更
      }
  
    }
  
    return (
      <div className="list-item"  data-starttime={starttime} data-endtime={endtime}>
        <p>
          {name} — {title} {epnum} — {username}{" "}
          <button className="clipedbutton" onClick={handleClick}>
            {icon}
          </button>{" "}
          {rating} +
        </p>
      </div>
    );
}
export default Clip;