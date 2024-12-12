import React, { useState ,useEffect} from "react";
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
export default function PlayListCluster({ PlayList_Data_Url }) {
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