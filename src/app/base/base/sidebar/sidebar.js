import React from "react";
import { SidebarData } from "./sidebarData";

function Sidebar() {
    return (
        <>
            <div className="sidebar">
                <ul className="SidebarList">
                    {SidebarData.map((value, key) => {
                        return (
                            <li 
                                key={key} 
                                className="row" 
                                onClick={() => {
                                    window.location.pathname = value.link;
                                }}
                            >
                                <div className="icon">{value.icon}</div>
                                <div className="title">{value.title}</div>
                            </li>
                        );
                    })}
                </ul>
            </div>

        </>
    );
}

export default Sidebar;
