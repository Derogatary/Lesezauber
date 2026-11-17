import test from 'node:test';
import assert from 'node:assert/strict';
import {planReaderImport} from '../js/readerPackage/readerImportPlan.js';
import {sha256Hex} from '../js/readerPackage/readerPackageV1.js';

const old = (record, position = 8) => ({...record,lastPosition:position});
async function fixture({packageId='version1', bookId='book1', text='Fiktiver Absatz'}={}) {
  const image = new Uint8Array([0,1,2,3]);
  const manifest = {
    format:'editionboysen-reader-package/1', packageId, bookId,
    source:{revision:1,sha256:'a'.repeat(64)},
    audience:'PRIVATE_READER_PREVIEW',decision:{ref:'synthetic-decision',scope:'PRIVATE_READER_PREVIEW'},language:'de',
    readingOrder:['chapter1'],chapters:[{id:'chapter1',revision:1,title:'Demo',segments:[{id:'seg1',text,sha256:await sha256Hex(text)}],assetIds:['image1']}],
    assets:[{id:'image1',path:'assets/pic.webp',sha256:await sha256Hex(image),mime:'image/webp',rightsRef:'synthetic-rights',alt:'Demo'}],audio:[],
  };
  return {manifest,files:new Map([['assets/pic.webp',image]])};
}

test('first import generates an ADD_BOOK plan with no writes',async()=>{
  const {manifest,files}=await fixture(); const entries=[];
  const plan=await planReaderImport(manifest,files,entries);
  assert.equal(plan.action,'ADD_BOOK'); assert.equal(plan.mutations,0);
  assert.equal(plan.newEntry.packageId,'version1'); assert.deepEqual(entries,[]);
  assert.match(plan.newEntry.localId,/^lz_[a-f0-9]{64}$/);
});
test('exact reimport is idempotent and retains reading position',async()=>{
  const {manifest,files}=await fixture();const first=await planReaderImport(manifest,files,[]);
  const entries=[old(first.newEntry,19)];const previous=structuredClone(entries);
  const next=await planReaderImport(manifest,files,entries);
  assert.equal(next.action,'ALREADY_INSTALLED');assert.equal(next.keepReadingPosition,19);
  assert.equal(next.existingLocalId,first.newEntry.localId);assert.deepEqual(entries,previous);
});
test('new edition adds a separate record and preserves earlier reading position',async()=>{
  const firstF=await fixture();const first=await planReaderImport(firstF.manifest,firstF.files,[]);
  const secondF=await fixture({packageId:'version2',text:'Neuer fiktiver Absatz'});
  secondF.manifest.source.revision=2;secondF.manifest.source.sha256='b'.repeat(64);
  const entries=[old(first.newEntry,24)];const backup=structuredClone(entries);
  const plan=await planReaderImport(secondF.manifest,secondF.files,entries);
  assert.equal(plan.action,'ADD_EDITION');assert.deepEqual(plan.previousEditionIds,[first.newEntry.localId]);
  assert.notEqual(plan.newEntry.localId,first.newEntry.localId);assert.equal(plan.newEntry.lastPosition,null);
  assert.deepEqual(entries,backup);
});
test('reused packageId with changed content fails closed',async()=>{
  const f=await fixture(); const p=await planReaderImport(f.manifest,f.files,[]);
  const changed=await fixture({text:'Anderer Text'});
  await assert.rejects(planReaderImport(changed.manifest,changed.files,[old(p.newEntry)]),{code:'PACKAGE_ID_CONFLICT'});
});
test('reused packageId across books fails closed',async()=>{
  const f=await fixture(); const p=await planReaderImport(f.manifest,f.files,[]);
  const changed=await fixture({bookId:'anotherBook'});
  await assert.rejects(planReaderImport(changed.manifest,changed.files,[old(p.newEntry)]),{code:'PACKAGE_ID_CONFLICT'});
});
test('forged digest with invalid image bytes rejected before planning',async()=>{
  const f=await fixture();f.files.set('assets/pic.webp',new Uint8Array([9,9]));
  await assert.rejects(planReaderImport(f.manifest,f.files,[]),{code:'DIGEST_MISMATCH'});
});
test('tampered text is rejected even when index exists',async()=>{
  const f=await fixture();const p=await planReaderImport(f.manifest,f.files,[]);
  f.manifest.chapters[0].segments[0].text+='!';
  await assert.rejects(planReaderImport(f.manifest,f.files,[old(p.newEntry)]),{code:'TEXT_DIGEST_MISMATCH'});
});
test('overly large library indexes fail before plan creation',async()=>{
  const f=await fixture();await assert.rejects(planReaderImport(f.manifest,f.files,Array(2001).fill({})),{code:'INVALID_LIBRARY_INDEX'});
});
test('invalid library record and secret-bearing record fail',async()=>{
  const f=await fixture();const p=await planReaderImport(f.manifest,f.files,[]);
  await assert.rejects(planReaderImport(f.manifest,f.files,[{...old(p.newEntry),profile:'child'}]),{code:'INVALID_LIBRARY_INDEX'});
  await assert.rejects(planReaderImport(f.manifest,f.files,[{...old(p.newEntry),lastPosition:-1}]),{code:'INVALID_LIBRARY_INDEX'});
});
test('duplicate local IDs and package IDs in index fail closed',async()=>{
  const f=await fixture();const p=await planReaderImport(f.manifest,f.files,[]);const record=old(p.newEntry);
  await assert.rejects(planReaderImport(f.manifest,f.files,[record,{...record,packageId:'another'}]),{code:'INVALID_LIBRARY_INDEX'});
  await assert.rejects(planReaderImport(f.manifest,f.files,[record,{...record,localId:'lz_'+'b'.repeat(64)}]),{code:'INVALID_LIBRARY_INDEX'});
});
test('existing local ID collision with different package is rejected',async()=>{
  const f=await fixture();const p=await planReaderImport(f.manifest,f.files,[]);
  await assert.rejects(planReaderImport(f.manifest,f.files,[{...old(p.newEntry),packageId:'otherPackage'}]),{code:'LOCAL_ID_CONFLICT'});
});
test('existing result is not an authorization, license or durable write',async()=>{
  const f=await fixture();const p=await planReaderImport(f.manifest,f.files,[]);
  assert.equal(p.mutations,0);assert.equal(Object.isFrozen(p),true);assert.equal(Object.isFrozen(p.newEntry),true);
  assert.equal(p.newEntry.lastPosition,null);
});
