"use client";
import React, { useState ,useEffect} from "react";
import './styles.css';
import HeadSearch from'./headSearch';
import Sidebar from './sidebar';
import ClipList from './clip';
import PlayList from './playlist';


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