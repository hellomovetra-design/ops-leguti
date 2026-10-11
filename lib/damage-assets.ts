import {damagePlateKey} from './damage-case';
export const assetCaps=(value:string)=>value.toUpperCase().trim().replace(/\s+/g,' ');
export function damageAssetValues(body:Record<string,unknown>):{table:string;key:string;fields:Record<string,string>;kind:'warehouse'|'vehicle'}{
 const text=(key:string)=>typeof body[key]==='string'?assetCaps(body[key] as string):'';
 if(body.kind==='warehouse'){
  const name=text('value');
  if(!name||name.length>100||!/^[A-Z0-9][A-Z0-9 .&()/'-]*$/.test(name))throw Error('Isi nama Warehouse yang valid, maksimal 100 karakter.');
  return {table:'ops_damage_warehouse_master',key:'name_key',fields:{name,name_key:damagePlateKey(name)},kind:'warehouse' as const};
 }
 if(body.kind==='vehicle'){
  const raw=text('value'),match=raw.match(/^([A-Z]{1,3})\s*(\d{1,4})\s*([A-Z]{0,3})$/);
  if(!match)throw Error('Format Nopol harus seperti B 9271 CCG.');
  const plate=[match[1],match[2],match[3]].filter(Boolean).join(' '),vehicle_code=text('vehicle_code'),vehicle_type=text('vehicle_type');
  if([vehicle_code,vehicle_type].some(value=>!value||value.length>100||!/^[A-Z0-9][A-Z0-9 .&()/'-]*$/.test(value)))throw Error('Isi nomor / kode armada dan jenis kendaraan, maksimal 100 karakter.');
  return {table:'ops_damage_vehicle_master',key:'plate_key',fields:{plate,plate_key:damagePlateKey(plate),vehicle_code,vehicle_type},kind:'vehicle' as const};
 }
 throw Error('Jenis aset tidak valid.');
}
