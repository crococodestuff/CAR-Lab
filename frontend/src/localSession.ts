import type {TimeMode} from './TimeDisplay';
const KEY=import.meta.env.MODE==='pages'?'car-lab:browser:last-completed-run:v1':'car-lab:last-completed-run:v1';
export interface LocalSession {run_id:string;step:number;timeMode:TimeMode;aux:boolean;}
export function readSession():LocalSession|null{
 try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s&&/^[a-f0-9]{64}$/.test(s.run_id)&&Number.isInteger(s.step)&&s.step>=0&&s.step<=6&&['minutes','elapsed','surgery'].includes(s.timeMode)?s:null;}catch{return null;}
}
export function saveSession(s:LocalSession){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{/* Browser storage can be disabled; the server's run remains saved. */}}
