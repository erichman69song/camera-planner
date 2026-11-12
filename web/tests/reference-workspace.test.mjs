import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReferenceFile, resizedImageDimensions, parseSceneToolCalls, sceneInstruction, referenceCompareNotice, REFERENCE_LIMIT_BYTES } from '../public/planner/reference-workspace.mjs';

test('reference files require a supported raster image and bounded non-empty size', () => {
  const valid = { type: 'image/png', size: 500 };
  assert.equal(validateReferenceFile(valid), valid);
  for (const file of [{ type:'image/svg+xml',size:100 }, { type:'image/jpeg',size:0 }, { type:'image/webp',size:REFERENCE_LIMIT_BYTES+1 }]) assert.throws(() => validateReferenceFile(file));
});

test('image reduction preserves aspect ratio and never enlarges source', () => {
  assert.deepEqual(resizedImageDimensions(4000,2000),{width:1600,height:800});
  assert.deepEqual(resizedImageDimensions(400,600),{width:400,height:600});
  assert.deepEqual(resizedImageDimensions(1000,4000),{width:400,height:1600});
  assert.throws(() => resizedImageDimensions(0,100));
  assert.throws(() => resizedImageDimensions(20000,20000));
});

test('manual test handoff accepts real tool-call envelopes and rejects malformed batches', () => {
  assert.deepEqual(parseSceneToolCalls('[{"name":"scene_get_state","arguments":{}}]'),[{name:'scene_get_state',arguments:{}}]);
  assert.deepEqual(parseSceneToolCalls('[{"function":{"name":"scene_add_object","arguments":"{\\"name\\":\\"桌子\\"}"}}]'),[{name:'scene_add_object',arguments:{name:'桌子'}}]);
  for (const value of ['{}','[]','[null]','[{"name":"eval","arguments":{}}]','[{"name":"scene_get_state","arguments":[]}]','[{"name":"scene_get_state","arguments":"bad"}]']) assert.throws(() => parseSceneToolCalls(value));
});

test('correction instructions preserve current edits and clearly disclose text-only context', () => {
  const instruction=sceneInstruction({description:'桌子右移',scale:'桌宽 1.6 米',mode:'correct',textOnly:true});
  assert.match(instruction,/保留人工调整/); assert.match(instruction,/没有向你发送参考图/); assert.match(instruction,/1.6/);
  const newScene=sceneInstruction({target:'new',projection:'perspective'});
  assert.match(newScene,/请创建参考摄影机/);
});

test('comparison reports projection and crop limits rather than claiming calibrated overlays', () => {
  assert.match(referenceCompareNotice({projection:'equirectangular180',width:2000,height:1000},{width:960,height:540}),/未.*校准/);
  assert.match(referenceCompareNotice({projection:'perspective',width:1000,height:1000},{width:960,height:540}),/比例不同/);
  assert.match(referenceCompareNotice(null,null),/没有参考图/);
});
