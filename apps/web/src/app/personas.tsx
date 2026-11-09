// Persona route groups. Each persona folder (apps/web/src/personas/<name>/index.tsx,
// default export = that persona's <Routes>) is discovered at build time and lazy-loaded
// under its prefix, so persona owners never edit the shell.
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Link } from 'react-router';
import type { Role } from '@lanyard/contracts';

export interface PersonaDef {
  persona: string;
  role: Role;
  prefix: string;
  label: string;
}

export const PERSONAS: PersonaDef[] = [
  { persona: 'attendee', role: 'attendee', prefix: '/a', label: 'Attendee' },
  { persona: 'speaker', role: 'speaker', prefix: '/s', label: 'Speaker' },
  { persona: 'organizer', role: 'organizer', prefix: '/o', label: 'Organizer' },
  { persona: 'vendor', role: 'vendor', prefix: '/v', label: 'Vendor' },
  { persona: 'venue', role: 'venue', prefix: '/venue', label: 'Venue' },
];

const modules = import.meta.glob<{ default: ComponentType }>('../personas/*/index.tsx');

const loaded = new Map<string, LazyExoticComponent<ComponentType>>();
function personaComponent(persona: string): LazyExoticComponent<ComponentType> | undefined {
  const load = modules[`../personas/${persona}/index.tsx`];
  if (!load) return undefined;
  let c = loaded.get(persona);
  if (!c) {
    c = lazy(load);
    loaded.set(persona, c);
  }
  return c;
}

export function PersonaOutlet({ def }: { def: PersonaDef }) {
  const Component = personaComponent(def.persona);
  if (!Component) {
    return (
      <main className="shell">
        <h1>{def.label}</h1>
        <p className="muted">
          This view is on its way. (Add <code>src/personas/{def.persona}/index.tsx</code>.)
        </p>
        <Link to="/">Back</Link>
      </main>
    );
  }
  return (
    <Suspense fallback={<p className="shell muted">Loading…</p>}>
      <Component />
    </Suspense>
  );
}
