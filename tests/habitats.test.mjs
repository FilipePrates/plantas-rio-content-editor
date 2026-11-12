import {test} from 'node:test';
import assert from 'node:assert/strict';
import {habitatRequest} from '../worker/habitats.mjs';

test('habitat drafts reject unknown sections, require provenance, and detect conflicting saves', async()=>{
  let current=null, version=0;
  const bucket={get:async()=>current&&({etag:String(version),json:async()=>JSON.parse(current)}),put:async(_key,value,{onlyIf})=>{
    if ((current && onlyIf.etagDoesNotMatch==='*') || (onlyIf.etagMatches && onlyIf.etagMatches!==String(version))) return null;
    current=value;version++;return {etag:String(version)};
  }};
  const post=new Request('https://example.test/',{method:'POST'}), get=new Request('https://example.test/');
  const value={image:'data:image/jpeg;base64,YWJj',source:'https://example.com/photo',creator:'Autor',license:'CC0',etag:null};
  assert.equal((await habitatRequest(post,bucket,'desconhecido',value)).status,400);
  assert.equal((await habitatRequest(post,bucket,'Restinga',{...value,source:''})).status,400);
  assert.equal((await habitatRequest(post,bucket,'Restinga',value)).status,200);
  assert.equal((await habitatRequest(post,bucket,'Restinga',value)).status,409);
  const stored=await (await habitatRequest(get,bucket,'Restinga')).json();
  assert.equal(stored.draft.source,value.source);
  assert.equal((await habitatRequest(post,bucket,'Restinga',{...value,etag:stored.etag})).status,200);
});
