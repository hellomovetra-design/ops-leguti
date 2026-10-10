import type { SVGProps } from 'react';

export function MotorcycleIcon({size=24,...props}:SVGProps<SVGSVGElement>&{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="5" cy="17" r="3"/>
    <circle cx="19" cy="17" r="3"/>
    <path d="m19 17-4-11h-3m4 3h3m-4 4h-4l-3-3H4m1 7 4-5m-1-2h4l3 3-4 4H8m3-4v4"/>
  </svg>;
}
