import React, { useEffect, useRef, useState } from 'react';

export default function BriefingAudio({ text, subject = 'job' }) {
  const [mode,setMode]=useState('idle');
  const [error,setError]=useState('');
  const generation=useRef(0);
  const utterance=useRef(null);
  const supported=Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  useEffect(()=>()=>{generation.current+=1;window.speechSynthesis?.cancel();utterance.current=null;},[text]);
  const stop=()=>{generation.current+=1;window.speechSynthesis?.cancel();utterance.current=null;setMode('idle');};
  const play=()=>{
    stop();setError('');
    const token=generation.current;
    // Keep each utterance short so mobile browsers can finish a longer briefing reliably.
    const chunks=text.trim().split(/\s+/).reduce((parts,word)=>{
      const last=parts.length-1;
      if(last<0 || parts[last].length+word.length+1>240)parts.push(word);
      else parts[last]+=` ${word}`;
      return parts;
    },[]);
    const next=index=>{
      if(token!==generation.current)return;
      if(index>=chunks.length){setMode('idle');utterance.current=null;return;}
      const speech=new window.SpeechSynthesisUtterance(chunks[index].trim());
      speech.lang='en-US';speech.rate=0.95;
      speech.onend=()=>next(index+1);
      speech.onerror=()=>{if(token===generation.current){generation.current+=1;utterance.current=null;window.speechSynthesis.cancel();setMode('idle');setError('Audio could not play. Read the briefing below or try again.');}};
      utterance.current=speech;
      try{window.speechSynthesis.speak(speech);}catch{speech.onerror();}
    };
    setMode('playing');next(0);
  };
  return <div className="briefing-audio">
    {supported ? <div className="helper-buttons">
      {mode==='idle' ? <button className="helper-primary" onClick={play}>Listen to briefing</button> : <>
        <button className="helper-primary" onClick={()=>{if(mode==='paused'){window.speechSynthesis.resume();setMode('playing');}else{window.speechSynthesis.pause();setMode('paused');}}}>{mode==='paused'?'Resume':'Pause'}</button>
        <button onClick={stop}>Stop audio</button>
      </>}
      <span className="helper-muted" role="status">{mode==='idle' ? `About ${Math.max(1,Math.ceil(text.split(/\s+/).length/140))} min · your ${subject} briefing` : mode==='paused'?'Audio paused':'Playing your briefing…'}</span>
    </div> : <p className="helper-muted">Audio is unavailable in this browser. Read the briefing below.</p>}
    {error && <p role="alert">{error}</p>}
    <details><summary>Read the briefing</summary><p className="briefing-transcript">{text}</p></details>
  </div>;
}
