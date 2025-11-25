const DIRECTION_LABELS = {
  outbound_pending: 'Outbound (en attente)',
  outbound_accepted: 'Outbound (acceptée)',
  inbound_accepted: 'Inbound (reçue)'
};

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#a855f7', '#f59e0b'];

if (typeof window !== 'undefined') {
  window.DIRECTION_LABELS = DIRECTION_LABELS;
  window.PIE_COLORS = PIE_COLORS;
}
