export type PersonOption={nik:string;name:string;position?:string;hub?:string};
const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
export function personMatches(person:PersonOption,query:string){
 const text=normalize([person.name,person.nik,person.position,person.hub].filter(Boolean).join(' '));
 return normalize(query).split(' ').filter(Boolean).every(term=>text.includes(term));
}
