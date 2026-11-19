import { afterPayFailure } from './payment';

// Verify failed AFTER the card was charged. 'server' = the server already
// refunded and worded it; anything else must say "payment received, don't pay again".
describe('afterPayFailure', () => {
  it('shows the server words when it refunded (409 slot full)', () => {
    expect(afterPayFailure({ success: false, refunded: true, message: 'Slot filled. Refunded.' })).toBe('server');
  });
  it('shows the server words when it could not refund yet either', () => {
    expect(afterPayFailure({ success: false, refunded: false, message: 'Team will refund in 24 hours.' })).toBe('server');
  });
  it('says payment received for a mismatch, a 5xx or no body at all', () => {
    expect(afterPayFailure({ success: false, message: 'Payment amount mismatch.' })).toBe('received');
    expect(afterPayFailure({})).toBe('received');
    expect(afterPayFailure(undefined)).toBe('received');
  });
});
