"use client";
import {UploadProgress} from "@/lib/report-upload";
import "./report-workflow.css";
export function ReportUploadStatus({value}:{value:UploadProgress}){
 return value.stage!=="idle"?<div className={`report-upload ${value.stage}`} role="status" aria-live="polite">{value.message}{value.stage==="uploading"&&<><progress max={100} value={value.percent}/><small>{value.percent}% terkirim · belum tersimpan sampai ada konfirmasi server</small></>}{value.stage==="saving"&&<progress aria-label="Menunggu konfirmasi server"/>}</div>:null;
}
