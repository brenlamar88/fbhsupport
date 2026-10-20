import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentParams, sendAssignment, sendRequesterConfirmation } from '../api/_lib/notify.js';

const ticket = {
  id:'rec0123456789',assigned_to:'support@freedomhc.com',name:'Example Person',
  email:'requester@example.com',contact_number:'555-0100',facility:'Corporate',
  tool:'Email',subject:'<Test & Demo>',issue:'Browser <script>alert(1)</script> issue',
  priority:'High',status:'Open',date_submitted:'2026-10-20'
};

test('EmailJS template parameters are compatible and message HTML is escaped', () => {
  const params = assignmentParams(ticket);
  assert.equal(params.to_email,'support@freedomhc.com');
  assert.equal(params.ref,'456789');
  assert.equal(params.requester_email,'requester@example.com');
  assert.equal(params.ticket_subject,'<Test & Demo>');
  assert.match(params.message_html,/&lt;Test &amp; Demo&gt;/);
  assert.doesNotMatch(params.message_html,/<script>/);
  assert.match(params.message,/Browser <script>/);
});

test('server calls EmailJS with original service/template and private key', async () => {
  const originalFetch = globalThis.fetch;
  const keys=['EMAILJS_PUBLIC_KEY','EMAILJS_PRIVATE_KEY','EMAILJS_SERVICE_ID','EMAILJS_ASSIGN_TEMPLATE_ID'];
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  let captured;
  try {
    process.env.EMAILJS_PUBLIC_KEY='test-public';
    process.env.EMAILJS_PRIVATE_KEY='test-private';
    process.env.EMAILJS_SERVICE_ID='service_ucspnwu';
    process.env.EMAILJS_ASSIGN_TEMPLATE_ID='template_i1zrsar';
    globalThis.fetch=async (url,options)=>{ captured={url,options}; return {ok:true,status:200}; };
    assert.equal(await sendAssignment(ticket),true);
    assert.equal(captured.url,'https://api.emailjs.com/api/v1.0/email/send');
    const json=JSON.parse(captured.options.body);
    assert.equal(json.service_id,'service_ucspnwu');
    assert.equal(json.template_id,'template_i1zrsar');
    assert.equal(json.user_id,'test-public');
    assert.equal(json.accessToken,'test-private');
    assert.equal(json.template_params.to_email,'support@freedomhc.com');
  } finally {
    globalThis.fetch=originalFetch;
    for (const [k,v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k]=v;
    }
  }
});

test('requester confirmation is disabled until its template is configured', async () => {
  const old=process.env.EMAILJS_CONFIRM_TEMPLATE_ID;
  try {
    delete process.env.EMAILJS_CONFIRM_TEMPLATE_ID;
    assert.equal(await sendRequesterConfirmation(ticket),false);
  } finally {
    if (old === undefined) delete process.env.EMAILJS_CONFIRM_TEMPLATE_ID;
    else process.env.EMAILJS_CONFIRM_TEMPLATE_ID=old;
  }
});
