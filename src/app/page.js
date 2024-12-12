"use client";
import './styles.css';
import HeadSearch from'./base/headSearch'; // ヘッダー
import Sidebar from './base/sidebar';
import ClipList from './base/clip';
import PlayList from './base/playlist';

export default function app() {
  return (
<>
  <Sidebar/>

<div className="main-content">
  <HeadSearch/>
  <ClipList clipApiUrl={process.env.NEXT_PUBLIC_API_URL} />
  <PlayList PlayList_Data_Url="/test_data/mylist.json"/>
</div>
</>
);
}