import React,{useEffect,useRef,useState} from 'react';
import {authenticatedPhoto,cloudMode} from './cloud';
export function CloudPhoto({fileName,thumbnail=false,...props}:React.ImgHTMLAttributes<HTMLImageElement>&{fileName:string;thumbnail?:boolean}){
  const ref=useRef<HTMLImageElement>(null);const [src,setSrc]=useState('');
  useEffect(()=>{
    if(!cloudMode)return;let disposed=false,objectUrl='',started=false;
    const load=()=>{if(started)return;started=true;authenticatedPhoto(fileName,thumbnail).then(url=>{objectUrl=url;if(disposed)URL.revokeObjectURL(url);else setSrc(url)}).catch(()=>undefined)};
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){load();observer.disconnect()}},{rootMargin:'200px'});
    if(ref.current)observer.observe(ref.current);return()=>{disposed=true;observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[fileName,thumbnail]);
  return <img ref={ref} {...props} src={cloudMode?(src||undefined):`/photos/${fileName}`}/>;
}
