import React from "react";
import HomeIcon from '@mui/icons-material/Home';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MovieIcon from '@mui/icons-material/Movie';
import FolderIcon from '@mui/icons-material/Folder';

export const SidebarData=[
    {
        title:"Home",
        icon:<HomeIcon />,
        link:"/",

    },
    {
        title:"Account",
        icon:<AccountCircleIcon  />,
        link:"/site_data/account",

    },
    {
        title:"My_Video",
        icon:<MovieIcon />,
        link:"/site_data/my_video",

    },
    {
        title:"My_List",
        icon:<FolderIcon />,
        link:"/site_data/mylist",

    }
]