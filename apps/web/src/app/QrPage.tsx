// `/qr/:eventId`: a big join QR for the screen at the front of the room.
// Always dark-on-light so phone cameras read it in every theme.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { encode } from 'uqr';
import { EVENT_NAMES, Wordmark, joinUrl } from './brand';

function QrCode({ text, label }: { text: string; label: string }) {
  const { size, data } = useMemo(() => encode(text, { ecc: 'M', border: 4 }), [text]);
  let d = '';
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg className="qr__code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

export function QrPage() {
  const { eventId = '' } = useParams();
  const name = EVENT_NAMES[eventId];

  if (!name) {
    return (
      <main className="page" id="main">
        <header className="page__brand">
          <Wordmark />
        </header>
        <h1>We don’t know that event</h1>
        <p className="muted">Check the link, or start from the home page.</p>
        <Link className="ly-btn" to="/">
          Go to Lanyard
        </Link>
      </main>
    );
  }

  const url = joinUrl(eventId);
  return (
    <main className="qr" id="main">
      <div className="qr__text">
        <Wordmark size="lg" />
        <h1>{name}</h1>
        <p className="qr__lede">Scan to join. Live captions, anonymous questions, no sign-up.</p>
        <p className="qr__url">{url.replace(/^https?:\/\//, '')}</p>
      </div>
      <QrCode text={url} label={`QR code to join ${name}: ${url}`} />
    </main>
  );
}
