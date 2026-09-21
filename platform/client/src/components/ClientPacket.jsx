import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ClientPacket.css';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const preparedDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

function money(value) {
  return Number.isFinite(Number(value)) ? currency.format(Number(value)) : 'To be confirmed';
}

export function PacketPdfStatus({ pdf }) {
  if (!pdf) return null;
  if (pdf.loading) return <p role="status" className="client-packet-pdf-status">Preparing your ABQ ADU packet PDF…</p>;
  if (pdf.error) return <p role="alert" className="client-packet-pdf-status">{pdf.error}</p>;
  if (!pdf.url) return null;
  return <div role="status" className="client-packet-pdf-status">
    <p>{pdf.blocked ? 'The PDF tab was blocked or closed. Open or download your packet below.' : 'Your PDF is ready. Use its print controls, or download a copy.'}</p>
    <div className="client-packet-pdf-links">
      <a className="client-packet-button" href={pdf.url} target="_blank" rel="noopener noreferrer">Open PDF</a>
      <a className="client-packet-button" href={pdf.url} download={pdf.filename}>Download PDF</a>
    </div>
  </div>;
}

export default function ClientPacket({ preview, onClose, onPrint, pdf }) {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const headingId = useId();
  const descriptionId = useId();
  const isOpen = Boolean(preview);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const hadOpenClass = document.body.classList.contains('client-packet-open');
    const background = Array.from(document.body.children)
      .filter(element => element !== overlayRef.current)
      .map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    document.body.classList.add('client-packet-open');
    background.forEach(({ element }) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });

    const focusableElements = () => Array.from(dialogRef.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]'));
    const focusFirst = () => (focusableElements()[0] || dialogRef.current).focus();
    const keepFocusInside = event => {
      if (!dialogRef.current.contains(event.target)) focusFirst();
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          dialogRef.current.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', keepFocusInside);
    focusFirst();

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', keepFocusInside);
      if (!hadOpenClass) document.body.classList.remove('client-packet-open');
      background.forEach(({ element, inert, hidden }) => {
        if (inert === null) element.removeAttribute('inert');
        else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', hidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!preview) return null;

  // Keep this document restricted to homeowner fields even if the API adds internal data.
  const { brand = {}, project = {}, invoice_drafts = [], draw_schedule = [] } = preview;
  const stages = invoice_drafts.length ? invoice_drafts : draw_schedule;
  const generated = new Date(preview.generated_at);
  const dateLabel = Number.isNaN(generated.getTime()) ? null : preparedDate.format(generated);

  return createPortal(
    <div className="client-packet-overlay" ref={overlayRef} onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="client-packet-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="client-packet-toolbar">
          <button className="client-packet-button client-packet-close" type="button" onClick={onClose}>Close preview</button>
          <p>Homeowner preview</p>
          <button className="client-packet-button client-packet-print" type="button" disabled={!onPrint || pdf?.loading} onClick={onPrint}>{pdf?.loading ? 'Preparing PDF…' : 'Print packet'}</button>
        </div>
        <PacketPdfStatus pdf={pdf} />
        <article className="client-packet-document">
          <header className="client-packet-header">
            <div>
              <p className="client-packet-brand">{brand.company || 'ABQ ADU'}</p>
              <p className="client-packet-tagline">A little more room. A lot more possibility.</p>
            </div>
            <address>
              {brand.phone ? <div>{brand.phone}</div> : null}
              {brand.address ? <div>{brand.address}</div> : null}
            </address>
          </header>

          <div className="client-packet-title-row">
            <div>
              <p className="client-packet-eyebrow">Prepared for {project.client || 'Homeowner'}</p>
              <h1 id={headingId}>Estimate &amp; payment schedule</h1>
              {dateLabel ? <p className="client-packet-date">Prepared {dateLabel}</p> : null}
            </div>
            <span className="client-packet-status">{preview.status || 'Draft'}</span>
          </div>
          <p id={descriptionId} className="client-packet-intro">For your review. This draft is an estimate and proposed payment schedule; it is not a request for payment.</p>

          <section className="client-packet-project" aria-label="Project estimate">
            <dl>
              <div><dt>Project address</dt><dd>{project.address || 'To be confirmed'}</dd></div>
              <div><dt>Your ADU</dt><dd>{project.model || 'Model to be confirmed'}{project.sqft ? <span> · {Number(project.sqft).toLocaleString('en-US')} sq ft</span> : null}</dd></div>
            </dl>
            <div className="client-packet-total">
              <span>Estimated project total</span>
              <strong>{money(project.bid_total)}</strong>
            </div>
          </section>

          <section className="client-packet-schedule" aria-labelledby={`${headingId}-schedule`}>
            <h2 id={`${headingId}-schedule`}>Your payment stages</h2>
            <p className="client-packet-section-note">Payments follow the agreed contract and project milestones.</p>
            {stages.length ? (
              <ol className="client-packet-stages">
                {stages.map((stage, index) => (
                  <li className="client-packet-stage" key={stage.id || `${index}-${stage.label}`}>
                    <span className="client-packet-stage-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <div className="client-packet-stage-detail">
                      <h3>{stage.label || `Payment stage ${index + 1}`}</h3>
                      {stage.notes ? <p>{stage.notes}</p> : null}
                      <span className="client-packet-stage-status">{stage.status || 'Draft'}</span>
                    </div>
                    <strong className="client-packet-stage-amount">{money(stage.amount)}</strong>
                  </li>
                ))}
              </ol>
            ) : <p>Payment stages will be confirmed after project review.</p>}
          </section>

          <section className="client-packet-review" aria-labelledby={`${headingId}-review`}>
            <h2 id={`${headingId}-review`}>Review notes</h2>
            {preview.readiness_label ? <p><strong>Project review:</strong> {preview.readiness_label}</p> : null}
            <p>{preview.notes || 'Final scope, pricing, and payment terms are subject to project review and a signed agreement.'}</p>
          </section>
          <footer className="client-packet-footer">
            <span>{brand.company || 'ABQ ADU'} · Built around your life.</span>
            <span>Draft estimate · Prepared for {project.client || 'homeowner'}</span>
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}
