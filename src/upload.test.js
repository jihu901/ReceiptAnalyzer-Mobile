import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe, it, expect} from 'vitest';

const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

function harness(upload, remaining = []) {
  const cards = [], removed = [];
  let calls = 0;
  const context = vm.createContext({
    picker:{value:''}, clearButton:{}, selectButton:{}, summary:{},
    uploading:false, clearResults:()=>{ cards.length = 0; },
    sha256:async file=>file.hash, toPayload:async file=>file,
    bridgeUpload:async file=>{calls++;return upload(file);},
    removePending:async id=>removed.push(id), savePending:async file=>'pending-' + file.name,
    allPending:async()=>remaining, actionableError:error=>error.message,
    appendResult:(file,state,message,retry)=>cards.push({file,state,message,retry}),
  });
  vm.runInContext(source.slice(source.indexOf('async function uploadSelection(')), context);
  return {context,cards,removed,calls:()=>calls};
}

describe('mobile upload failure and retry',()=>{
  it('shows both photos as failures when their one shared upload fails',async()=>{
    const h = harness(()=>{throw new Error('offline');});
    await h.context.uploadSelection([{name:'a.jpg',hash:'same'}, {name:'b.jpg',hash:'same'}]);
    expect(h.calls()).toBe(1);
    expect(h.cards.map(c=>c.state)).toEqual(['error','error']);
    expect(h.cards.every(c=>typeof c.retry === 'function')).toBe(true);
    expect(h.context.uploading).toBe(false);
    expect(h.context.selectButton.disabled).toBe(false);
  });
  it('does not hide other failed photos when retrying one succeeds',async()=>{
    const other = {id:'other',file:{name:'other.jpg'},message:'retry needed'};
    const h = harness(()=>({status:'uploaded'}),[other]);
    await h.context.uploadSelection([{name:'a.jpg',hash:'a'}]);
    expect(h.cards.map(c=>c.file.name)).toEqual(['a.jpg','other.jpg']);
    expect(h.cards[1].state).toBe('error');
  });
  it('coalesces successful duplicate uploads and prevents overlapping batches',async()=>{
    let release;
    const h = harness(()=>new Promise(resolve=>{release=resolve;}));
    const first=h.context.uploadSelection([{name:'a.jpg',hash:'a'},{name:'b.jpg',hash:'a'}]);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await h.context.uploadSelection([{name:'c.jpg',hash:'c'}]);
    release({status:'uploaded'});
    await first;
    expect(h.calls()).toBe(1);
    expect(h.cards.map(c=>c.state)).toEqual(['success','duplicate']);
  });
});
