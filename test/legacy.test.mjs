import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketRecord} from '../api/_lib/tickets.js';
import {assignmentParams, sendAssignment} from '../api/_lib/notify.js';

const row = {
 id:'legacy_685',legacy_ticket_number:685,name:'Test',email:'test@example.invalid',
 contact_number:'555-0000',facility:'Corporate',tool:'Email',subject:'Example',issue:'Demo',
 status:'Needs Review',priority:'Critical',assigned_to:'support@freedomhc.com',
 date_submitted:'2026-05-25',resolved_date:null
};
test('retains numeric legacy ticket references and review status',()=>{
 const record=ticketRecord(row);
 assert.equal(record.fields['Ticket ID'],685);
 assert.equal(record.fields.Status,'Needs Review');
 assert.equal(record.fields.Priority,'Critical');
 assert.equal(assignmentParams(row).ref,'685');
});
test('preview mode suppresses external notifications',async()=>{
 const prev=process.env.DISABLE_NOTIFICATIONS;
 process.env.DISABLE_NOTIFICATIONS='true';
 try{assert.equal(await sendAssignment(row),false)}
 finally{if(prev===undefined)delete process.env.DISABLE_NOTIFICATIONS;else process.env.DISABLE_NOTIFICATIONS=prev}
});
