import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API = '/api';

const STATUS_LABELS = {
  idle: 'Idle',
  launching: 'Launching browser & logging in…',
  waiting_verify: 'Waiting for verification code',
  verifying: 'Verifying code…',
  waiting_email_verify: 'Waiting for email verification code',
  verifying_email: 'Verifying email code…',
  scraping: 'Processing active complaint…',
  done: 'Done',
  error: 'Error',
};

export default function App() {
  const [sessionStatus, setSessionStatus] = useState('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState(null);
  // TOTP verification
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  // Email verification (second factor)
  const [emailVerifyCode, setEmailVerifyCode] = useState('');
  const [emailVerifyError, setEmailVerifyError] = useState('');
  const [emailVerifySubmitting, setEmailVerifySubmitting] = useState(false);
  const [emailCodePrefix, setEmailCodePrefix] = useState(null);
  // Session display only; complaint data stays on the backend.
  const [timeLeft, setTimeLeft] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      const data = await res.json();
      setSessionStatus(data.status);
      setSessionActive(data.active);
      setTimeLeft(data.keepAliveSecondsLeft);
      if (data.error) setError(data.error);
      if (data.verifyError) {
        setVerifyError(data.verifyError);
        setVerifySubmitting(false);
      } else {
        if (data.status === 'waiting_verify') setVerifySubmitting(false);
        if (data.status !== 'waiting_verify') setVerifyError('');
      }
      if (data.emailVerifyError) {
        setEmailVerifyError(data.emailVerifyError);
        setEmailVerifySubmitting(false);
      } else {
        if (data.status === 'waiting_email_verify') setEmailVerifySubmitting(false);
        if (data.status !== 'waiting_email_verify') setEmailVerifyError('');
      }
      if (data.emailCodePrefix) setEmailCodePrefix(data.emailCodePrefix);
      if (data.status === 'done' || data.status === 'error') stopPolling();
    } catch (pollError) {
      console.error('Poll error:', pollError);
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 3000);
    poll();
  }, [poll]);

  useEffect(() => {
    poll();
    return () => stopPolling();
  }, [poll, stopPolling]);

  const handleReady = async () => {
    if (sessionActive) return;
    setError(null);
    setVerifyCode('');
    setVerifyError('');
    setVerifySubmitting(false);
    setEmailVerifySubmitting(false);
    try {
      const res = await fetch(`${API}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start session');
        return;
      }
      setSessionActive(true);
      setSessionStatus('launching');
      startPolling();
    } catch {
      setError('Cannot reach backend. Is it running on port 3001?');
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!verifyCode.trim()) {
      setVerifyError('Please enter the verification code.');
      return;
    }
    setVerifyError('');
    setVerifySubmitting(true);
    try {
      const res = await fetch(`${API}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = await res.json();
      // Only the ack is returned here — the real result arrives via polling.
      if (!res.ok) { setVerifyError(data.error || 'Verification failed'); setVerifySubmitting(false); }
    } catch (e) { setVerifyError('Cannot reach backend.'); setVerifySubmitting(false); }
  };

  const handleEmailVerify = async (event) => {
    event.preventDefault();
    if (!emailVerifyCode.trim()) {
      setEmailVerifyError('Please enter the code from your email.');
      return;
    }
    setEmailVerifyError('');
    setEmailVerifySubmitting(true);
    try {
      const res = await fetch(`${API}/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailVerifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setEmailVerifyError(data.error || 'Verification failed');
    } catch {
      setEmailVerifyError('Cannot reach backend.');
    } finally {
      setEmailVerifySubmitting(false);
    }
  };

  const handleReset = useCallback(async () => {
    stopPolling();
    await fetch(`${API}/reset`, { method: 'POST' }).catch(() => {});
    setSessionStatus('idle');
    setSessionActive(false);
    setError(null);
    setVerifyCode('');
    setVerifyError('');
    setVerifySubmitting(false);
    setEmailVerifyCode('');
    setEmailVerifyError('');
    setEmailVerifySubmitting(false);
    setEmailCodePrefix(null);
    setTimeLeft(null);
  }, [stopPolling]);

  useEffect(() => {
    if (sessionStatus === 'done') handleReset();
  }, [handleReset, sessionStatus]);

  const isIdle = sessionStatus === 'idle';
  const isWaitingVerify = sessionStatus === 'waiting_verify';
  const isWaitingEmailVerify = sessionStatus === 'waiting_email_verify';
  const isTerminal = sessionStatus === 'done' || sessionStatus === 'error';
  const isBusy = sessionActive && !isWaitingVerify && !isWaitingEmailVerify;
  const formatTime = (seconds) => seconds === null
    ? ''
    : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return (
    <div className="cfpb-app">
      {/* Header */}
      <header className="cfpb-header">
        <div className="cfpb-header__inner">
          <div className="cfpb-logo">
            <span className="cfpb-logo__icon">🛡</span>
            <span className="cfpb-logo__cfpb">CFPB</span>
            <span className="cfpb-logo__text">Company Portal</span>
          </div>
        </div>
      </header>
      <main className="cfpb-main">
        {/* Session Manager Card */}
        <section className="cfpb-card cfpb-status-card">
          <h1 className="cfpb-card__title">Session Manager</h1>
          {timeLeft !== null && !isTerminal && (
            <div className="cfpb-timer">
              <span className="cfpb-timer__label">Session expires in</span>
              <span className={`cfpb-timer__value ${timeLeft < 60 ? 'cfpb-timer__value--urgent' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
          )}
          {error && <div className="cfpb-alert cfpb-alert--error" role="alert"><strong>Error:</strong> {error}</div>}
          {isIdle && <button className="cfpb-btn cfpb-btn--ready" onClick={handleReady} aria-label="Start portal session"><span className="cfpb-btn__icon">▶</span> Ready</button>}
          {isBusy && <div className="cfpb-spinner-wrap" aria-live="polite"><div className="cfpb-spinner" aria-hidden="true" /><p className="cfpb-spinner__text">{STATUS_LABELS[sessionStatus]}</p></div>}
          {isWaitingVerify && <form className="cfpb-verify-form" onSubmit={handleVerify} noValidate>
            <p className="cfpb-verify-form__info">A verification code was sent to your registered method.<br />Enter it below within the time limit.</p>
            <div className="cfpb-field">
              <label className="cfpb-field__label" htmlFor="verifyCode">Verification Code</label>
              <input id="verifyCode" className="cfpb-field__input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code…" value={verifyCode} maxLength={8} onChange={(event) => { setVerifyCode(event.target.value); setVerifyError(''); }} disabled={verifySubmitting} />
              {verifyError && <span className="cfpb-field__error" role="alert">{verifyError}</span>}
            </div>
            <button type="submit" className="cfpb-btn cfpb-btn--submit" disabled={verifySubmitting || !verifyCode.trim()}>{verifySubmitting ? 'Submitting…' : 'Submit Code'}</button>
          </form>}
          {/* Email verification (second factor, first login of the day) */}
          {isWaitingEmailVerify && <form className="cfpb-verify-form" onSubmit={handleEmailVerify} noValidate>
            <div className="cfpb-verify-form__email-badge"><span className="cfpb-verify-form__email-icon">✉️</span><span className="cfpb-verify-form__email-label">Email Verification Required</span></div>
            <p className="cfpb-verify-form__info">A verification code was emailed to your registered email address.<br />{emailCodePrefix ? <>The code in your email starts with: <code className="cfpb-code-prefix">{emailCodePrefix}</code></> : 'Enter the full code from that email below.'}</p>
            <div className="cfpb-field">
              <label className="cfpb-field__label" htmlFor="emailVerifyCode">Email Verification Code</label>
              <input id="emailVerifyCode" className="cfpb-field__input" type="text" autoComplete="one-time-code" placeholder={emailCodePrefix ? `${emailCodePrefix}…` : 'Enter full code…'} value={emailVerifyCode} maxLength={20} onChange={(event) => { setEmailVerifyCode(event.target.value); setEmailVerifyError(''); }} disabled={emailVerifySubmitting} autoFocus />
              {emailVerifyError && <span className="cfpb-field__error" role="alert">{emailVerifyError}</span>}
            </div>
            <button type="submit" className="cfpb-btn cfpb-btn--submit" disabled={emailVerifySubmitting || !emailVerifyCode.trim()}>{emailVerifySubmitting ? 'Submitting…' : 'Submit Email Code'}</button>
          </form>}
          {!isIdle && <button className="cfpb-btn cfpb-btn--reset" onClick={handleReset} aria-label="Reset session">✕ Reset Session</button>}
        </section>

        {/* Complaint Detail Section (disabled: complaint data is backend-only)
        // {isDone && detail && (
        //   <section className="cfpb-detail">
        //     <div className="cfpb-detail__topbar">
        //       <div className="cfpb-detail__back-label">Active Complaints</div>
        //       <h2 className="cfpb-detail__id">{detail.complaintId || 'Complaint Detail'}</h2>
        //     </div>
        //     <div className="cfpb-detail__layout">
        //       <div className="cfpb-detail__main">
        //         {Object.keys(detail.allFields).length > 0 && (
        //           <div className="cfpb-section-card">
        //             <h3 className="cfpb-section-card__title">Complaint information</h3>
        //             <div className="cfpb-fields-grid">
        //               {Object.entries(detail.allFields).map(([label, value]) => (
        //                 <div className="cfpb-field-item" key={label}>
        //                   <span className="cfpb-field-item__label">{label}</span>
        //                   <span className="cfpb-field-item__value">{value}</span>
        //                 </div>
        //               ))}
        //             </div>
        //           </div>
        //         )}
        //         {Object.entries(detail.sections || {}).map(([title, content]) => (
        //           content && (
        //             <div className="cfpb-section-card" key={title}>
        //               <h3 className="cfpb-section-card__title">{title}</h3>
        //               <div className="cfpb-narrative">{content}</div>
        //             </div>
        //           )
        //         ))}
        //         {detail.narrative && (
        //           <div className="cfpb-section-card">
        //             <h3 className="cfpb-section-card__title">What happened</h3>
        //             <div className="cfpb-narrative">{detail.narrative}</div>
        //           </div>
        //         )}
        //         {detail.attachments?.length > 0 && (
        //           <div className="cfpb-section-card">
        //             <h3 className="cfpb-section-card__title">Attachments</h3>
        //             <ul className="cfpb-attachments">
        //               {detail.attachments.map((attachment) => (
        //                 <li key={attachment.href} className="cfpb-attachment">
        //                   <a href={attachment.href} target="_blank" rel="noreferrer">{attachment.name}</a>
        //                 </li>
        //               ))}
        //             </ul>
        //           </div>
        //         )}
        //         <button className="cfpb-btn-json" onClick={() => setShowJson((value) => !value)}>
        //           {showJson ? 'Hide JSON Data' : 'View Raw JSON Data'}
        //         </button>
        //         {showJson && <pre className="cfpb-json-viewer__pre">{JSON.stringify(detail, null, 2)}</pre>}
        //       </div>
        //       <aside className="cfpb-detail__sidebar">
        //         <div className="cfpb-sidebar-card">
        //           <h4 className="cfpb-sidebar-card__heading">COMPLAINT STATUS</h4>
        //           <strong>{detail.complaintStatus}</strong>
        //         </div>
        //       </aside>
        //     </div>
        //   </section>
        // )} */}

      </main>
    </div>
  );
}
