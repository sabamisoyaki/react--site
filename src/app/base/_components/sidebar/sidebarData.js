import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import FolderIcon from "@mui/icons-material/Folder";
import HomeIcon from "@mui/icons-material/Home";
import MovieIcon from "@mui/icons-material/Movie";

export const SidebarData = [
  {
    title: "ホーム",
    icon: <HomeIcon />,
    link: "/",
  },
  {
    title: "アカウント",
    icon: <AccountCircleIcon />,
    link: "/account",
  },
  {
    title: "マイビデオ",
    icon: <MovieIcon />,
    link: "/my_video",
  },
  {
    title: "マイリスト",
    icon: <FolderIcon />,
    link: "/playlists",
  },
];
