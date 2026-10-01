import { useEffect, useRef, useState } from 'react';
import { isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';

export default function useEstimateDictation({ owner, value, onChange }) {
  const recognition = useRef(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(() => {
    function stop() {
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onresult = null; current.onend = null; current.onerror = null;
      try { current.abort(); } catch { /* Already stopped. */ }
    }
    }
    const unsubscribe = subscribeAuthSession(() => {
      if (!isAuthSessionCurrent(owner)) { stop(); setListening(false); }
    });
    return () => { unsubscribe(); stop(); };
  }, [owner]);

  function toggle() {
    if (recognition.current) {
      try { recognition.current.stop(); } catch {
        const current = recognition.current;
        recognition.current = null; setListening(false);
        try { current.abort(); } catch { /* Already stopped. */ }
        setMessage('Dictation stopped. Review your scope before saving.');
      }
      return;
    }
    if (!Recognition || !isAuthSessionCurrent(owner)) return;
    let current;
    try { current = new Recognition(); }
    catch { setMessage('Dictation is unavailable. You can type or use your keyboard microphone.'); return; }
    const original = value.trimEnd();
    const active = () => recognition.current === current && isAuthSessionCurrent(owner);
    current.lang = 'en-US'; current.continuous = true; current.interimResults = true;
    current.onresult = event => {
      if (!active()) return;
      const spoken = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim();
      onChange([original, spoken].filter(Boolean).join('\n').slice(0, 5000));
    };
    current.onend = () => {
      if (!active()) return;
      recognition.current = null; setListening(false);
      setMessage('Dictation stopped. Review your scope before saving.');
    };
    current.onerror = event => {
      if (!active()) return;
      recognition.current = null; setListening(false);
      setMessage(event.error === 'not-allowed' ? 'Microphone permission was denied. You can still type your scope.' : 'Dictation stopped. Your captured words are still editable.');
      try { current.abort(); } catch { /* Already stopped. */ }
    };
    recognition.current = current;
    setListening(true); setMessage('Listening… Stop when finished, then review the words.');
    try { current.start(); }
    catch {
      recognition.current = null; setListening(false);
      setMessage('Dictation could not start. You can type or use your keyboard microphone.');
      try { current.abort(); } catch { /* Nothing started. */ }
    }
  }
  return { supported: Boolean(Recognition), listening, message, toggle };
}
