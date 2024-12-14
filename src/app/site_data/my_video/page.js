"use client";
import '@/app/styles.css';
import HeadSearch from'@/app/base/headSearch'; ; // ヘッダー
import Sidebar from '@/app/base/sidebar';
import ClipList from '@/app/base/clip';
import PlayList from '@/app/base/playlist';

export default function app() {
  return (
<>
  <Sidebar/>

<div className="main-content">
  <HeadSearch/>
  <ClipList clipApiUrl= {process.env.NEXT_PUBLIC_API_URL} />
</div>
</>
);
}