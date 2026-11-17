import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalManifest, sha256Hex, manifestHash, validateManifest, verifyPayload, ReaderPackageError} from '../js/readerPackage/readerPackageV1.js';
const fail = (f, code) => assert.throws(f, err => err instanceof ReaderPackageError && err.code === code);
async function fixture() {
  const bytes = new Uint8Array([0, 1, 2, 3]);
  const txt = 'Ein rein erfundener Vorleseabsatz.';
  const m = {
    format:'editionboysen-reader-package/1', packageId:'p1', bookId:'b1',
    source:{revision:3,sha256:'a'.repeat(64)}, audience:'PRIVATE_READER_PREVIEW',
    decision:{ref:'private-author-decision-1',scope:'PRIVATE_READER_PREVIEW'}, language:'de',
    readingOrder:['c1'],
    chapters:[{id:'c1',revision:3,title:'Demo',segments:[{id:'s1',text:txt,sha256:await sha256Hex(txt)}],assetIds:['i1']}],
    assets:[{id:'i1',path:'assets/p1.webp',sha256:await sha256Hex(bytes),mime:'image/webp',rightsRef:'owned-1',alt:'Fiktive Bildbeschreibung'}],
    audio:[],
  };
  return {m,files:new Map([['assets/p1.webp',bytes]])};
}
const clone = m => structuredClone(m);
test('valid synthetic image book and independent read-back', async()=>{
  const {m,files}=await fixture();
  assert.equal(validateManifest(m).segments,1);
  const proof=await verifyPayload(m,files);
  assert.equal(proof.byteLength,4);
  assert.equal(proof.manifestSha256,await manifestHash(m));
});
test('canonical object order is stable and only changed text changes digest',async()=>{
  const {m}=await fixture();
  const flip = Object.fromEntries(Object.entries(clone(m)).reverse());
  assert.equal(canonicalManifest(m),canonicalManifest(flip));
  assert.equal(await manifestHash(m),await manifestHash(flip));
  flip.chapters[0].segments[0].text+=' X';
  assert.notEqual(await manifestHash(m),await manifestHash(flip));
});
test('missing approval reference is refused (not an authentic BFF check)', async()=>{
  const {m}=await fixture();delete m.decision;fail(()=>validateManifest(m),'MISSING_DECISION');
});
test('wrong audience fails closed',async()=>{
  const {m}=await fixture();m.audience='PUBLIC';fail(()=>validateManifest(m),'INVALID_ENVELOPE');
});
test('unknown data e.g. secret field is rejected',async()=>{
  const {m}=await fixture();m.apiKey='secret';fail(()=>validateManifest(m),'INVALID_ENVELOPE');
});
test('third party scan and origin metadata are not allowed in manifest',async()=>{
  const {m}=await fixture();m.chapters[0].sourceScan='thirdparty';fail(()=>validateManifest(m),'INVALID_CHAPTER');
});
test('unsafe paths reject traversal, URL-encoding and backslash',async()=>{
  for(const path of ['assets/../evil.webp','assets/%2e%2e/a.webp','assets\\evil.webp','/assets/evil.webp']){
    const {m}=await fixture();m.assets[0].path=path;fail(()=>validateManifest(m),'INVALID_ASSET');
  }
});
test('duplicate chapter ids and duplicate segment ids are blocked',async()=>{
  const {m}=await fixture();m.chapters.push(clone(m.chapters[0]));m.readingOrder.push('c1');fail(()=>validateManifest(m),'DUPLICATE_ID');
});
test('missing asset is blocked without changing any library',async()=>{
  const {m}=await fixture();m.chapters[0].assetIds.push('missing');fail(()=>validateManifest(m),'MISSING_ASSET');
});
test('asset mutation blocked by digest',async()=>{
  const {m,files}=await fixture();files.set('assets/p1.webp',new Uint8Array([0,1,2,4]));await assert.rejects(verifyPayload(m,files),{code:'DIGEST_MISMATCH'});
});
test('segment mutation invalidates text digest',async()=>{
  const {m,files}=await fixture();m.chapters[0].segments[0].text+='!';await assert.rejects(verifyPayload(m,files),{code:'TEXT_DIGEST_MISMATCH'});
});
test('unknown extra or missing file rejected',async()=>{
  const {m,files}=await fixture();files.set('assets/other.webp',new Uint8Array([1]));await assert.rejects(verifyPayload(m,files),{code:'EXTRA_OR_MISSING_FILE'});
  files.clear();await assert.rejects(verifyPayload(m,files),{code:'EXTRA_OR_MISSING_FILE'});
});
test('chapter order must be bijection',async()=>{
  const {m}=await fixture();m.readingOrder=['absent'];fail(()=>validateManifest(m),'INVALID_READING_ORDER');
});
test('audio must point to valid segment',async()=>{
  const {m}=await fixture();m.audio=[{segmentId:'invalid',path:'audio/a.mp3',sha256:'a'.repeat(64),mime:'audio/mpeg',voiceRef:'v1'}];fail(()=>validateManifest(m),'INVALID_AUDIO');
});
test('refuses extra nested provider/child profile fields',async()=>{
  const {m}=await fixture();m.source.childProfile='alice';fail(()=>validateManifest(m),'INVALID_SOURCE');
});
test('offline validation no storage/network mutations',async()=>{
  const {m,files}=await fixture();const book='old-reader-library';const before=book;await verifyPayload(m,files);assert.equal(book,before);
});

test('orphan image data is rejected, even with a valid hash',async()=>{
  const {m}=await fixture();m.chapters[0].assetIds=[];fail(()=>validateManifest(m),'ORPHAN_ASSET');
});
test('oversized aggregate text fails closed before import',async()=>{
  const {m}=await fixture();const text='A'.repeat(10000);const sha256=await sha256Hex(text);
  m.chapters[0].segments=Array.from({length:301},(_,i)=>({id:'s'+i,text,sha256}));
  fail(()=>validateManifest(m),'PACKAGE_TOO_LARGE');
});
test('matching synthetic audio bytes and reference validate',async()=>{
  const {m,files}=await fixture();const audioBytes=new Uint8Array([88,89,90]);
  m.audio.push({segmentId:'s1',path:'audio/a.mp3',sha256:await sha256Hex(audioBytes),mime:'audio/mpeg',voiceRef:'synthetic-voice'});
  files.set('audio/a.mp3',audioBytes);
  const proof=await verifyPayload(m,files);assert.equal(proof.audio,1);
});
