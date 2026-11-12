import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflightSVGXML,inspectSVGXML} from '../../../src/etch/import/svg-xml.js';
import {code} from './helpers.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
test('SVG XML preflight accepts declarations, BOM, generator comments and harmless CDATA',() => {
  for (const source of [svg,'<?xml version="1.0" encoding="UTF-8"?>'+svg,'\ufeff<?xml version="1.0"?>'+svg,'<!-- <!DOCTYPE svg> <?xml-stylesheet?> -->'+svg,'<svg><![CDATA[<!DOCTYPE svg> <?anything?>]]></svg>']) assert.doesNotThrow(() => preflightSVGXML(source));
});
test('SVG preflight blocks DTD/entity declarations before invoking an XML parser',() => {
  for (const source of ['<!DOCTYPE svg>'+svg,'<!DOCTYPE svg SYSTEM "https://evil.invalid/a">'+svg,'<!DOCTYPE svg [<!ENTITY a "boom">]>'+svg,'<!ENTITY a SYSTEM "file:///etc/passwd">'+svg]) {
    let called = false;class Parser {constructor() {called = true;}}
    assert.throws(() => inspectSVGXML(source,{DOMParser:Parser}),code('UNSAFE_SVG'));assert.equal(called,false);
  }
});
test('SVG preflight blocks stylesheet/other PIs and misplaced XML declarations',() => {
  for (const source of ['<?xml-stylesheet href="https://evil.invalid"?>'+svg,svg+'<?other x?>',' <?xml version="1.0"?>'+svg,'<?XML version="1.0"?>'+svg]) assert.throws(() => preflightSVGXML(source),code('UNSAFE_SVG'));
});
test('unterminated comment, CDATA and XML declaration fail explicitly',() => {
  for (const source of ['<!--x','<svg><![CDATA[x','<?xml version="1.0"']) assert.throws(() => preflightSVGXML(source),code('INVALID_SVG'));
});
test('SVG source byte cap accounts for UTF-8 and rejects before parser allocation',() => {
  assert.doesNotThrow(() => preflightSVGXML('é',2));assert.throws(() => preflightSVGXML('é',1),code('LIMIT_EXCEEDED'));
  let called = false;class Parser {constructor() {called = true;}}
  assert.throws(() => inspectSVGXML(svg,{maxBytes:svg.length-1,DOMParser:Parser}),code('LIMIT_EXCEEDED'));assert.equal(called,false);
});
test('SVG inspector options are known positive downward limits and need a real parser',() => {
  for (const options of [null,[],{other:1},{maxDepth:65},{maxNodes:0},{maxBytes:6*1024*1024},{maxRules:Infinity}]) assert.throws(() => inspectSVGXML(svg,options),code('INVALID_ARGUMENT'));
  assert.throws(() => inspectSVGXML(svg,{DOMParser:null}),code('INVALID_ARGUMENT'));
});
