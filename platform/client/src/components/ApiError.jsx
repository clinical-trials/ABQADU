import React from 'react';

export default function ApiError({ message, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ margin: '12px 20px', padding: 12, background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 6 }}>
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} style={{ marginLeft: 12, padding: '6px 12px', cursor: 'pointer' }}>Retry</button>}
    </div>
  );
}
