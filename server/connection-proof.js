import {createHash} from 'node:crypto';
import {canonical} from '../site/execution-shape.js';
export {canonical} from '../site/execution-shape.js';
export function credentialFingerprint(secret,{stable=false}={}){const ignored=new Set(['_verification','_connectionEpoch','accessToken','expires',...(stable?['refreshToken']:[])]);return createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(Object.entries(secret||{}).filter(([k])=>!ignored.has(k)))))).digest('hex');}
export function connectionProof(secret){const proof=secret?._verification;return proof&&proof.fingerprint===credentialFingerprint(secret)?{verified:proof.status==='verified',status:proof.status,checkedAt:proof.checkedAt,source:proof.source}: {verified:false,status:'unverified'};}
export function recordProof(secret,{status='verified',source='access-test'}={}){return {...secret,_verification:{status,source,checkedAt:new Date().toISOString(),fingerprint:credentialFingerprint(secret)}};}
export function refreshedSecret(previous,next){if(connectionProof(previous).verified&&credentialFingerprint(previous,{stable:true})===credentialFingerprint(next,{stable:true}))return {...next,_verification:{...previous._verification,fingerprint:credentialFingerprint(next)}};return next;}

export function volatileRefreshOnly(previous,next){return !!previous&&previous.refreshToken===next.refreshToken&&credentialFingerprint(previous)===credentialFingerprint(next);}
