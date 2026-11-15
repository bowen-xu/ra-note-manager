import {useEffect,useState} from "react";

/** Matches NotesWorkspace.css: the explorer is always visible above 1100px;
 * below that existing breakpoint it is a drawer controlled by `open`. */
export function useNotesExplorerVisibility(open:boolean):boolean{
  const [compact,setCompact]=useState(()=>window.matchMedia("(max-width: 1100px)").matches);
  useEffect(()=>{const media=window.matchMedia("(max-width: 1100px)"),update=()=>setCompact(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  return !compact||open;
}
