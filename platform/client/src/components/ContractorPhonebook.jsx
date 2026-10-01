import React, { useEffect, useId, useRef, useState } from 'react';
import contacts from '../data/contractorContacts.json';
import './ContractorPhonebook.css';

const jurisdictions = [...new Set(contacts.map(contact => contact.city))].sort((a, b) => a.localeCompare(b));
const digits = value => String(value || '').replace(/\D/g, '');
const phoneLabel = value => {
  const number = digits(value).replace(/^1(?=\d{10}$)/, '');
  return number.length === 10 ? `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}` : value;
};
const phoneHref = value => {
  const number = digits(value);
  return `tel:+${number.length === 10 ? '1' : ''}${number}`;
};

function ContactCard({ contact }) {
  return <article className="contractor-phonebook__card" data-contact-id={contact.id} aria-labelledby={`phonebook-${contact.id}`}>
    <p className="contractor-phonebook__category">{contact.city} <span aria-hidden="true">·</span> {contact.group}</p>
    <h3 id={`phonebook-${contact.id}`}>{contact.name}</h3>
    <p className="contractor-phonebook__role">{contact.role}</p>
    {contact.address && <div className="contractor-phonebook__address">
      <strong>{contact.addressLabel || 'Address'}</strong>
      <address>{contact.address}</address>
    </div>}
    <div className="contractor-phonebook__actions">
      {contact.phone && <a className="contractor-phonebook__call" href={phoneHref(contact.phone)} aria-label={`Call ${contact.name} at ${phoneLabel(contact.phone)}`}>Call {phoneLabel(contact.phone)}</a>}
      {contact.email && <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>{contact.email}</a>}
      {contact.source && <a href={contact.source} target="_blank" rel="noopener noreferrer" aria-label={`Official source for ${contact.name} (opens in a new tab)`}>Official source <span aria-hidden="true">↗</span></a>}
    </div>
    <details className="contractor-phonebook__verification">
      <summary>Office details &amp; verification</summary>
      {contact.note && <p>{contact.note}</p>}
      <dl><div><dt>Fax</dt><dd data-fax>{contact.fax ? phoneLabel(contact.fax) : 'Not provided'}</dd></div></dl>
      {contact.verificationNote && <p>{contact.verificationNote}</p>}
      {contact.previousAddress && <p><strong>Previously supplied address (outdated)</strong><br />{contact.previousAddress}</p>}
    </details>
  </article>;
}

export default function ContractorPhonebook() {
  const [query, setQuery] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const section = useRef(null);
  const id = useId();
  useEffect(() => {
    if (window.location.hash === '#contractor-phonebook' && section.current) section.current.open = true;
    const reveal = () => {
      if (window.location.hash !== '#contractor-phonebook' || !section.current) return;
      section.current.open = true;
      section.current.scrollIntoView?.({ block: 'start' });
    };
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);

  const search = query.trim().toLowerCase();
  const numberSearch = /^[\d\s()+.-]+$/.test(search) ? digits(search) : '';
  const matches = contacts.filter(contact => {
    if (jurisdiction && contact.city !== jurisdiction) return false;
    const text = [contact.name, contact.role, contact.group, contact.city, contact.address,
      contact.previousAddress, contact.email, contact.note, contact.phone, contact.fax].filter(Boolean).join(' ').toLowerCase();
    return !search || text.includes(search) || (numberSearch && [contact.phone, contact.fax].some(number => digits(number).includes(numberSearch)));
  });

  return <details id="contractor-phonebook" className="contractor-phonebook" ref={section}>
    <summary className="contractor-phonebook__summary">
      <span><strong>Contractor phone book</strong><span className="contractor-phonebook__subtitle">County offices, permits &amp; inspections</span></span>
      <span className="contractor-phonebook__total">{contacts.length} offices</span>
    </summary>
    <div className="contractor-phonebook__content">
      <p className="contractor-phonebook__intro">Find the right office. Mailing addresses and office locations are labeled separately; open the details for fax numbers and verification notes.</p>
      <div className="contractor-phonebook__filters">
        <label htmlFor={`${id}-search`}>Find an office
          <input id={`${id}-search`} type="search" aria-label="Search contractor phone book" value={query} onChange={event => setQuery(event.target.value)} placeholder="Office, jurisdiction, address, or number" />
        </label>
        <label htmlFor={`${id}-jurisdiction`}>Jurisdiction
          <select id={`${id}-jurisdiction`} aria-label="Phone book jurisdiction" value={jurisdiction} onChange={event => setJurisdiction(event.target.value)}>
            <option value="">All jurisdictions</option>
            {jurisdictions.map(city => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
        {(query || jurisdiction) && <button type="button" onClick={() => { setQuery(''); setJurisdiction(''); }}>Clear filters</button>}
      </div>
      <p className="contractor-phonebook__results" role="status">{matches.length} {matches.length === 1 ? 'office' : 'offices'}{matches.length !== contacts.length ? ` of ${contacts.length}` : ''}</p>
      {matches.length ? <div className="contractor-phonebook__grid">{matches.map(contact => <ContactCard key={contact.id} contact={contact} />)}</div>
        : <p className="contractor-phonebook__empty">No offices match. Try another office name or clear the filters.</p>}
    </div>
  </details>;
}
