/** Calendar slots use IANA zones, skip missed occurrences and never create catch-up bursts. */
export function normalizeSchedule(value){
 if(!value||!['daily','weekly','once','interval'].includes(value.mode))throw Error('Choose daily, weekly, once or interval.');
 const timeZone=value.timeZone||'Asia/Ho_Chi_Minh';try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw Error('Choose a valid IANA time zone.');}
 if(value.mode==='interval'){if(!Number.isInteger(value.minutes)||value.minutes<5||value.minutes>43200)throw Error('Interval must be 5–43,200 minutes.');return {mode:'interval',minutes:value.minutes,timeZone};}
 if(value.mode==='once'){if(typeof value.at!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.at)||!Number.isFinite(Date.parse(value.at)))throw Error('A one-time date must include a UTC offset.');return {mode:'once',at:new Date(value.at).toISOString(),timeZone};}
 const times=[...new Set(value.times||[])].sort();if(!times.length||times.length>8||times.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Choose 1–8 times in HH:mm format.');
 const days=value.mode==='weekly'?[...new Set(value.days||[])].sort():[0,1,2,3,4,5,6];if(!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose weekdays (Sunday = 0).');return {mode:value.mode,timeZone,times,days};
}
export function nextCalendarRun(value,after=new Date()){
 const c=normalizeSchedule(value),now=+after;if(!Number.isFinite(now))throw Error('Invalid schedule clock.');
 if(c.mode==='once')return Date.parse(c.at)>now?new Date(c.at):null;
 if(c.mode==='interval')return new Date(now+c.minutes*60000);
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:c.timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=t=>Object.fromEntries(fmt.formatToParts(t).map(p=>[p.type,p.value]));const start=parts(after),date=p=>p.year+'-'+p.month+'-'+p.day,clock=p=>p.hour+':'+p.minute,days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 for(let at=Math.floor(now/60000)*60000+60000,end=at+8*86400000;at<end;at+=60000){const p=parts(new Date(at));if(date(p)===date(start)&&clock(p)<=clock(start))continue;if(c.days.includes(days.indexOf(p.weekday))&&c.times.includes(clock(p)))return new Date(at);}
 throw Error('No calendar slot found in the next eight days.');
}
export function nextWorkflowRun(graph,after=new Date()){
 if(graph.settings?.schedule)return nextCalendarRun(graph.settings.schedule,after);
 const timer=graph.nodes?.find(n=>['timer','auto_input'].includes(n.type)&&n.enabled!==false);
 return new Date(+after+Math.max(5,Number(graph.settings?.auto?.enabled?graph.settings.auto.intervalMinutes:timer?.config.intervalMinutes)||60)*60000);
}
