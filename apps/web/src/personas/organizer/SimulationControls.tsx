import { useEffect, useRef, useState } from 'react';
import { formatTime, SimulationControlRequest, SimulationStatus } from '@lanyard/contracts';
import { api, ApiError } from '../../app/api';

export function SimulationNotice({ status, timezone }: { status: SimulationStatus; timezone: string }) {
  return <p className="ops-sim-notice" role="status">
    <strong>SIMULATED</strong>{' '}
    {status.stopping ? `Stopping · removing ${status.attendees} virtual attendees`
      : status.running ? `${status.attendees} virtual attendees · auto-stop ${status.endsAt ? formatTime(status.endsAt, timezone) : 'within 10 minutes'}`
      : 'Crowd simulator is stopped'}
    {(status.running || status.stopping) && <span>Virtual activity is included in the room readings below.</span>}
  </p>;
}

export function SimulationControls({ eventId, timezone }: { eventId: string; timezone: string }) {
  const [status, setStatus] = useState<SimulationStatus>();
  const [attendees, setAttendees] = useState(40);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const mutation = useRef(false);
  const path = `/events/${encodeURIComponent(eventId)}/ops/simulation`;
  useEffect(() => {
    let gone = false;
    let loading = false;
    const invalidate = () => { generation.current++; };
    const refresh = async () => {
      if (loading || mutation.current) return;
      loading = true;
      const version = generation.current;
      try {
        const next = SimulationStatus.parse(await api.get(path));
        if (!gone && version === generation.current) { setStatus(next); setError(''); }
      } catch {
        if (!gone && version === generation.current) setError('Simulator status unavailable. Last known state is shown.');
      } finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { gone = true; invalidate(); clearInterval(timer); };
  }, [path]);

  async function toggle() {
    const body = SimulationControlRequest.safeParse({ running: !status?.running, attendees });
    if (!body.success) { setError('Choose between 1 and 200 virtual attendees.'); return; }
    const version = ++generation.current;
    mutation.current = true;
    setPending(true); setError('');
    try {
      const next = SimulationStatus.parse(await api.post(path, body.data));
      if (version === generation.current) setStatus(next);
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof ApiError && cause.code === 'simulation_sessions'
        ? 'Start concurrent Main Stage and Side Stage sessions before simulating a crowd.'
        : 'Simulator change failed. Check its status and retry.');
    } finally {
      mutation.current = false;
      if (version === generation.current) setPending(false);
    }
  }
  return <section className={`ops-sim ${status?.running || status?.stopping ? 'ops-sim-active' : ''}`} aria-label="SIMULATED crowd controls">
    <div>
      {status ? <SimulationNotice status={status} timezone={timezone} /> : <p role="status"><strong>SIMULATED</strong> · checking crowd status…</p>}
      <p className="ops-sim-help">CNH Demos only · 200 people maximum · stops after 10 minutes</p>
      {error && <p role="status">{error}</p>}
    </div>
    <div className="ops-sim-actions">
      <label>Virtual attendees <input type="number" min="1" max="200" value={attendees}
        disabled={pending || status?.running || status?.stopping}
        onChange={event => setAttendees(Number(event.target.value))} /></label>
      <button onClick={() => void toggle()} disabled={pending || !status || status.stopping || Boolean(error && !status.running)}>
        {pending ? 'Updating…' : status?.stopping ? 'Removing crowd…' : status?.running ? 'Stop simulated crowd' : 'Start simulated crowd'}
      </button>
    </div>
  </section>;
}
