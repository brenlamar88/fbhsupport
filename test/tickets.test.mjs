import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketRecord, validatedNewTicket, validateAssignee } from '../api/_lib/tickets.js';

test('converts PostgreSQL tickets into existing Airtable-style view shape', () => {
  const row = {
    id: 'recExample123456', name: 'Test User', email: 'test@example.com',
    contact_number: '555-0123', facility: 'Corporate', tool: 'Email',
    subject: 'Demo', issue: 'Example', priority: 'High',
    status: 'Open', assigned_to: '', date_submitted: '2026-10-20',
    resolved_date: null
  };
  const actual = ticketRecord(row);
  assert.equal(actual.id, row.id);
  assert.equal(actual.fields['Date Submitted'], '2026-10-20');
  assert.equal(actual.fields['Assigned To'], '');
  assert.equal(actual.fields.Subject, 'Demo');
});

test('new tickets require requester, contact, category, subject and issue', () => {
  const f = {Name:'Test',Email:'test@example.com','Contact Number':'555-0123',
    Facility:'Corporate',Tool:'Email',Subject:'Problem',Issue:'Details',Priority:'Medium'};
  assert.equal(validatedNewTicket(f).priority,'Medium');
  assert.throws(() => validatedNewTicket({...f,Email:'bad-email'}));
  assert.throws(() => validatedNewTicket({...f,Issue:''}));
  assert.throws(() => validatedNewTicket({...f,Priority:'Unexpected'}));
});

test('only allows company email domain assignees', () => {
  assert.equal(validateAssignee('tech@freedomhc.com'),'tech@freedomhc.com');
  assert.throws(() => validateAssignee('person@gmail.com'));
  assert.equal(validateAssignee(''),'');
});
