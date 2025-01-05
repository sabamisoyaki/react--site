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
      //document.cookie = `title=${name}; starttime=${starttime}; endtime=${endtime} `;
      //console.log(document.cookie);
      //alert("Cookieに値を書き込みました！");
      
      
      //リンクを開く処理
      if (urlLink) {
        alert("open URL");
        //window.open(urlLink, "_blank");
      } else {
        alert("Invalid link or unknown service");//eroorリンクへの変更
      }
  
    }
  
    return (
      <div className="list-item" id="clip-Detail" data-starttime={starttime} data-endtime={endtime}>
        <p>
          {name} — {title} {epnum} — {username}{" "}
          <button id="clipedbutton" onClick={handleClick}>
            {icon}
          </button>{" "}
          {rating} +
        </p>
      </div>
    );
}
export default Clip;