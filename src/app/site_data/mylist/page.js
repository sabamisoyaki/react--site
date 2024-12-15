"use client";
import '@/app/globals.css';
import HeadSearch from'@/app/base//base/headSearch/headSearch'; ; // ヘッダー
import Sidebar from '@/app/base/base/sidebar/sidebar';
import ClipList from '@/app/base/clip/clipCluster';
import PlayList from '@/app/base/playlist/playlist';

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