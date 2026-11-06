// Keep cookies, OAuth callbacks and CSRF checks on one configured HTTPS origin.
export function publicOrigin(value=process.env.PUBLIC_ORIGIN||'https://ai.th.io.vn'){
 let url;try{url=new URL(value);}catch{throw Error('PUBLIC_ORIGIN must be an HTTPS origin');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_ORIGIN must be an HTTPS origin');
 return url.origin;
}
