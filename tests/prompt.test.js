import test from 'node:test';import assert from 'node:assert/strict';import {preparePrompt,content} from '../site/content.js';
test('prompt studio creates an ordered local prompt and omits empty fields',()=>{assert.equal(preparePrompt({goal:' Explain this issue ',context:'Evidence',constraints:'',format:'Steps'}),'Goal\nExplain this issue\n\nContext & evidence\nEvidence\n\nExpected output\nSteps');assert.equal(preparePrompt({goal:'Test'},'vi'),'Goal\nTest');});
test('legacy language preferences resolve to English capabilities and connection guidance',()=>{for(const c of Object.values(content)){assert.equal(c.roles.length,3);assert.equal(c.steps.length,4);assert.ok(c.privacy);assert.ok(c.authDetail);}});

