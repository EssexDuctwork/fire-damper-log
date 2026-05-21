// @ts-nocheck
// Fire Damper Installation Log — with Supabase cloud sync
// ── Install: npm install @supabase/supabase-js
// ── Add to .env.local: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { generateProjectPDF } from "./pdfExport";

// ── Supabase client ───────────────────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

// ── Constants ─────────────────────────────────────────────────────────────
const PHOTO_STAGES = [
  {
    id: 'wall_front',
    label: 'Wall Penetration — Front',
    icon: 'ti-wall',
    hint: 'Wall opening front view',
  },
  {
    id: 'wall_back',
    label: 'Wall Penetration — Back',
    icon: 'ti-wall',
    hint: 'Wall opening rear view',
  },
  {
    id: 'damper_front',
    label: 'Fire Damper Installed — Front',
    icon: 'ti-shield-check',
    hint: 'Damper installed, front',
  },
  {
    id: 'damper_back',
    label: 'Fire Damper Installed — Back',
    icon: 'ti-shield-check',
    hint: 'Damper installed, rear',
  },
  {
    id: 'damper_open',
    label: 'Fire Damper — Open',
    icon: 'ti-door-enter',
    hint: 'Blade in open position',
  },
  {
    id: 'damper_closed',
    label: 'Fire Damper — Closed',
    icon: 'ti-door-off',
    hint: 'Blade in closed position',
  },
];
const DAMPER_TYPES = [
  'Circular Sleeve',
  'Rectangular Sleeve',
  'Motorised',
  'Gravity (Blade)',
  'Curtain / Intumescent',
  'Combination Fire/Smoke',
];
const PLATE_TYPES = [
  'Steel Closure Plate',
  'Galvanised Closure Plate',
  'Stainless Closure Plate',
  'Mineral Wool & Sealant',
  'No Plate — Ductwork Continuation',
];
const MANUFACTURERS = [
  'Actionair',
  'Gilberts',
  'Halton',
  'Trox',
  'Flakt Woods',
  'Price Industries',
  'Other',
];

const AMBER = '#BA7517';
const GREEN = '#3B6D11';

// ── Local storage helpers ─────────────────────────────────────────────────
const local = {
  get: (k) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ── Image compression ─────────────────────────────────────────────────────
function compressImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1200 / img.width, 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * ratio);
      c.height = Math.round(img.height * ratio);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Supabase sync helpers ─────────────────────────────────────────────────
async function uploadPhotos(logId, photos) {
  if (!db || !photos) return {};
  const urls = {};
  for (const [stageId, dataUrl] of Object.entries(photos)) {
    if (!dataUrl || !dataUrl.startsWith('data:')) continue;
    try {
      const base64 = dataUrl.split(',')[1];
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'image/jpeg' });
      const path = `${logId}/${stageId}.jpg`;
      const { error } = await db.storage
        .from('damper-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = db.storage.from('damper-photos').getPublicUrl(path);
        urls[stageId] = data.publicUrl;
      }
    } catch {}
  }
  return urls;
}

async function pushLog(log, photos) {
  if (!db) return false;
  try {
    const photoUrls = await uploadPhotos(log.id, photos);
    const record = { ...log, photo_urls: photoUrls, synced: true };
    const { error } = await db.from('fire_damper_logs').upsert(record);
    return !error;
  } catch {
    return false;
  }
}

async function pushSchedule(schedule) {
  if (!db) return;
  try {
    await db.from('fire_damper_schedules').upsert(schedule);
  } catch {}
}

// ── QR component ──────────────────────────────────────────────────────────
let qrReady = false;
function loadQR() {
  if (window.QRCode) return Promise.resolve(true);
  if (qrReady)
    return new Promise((r) => setTimeout(() => r(!!window.QRCode), 1500));
  qrReady = true;
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
function QRDisplay({ value, size = 120 }) {
  const ref = useRef();
  const [err, setErr] = useState(false);
  useEffect(() => {
    loadQR().then((ok) => {
      if (ok && ref.current && window.QRCode)
        window.QRCode.toCanvas(
          ref.current,
          value || 'FD',
          { width: size, margin: 2 },
          (e) => {
            if (e) setErr(true);
          }
        );
      else setErr(true);
    });
  }, [value, size]);
  if (err)
    return (
      <div
        style={{
          width: size,
          height: size,
          background: 'var(--color-background-secondary)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
          padding: 8,
          boxSizing: 'border-box',
        }}
      >
        QR needs
        <br />
        internet
      </div>
    );
  return <canvas ref={ref} style={{ borderRadius: 4, display: 'block' }} />;
}

// ── UI atoms ──────────────────────────────────────────────────────────────
function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
        {required && <span style={{ color: '#E24B4A', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && (
        <p
          style={{
            margin: '3px 0 0',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
const iStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 'var(--border-radius-md)',
  border: '0.5px solid var(--color-border-secondary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: 14,
  fontFamily: 'inherit',
};
function Inp(p) {
  return <input {...p} style={iStyle} />;
}
function Sel({ children, ...p }) {
  return (
    <select {...p} style={iStyle}>
      {children}
    </select>
  );
}
function Card({ children, style }) {
  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '16px 18px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function Badge({ color, children }) {
  const c = {
    green: { bg: '#EAF3DE', fg: '#3B6D11' },
    amber: { bg: '#FAEEDA', fg: '#854F0B' },
    red: { bg: '#FCEBEB', fg: '#A32D2D' },
    blue: { bg: '#E6F1FB', fg: '#185FA5' },
    gray: {
      bg: 'var(--color-background-secondary)',
      fg: 'var(--color-text-secondary)',
    },
  }[color] || {
    bg: 'var(--color-background-secondary)',
    fg: 'var(--color-text-secondary)',
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 'var(--border-radius-md)',
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
function SecHead({ icon, title }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '0.5px solid var(--color-border-tertiary)',
      }}
    >
      <i
        className={`ti ${icon}`}
        style={{ fontSize: 18, color: AMBER }}
        aria-hidden="true"
      />
      <span style={{ fontWeight: 500, fontSize: 15 }}>{title}</span>
    </div>
  );
}
function NavBtn({ onClick, label, icon, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 18px',
        borderRadius: 'var(--border-radius-md)',
        border: color ? 'none' : '0.5px solid var(--color-border-secondary)',
        background: color || 'var(--color-background-secondary)',
        color: color ? '#fff' : 'var(--color-text-primary)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: color ? 500 : 400,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon && (
        <i
          className={`ti ${icon}`}
          style={{ fontSize: 15 }}
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );
}

// ── Sync status icon ──────────────────────────────────────────────────────
function SyncIcon({ status }) {
  if (status === 'syncing')
    return (
      <i
        className="ti ti-loader-2"
        style={{
          fontSize: 14,
          color: '#185FA5',
          animation: 'spin 1s linear infinite',
        }}
        aria-label="Syncing"
      />
    );
  if (status === 'pending')
    return (
      <i
        className="ti ti-cloud-upload"
        style={{ fontSize: 14, color: '#854F0B' }}
        aria-label="Pending sync"
      />
    );
  if (status === 'failed')
    return (
      <i
        className="ti ti-cloud-x"
        style={{ fontSize: 14, color: '#A32D2D' }}
        aria-label="Sync failed"
      />
    );
  return (
    <i
      className="ti ti-cloud-check"
      style={{ fontSize: 14, color: '#3B6D11' }}
      aria-label="Synced"
    />
  );
}

// ── Photo Upload ──────────────────────────────────────────────────────────
function PhotoUpload({ stage, photo, onChange }) {
  const ref = useRef();
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      onChange(stage.id, await compressImage(ev.target.result));
    };
    reader.readAsDataURL(file);
  };
  return (
    <div
      style={{
        border: `1.5px solid ${
          photo ? '#639922' : 'var(--color-border-secondary)'
        }`,
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
        background: 'var(--color-background-primary)',
        transition: 'border-color 0.2s',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <i
          className={`ti ${stage.icon}`}
          style={{
            fontSize: 16,
            color: photo ? '#639922' : 'var(--color-text-secondary)',
          }}
          aria-hidden="true"
        />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
            {stage.label}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--color-text-secondary)',
            }}
          >
            {stage.hint}
          </p>
        </div>
        {photo && (
          <i
            className="ti ti-circle-check"
            style={{ fontSize: 16, color: '#639922' }}
            aria-hidden="true"
          />
        )}
      </div>
      {photo ? (
        <div style={{ position: 'relative' }}>
          <img
            src={photo}
            alt={stage.label}
            style={{
              width: '100%',
              maxHeight: 160,
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <button
            onClick={() => onChange(stage.id, null)}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              borderRadius: '50%',
              width: 26,
              height: 26,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 13,
            }}
            aria-label="Remove photo"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current.click()}
          style={{
            width: '100%',
            padding: '16px',
            background: 'var(--color-background-secondary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
            color: 'var(--color-text-secondary)',
            fontSize: 12,
          }}
        >
          <i
            className="ti ti-camera-plus"
            style={{ fontSize: 24 }}
            aria-hidden="true"
          />
          <span>Tap to take / upload photo</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ── Report View ───────────────────────────────────────────────────────────
function ReportView({ log, syncStatus, onBack }) {
  const photos = log.photos || log.photo_urls || {};
  const pc = log.photo_count ?? log.photoCount ?? 0;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <NavBtn onClick={onBack} label="Back" icon="ti-arrow-left" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SyncIcon status={syncStatus || 'synced'} />
          <Badge color={pc === 6 ? 'green' : pc > 0 ? 'amber' : 'red'}>
            {pc}/6 photos
          </Badge>
        </div>
      </div>
      <Card style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: 4,
              }}
            >
              <i
                className="ti ti-flame"
                style={{ fontSize: 18, color: AMBER }}
                aria-hidden="true"
              />
              <span style={{ fontWeight: 500, fontSize: 16 }}>
                Installation Record
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
              }}
            >
              Report no. <strong>{log.report_number || '—'}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge color="green">Submitted</Badge>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {log.date_completed}
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '5px 16px',
          }}
        >
          {[
            ['Site', log.site_name],
            ['Client', log.client_name],
            [
              'Address',
              `${log.site_address || ''} ${log.site_postcode || ''}`.trim(),
            ],
            [
              'Drawing',
              `${log.drawing_number || ''} Rev ${log.drawing_revision || ''}`,
            ],
            ['Asset / tag no.', log.asset_number],
            ['Location', log.location_description],
            [
              'Manufacturer',
              log.manufacturer === 'Other'
                ? log.manufacturer_other
                : log.manufacturer,
            ],
            ['Size', `${log.damper_size_w} × ${log.damper_size_h} mm`],
            ['Damper type', log.damper_type],
            ['Plate type', log.plate_type],
            ['Installed by', log.fitter_name],
            ['Supervisor', log.supervisor_name || '—'],
          ]
            .filter(([, v]) => v && String(v).trim())
            .map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: '5px 0',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 1,
                  }}
                >
                  {k}
                </span>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{v}</span>
              </div>
            ))}
        </div>
        {log.notes && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              borderRadius: 'var(--border-radius-md)',
              borderLeft: `2px solid ${AMBER}`,
              borderRadius: 0,
            }}
          >
            <p
              style={{
                margin: '0 0 2px',
                fontSize: 11,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 500,
              }}
            >
              Notes
            </p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
              {log.notes}
            </p>
          </div>
        )}
      </Card>
      <Card>
        <p style={{ margin: '0 0 12px', fontWeight: 500, fontSize: 14 }}>
          <i
            className="ti ti-camera"
            style={{
              fontSize: 16,
              verticalAlign: -2,
              marginRight: 6,
              color: AMBER,
            }}
            aria-hidden="true"
          />
          Installation photographs
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {PHOTO_STAGES.map((s) => (
            <div key={s.id}>
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {s.label}
              </p>
              {photos[s.id] ? (
                <img
                  src={photos[s.id]}
                  alt={s.label}
                  style={{
                    width: '100%',
                    borderRadius: 'var(--border-radius-md)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    objectFit: 'cover',
                    maxHeight: 170,
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    height: 80,
                    borderRadius: 'var(--border-radius-md)',
                    border: '0.5px dashed var(--color-border-secondary)',
                    background: 'var(--color-background-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  No photo
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Fitter Form ───────────────────────────────────────────────────────────
const blankForm = () => ({
  site_name: '',
  site_address: '',
  site_postcode: '',
  client_name: '',
  client_contact: '',
  report_number: '',
  drawing_number: '',
  drawing_revision: '',
  asset_number: '',
  location_description: '',
  manufacturer: '',
  manufacturer_other: '',
  damper_size_w: '',
  damper_size_h: '',
  damper_type: '',
  plate_type: '',
  fitter_name: '',
  date_completed: new Date().toISOString().slice(0, 10),
  notes: '',
  supervisor_name: '',
  photos: {},
});

function FitterForm({ schedules, onSubmit }) {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blankForm());
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPhoto = (id, val) =>
    setForm((f) => ({ ...f, photos: { ...f.photos, [id]: val } }));
  const photoCount = PHOTO_STAGES.filter((s) => form.photos[s.id]).length;

  const allDampers = schedules.flatMap((s) =>
    s.dampers.map((d) => ({ ...d, schedule: s }))
  );
  const matches =
    search.length > 1
      ? allDampers.filter(
          (d) =>
            d.asset_number.toLowerCase().includes(search.toLowerCase()) ||
            (d.location || '').toLowerCase().includes(search.toLowerCase())
        )
      : [];

  const prefill = (d) => {
    const s = d.schedule;
    setForm((f) => ({
      ...f,
      site_name: s.site_name,
      site_address: s.site_address || '',
      site_postcode: s.site_postcode || '',
      client_name: s.client_name || '',
      drawing_number: s.drawing_number || '',
      drawing_revision: s.drawing_revision || '',
      asset_number: d.asset_number,
      location_description: d.location || '',
      manufacturer: d.manufacturer || '',
      damper_size_w: d.damper_size_w || '',
      damper_size_h: d.damper_size_h || '',
      damper_type: d.damper_type || '',
      plate_type: d.plate_type || '',
    }));
    setStep(1);
    setSearch('');
  };

  const canSubmit =
    form.site_name && form.asset_number && form.damper_type && form.fitter_name;
  const STEPS = [
    'Find Damper',
    'Site & Client',
    'Damper Details',
    'Photos',
    'Sign Off',
  ];

  return (
    <div>
      {step > 0 && step < 5 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 5,
            }}
          >
            {STEPS.slice(1).map((s, i) => (
              <span
                key={s}
                style={{
                  fontSize: 10,
                  color: i + 1 <= step ? AMBER : 'var(--color-text-tertiary)',
                  fontWeight: i + 1 === step ? 500 : 400,
                }}
              >
                {s}
              </span>
            ))}
          </div>
          <div
            style={{
              height: 3,
              background: 'var(--color-border-tertiary)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(step / 4) * 100}%`,
                background: AMBER,
                borderRadius: 2,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {step === 0 && (
        <div>
          <Card style={{ marginBottom: 10 }}>
            <SecHead icon="ti-search" title="Find your damper" />
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                margin: '0 0 12px',
                lineHeight: 1.6,
              }}
            >
              Search by asset number or location to pre-fill details from the
              schedule. Or skip and enter manually.
            </p>
            <Field label="Asset number or location">
              <Inp
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. FD-L02-047 or Plant Room"
                autoFocus
              />
            </Field>
            {matches.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {matches.map((d) => (
                  <div
                    key={d.id || d.asset_number}
                    onClick={() => prefill(d)}
                    style={{
                      padding: '10px 12px',
                      border: '0.5px solid var(--color-border-secondary)',
                      borderRadius: 'var(--border-radius-md)',
                      marginBottom: 6,
                      cursor: 'pointer',
                      background: 'var(--color-background-secondary)',
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>
                      {d.asset_number}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {d.schedule.site_name} · {d.location} · {d.damper_type}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {search.length > 1 && matches.length === 0 && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  margin: '6px 0 0',
                }}
              >
                No scheduled dampers found — use manual entry below.
              </p>
            )}
          </Card>
          <button
            onClick={() => setStep(1)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px dashed var(--color-border-secondary)',
              background: 'var(--color-background-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <i
              className="ti ti-edit"
              style={{ fontSize: 14 }}
              aria-hidden="true"
            />{' '}
            Start manual log
          </button>
        </div>
      )}

      {step === 1 && (
        <Card>
          <SecHead icon="ti-building" title="Site information" />
          <Field label="Site name" required>
            <Inp
              value={form.site_name}
              onChange={(e) => set('site_name', e.target.value)}
              placeholder="e.g. Birmingham City Hospital"
            />
          </Field>
          <Field label="Site address">
            <Inp
              value={form.site_address}
              onChange={(e) => set('site_address', e.target.value)}
              placeholder="Street address"
            />
          </Field>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            <Field label="Postcode">
              <Inp
                value={form.site_postcode}
                onChange={(e) => set('site_postcode', e.target.value)}
                placeholder="B1 1AA"
              />
            </Field>
            <Field label="Report number">
              <Inp
                value={form.report_number}
                onChange={(e) => set('report_number', e.target.value)}
                placeholder="FD-2024-001"
              />
            </Field>
          </div>
          <Field label="Client / main contractor">
            <Inp
              value={form.client_name}
              onChange={(e) => set('client_name', e.target.value)}
              placeholder="Company name"
            />
          </Field>
          <Field label="Client contact">
            <Inp
              value={form.client_contact}
              onChange={(e) => set('client_contact', e.target.value)}
              placeholder="Name & phone or email"
            />
          </Field>
        </Card>
      )}

      {step === 2 && (
        <div>
          <Card style={{ marginBottom: 10 }}>
            <SecHead icon="ti-file-description" title="Drawing reference" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: 10,
              }}
            >
              <Field
                label="Drawing number"
                hint="Construction Issue Drawing ref"
              >
                <Inp
                  value={form.drawing_number}
                  onChange={(e) => set('drawing_number', e.target.value)}
                  placeholder="M-01-L02-VEN-001"
                />
              </Field>
              <Field label="Revision">
                <Inp
                  value={form.drawing_revision}
                  onChange={(e) => set('drawing_revision', e.target.value)}
                  placeholder="P3"
                />
              </Field>
            </div>
            <Field
              label="Damper asset / tag number"
              required
              hint="As shown on drawing"
            >
              <Inp
                value={form.asset_number}
                onChange={(e) => set('asset_number', e.target.value)}
                placeholder="FD-L02-047"
              />
            </Field>
            <Field label="Location description">
              <Inp
                value={form.location_description}
                onChange={(e) => set('location_description', e.target.value)}
                placeholder="Level 02, Plant Room — Supply Riser"
              />
            </Field>
          </Card>
          <Card>
            <SecHead icon="ti-box" title="Damper specification" />
            <Field label="Manufacturer">
              <Sel
                value={form.manufacturer}
                onChange={(e) => set('manufacturer', e.target.value)}
              >
                <option value="">Select manufacturer</option>
                {MANUFACTURERS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Sel>
            </Field>
            {form.manufacturer === 'Other' && (
              <Field label="Specify">
                <Inp
                  value={form.manufacturer_other}
                  onChange={(e) => set('manufacturer_other', e.target.value)}
                  placeholder="Manufacturer name"
                />
              </Field>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <Field label="Width (mm)">
                <Inp
                  type="number"
                  value={form.damper_size_w}
                  onChange={(e) => set('damper_size_w', e.target.value)}
                  placeholder="400"
                />
              </Field>
              <Field label="Height (mm)" hint="Use diameter if circular">
                <Inp
                  type="number"
                  value={form.damper_size_h}
                  onChange={(e) => set('damper_size_h', e.target.value)}
                  placeholder="200"
                />
              </Field>
            </div>
            <Field label="Damper type" required>
              <Sel
                value={form.damper_type}
                onChange={(e) => set('damper_type', e.target.value)}
              >
                <option value="">Select type</option>
                {DAMPER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Plate type">
              <Sel
                value={form.plate_type}
                onChange={(e) => set('plate_type', e.target.value)}
              >
                <option value="">Select plate type</option>
                {PLATE_TYPES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Sel>
            </Field>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background:
                photoCount === 6
                  ? '#EAF3DE'
                  : 'var(--color-background-secondary)',
              borderRadius: 'var(--border-radius-md)',
              marginBottom: 12,
              border: `0.5px solid ${
                photoCount === 6 ? '#639922' : 'var(--color-border-tertiary)'
              }`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color:
                  photoCount === 6 ? '#3B6D11' : 'var(--color-text-secondary)',
                fontWeight: photoCount === 6 ? 500 : 400,
              }}
            >
              {photoCount === 6
                ? '✓ All 6 photos captured'
                : `${photoCount} of 6 photos captured`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              All recommended
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 10,
            }}
          >
            {PHOTO_STAGES.map((s) => (
              <PhotoUpload
                key={s.id}
                stage={s}
                photo={form.photos[s.id]}
                onChange={setPhoto}
              />
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <Card style={{ marginBottom: 10 }}>
            <SecHead icon="ti-user-check" title="Installation sign-off" />
            <Field label="Installed by" required>
              <Inp
                value={form.fitter_name}
                onChange={(e) => set('fitter_name', e.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Date completed" required>
              <Inp
                type="date"
                value={form.date_completed}
                onChange={(e) => set('date_completed', e.target.value)}
              />
            </Field>
            <Field label="Supervisor / witness">
              <Inp
                value={form.supervisor_name}
                onChange={(e) => set('supervisor_name', e.target.value)}
                placeholder="Supervisor name"
              />
            </Field>
            <Field label="Notes / deviations">
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Deviations from drawing, snagging, access restrictions…"
                style={{ ...iStyle, minHeight: 80, resize: 'vertical' }}
              />
            </Field>
          </Card>
          <Card style={{ marginBottom: 10 }}>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Pre-submit summary
            </p>
            {[
              ['Site', form.site_name || '—'],
              ['Asset no.', form.asset_number || '—'],
              [
                'Drawing',
                form.drawing_number
                  ? `${form.drawing_number} Rev ${form.drawing_revision}`
                  : '—',
              ],
              [
                'Damper',
                form.damper_type
                  ? `${form.damper_type} ${form.damper_size_w}×${form.damper_size_h}mm`
                  : '—',
              ],
              ['Photos', `${photoCount}/6`],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '5px 0',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {k}
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    color:
                      k === 'Photos' && photoCount < 6
                        ? '#854F0B'
                        : 'var(--color-text-primary)',
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </Card>
          {!canSubmit && (
            <p
              style={{
                fontSize: 12,
                color: '#E24B4A',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              <i
                className="ti ti-alert-circle"
                style={{ fontSize: 14, verticalAlign: -2 }}
                aria-hidden="true"
              />{' '}
              Complete required fields to submit
            </p>
          )}
        </div>
      )}

      {step === 5 && (
        <div style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#EAF3DE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <i
              className="ti ti-circle-check"
              style={{ fontSize: 30, color: GREEN }}
              aria-hidden="true"
            />
          </div>
          <p style={{ margin: '0 0 6px', fontWeight: 500, fontSize: 16 }}>
            Record saved
          </p>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            Asset: <strong>{form.asset_number}</strong>
          </p>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: 13,
              color: photoCount < 6 ? '#854F0B' : 'var(--color-text-secondary)',
            }}
          >
            {photoCount === 6
              ? 'All 6 photos — complete record.'
              : `${photoCount}/6 photos — flagged incomplete.`}
          </p>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.6,
            }}
          >
            Saved locally and syncing to the cloud dashboard now.
          </p>
          <button
            onClick={() => {
              setForm(blankForm());
              setStep(0);
              setSearch('');
            }}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--border-radius-md)',
              border: 'none',
              background: AMBER,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i
              className="ti ti-plus"
              style={{ fontSize: 14 }}
              aria-hidden="true"
            />{' '}
            Log another damper
          </button>
        </div>
      )}

      {step < 5 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {step > 0 && (
            <NavBtn
              onClick={() => setStep((s) => s - 1)}
              label="Back"
              icon="ti-arrow-left"
            />
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 'var(--border-radius-md)',
                border: 'none',
                background: AMBER,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              Next{' '}
              <i
                className="ti ti-arrow-right"
                style={{ fontSize: 15 }}
                aria-hidden="true"
              />
            </button>
          ) : (
            <button
              onClick={() =>
                canSubmit && (onSubmit({ ...form, photoCount }), setStep(5))
              }
              disabled={!canSubmit}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 'var(--border-radius-md)',
                border: 'none',
                background: canSubmit ? GREEN : 'var(--color-border-tertiary)',
                color: canSubmit ? '#fff' : 'var(--color-text-tertiary)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <i
                className="ti ti-circle-check"
                style={{ fontSize: 15 }}
                aria-hidden="true"
              />{' '}
              Submit & sync to dashboard
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule View ─────────────────────────────────────────────────────────
function ScheduleView({ schedules, onSave }) {
  const [mode, setMode] = useState('list');
  const [viewSched, setViewSched] = useState(null);
  const [showQR, setShowQR] = useState(null);
  const [site, setSite] = useState({
    site_name: '',
    site_address: '',
    site_postcode: '',
    client_name: '',
    drawing_number: '',
    drawing_revision: '',
  });
  const [dampers, setDampers] = useState([]);
  const [nd, setNd] = useState({
    asset_number: '',
    location: '',
    damper_type: '',
    damper_size_w: '',
    damper_size_h: '',
    manufacturer: '',
    plate_type: '',
  });
  const ss = (k, v) => setSite((s) => ({ ...s, [k]: v }));
  const nd_ = (k, v) => setNd((d) => ({ ...d, [k]: v }));

  const addDamper = () => {
    if (!nd.asset_number) return;
    setDampers((prev) => [
      ...prev,
      { ...nd, id: Date.now().toString(), log_id: null },
    ]);
    setNd({
      asset_number: '',
      location: '',
      damper_type: '',
      damper_size_w: '',
      damper_size_h: '',
      manufacturer: '',
      plate_type: '',
    });
  };

  const save = () => {
    const sched = {
      id: Date.now().toString(),
      ...site,
      dampers,
      created_at: new Date().toISOString(),
    };
    onSave([...schedules, sched]);
    setMode('list');
    setSite({
      site_name: '',
      site_address: '',
      site_postcode: '',
      client_name: '',
      drawing_number: '',
      drawing_revision: '',
    });
    setDampers([]);
  };

  if (mode === 'view' && viewSched)
    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <NavBtn
            onClick={() => setMode('list')}
            label="Back"
            icon="ti-arrow-left"
          />
          <Badge
            color={
              viewSched.dampers.filter((d) => d.log_id).length ===
              viewSched.dampers.length
                ? 'green'
                : 'amber'
            }
          >
            {viewSched.dampers.filter((d) => d.log_id).length}/
            {viewSched.dampers.length} logged
          </Badge>
        </div>
        <Card style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 3px', fontWeight: 500, fontSize: 15 }}>
            {viewSched.site_name}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            {viewSched.drawing_number} Rev {viewSched.drawing_revision} ·{' '}
            {viewSched.client_name}
          </p>
        </Card>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 10,
          }}
        >
          Tap a damper to show its QR code for printing onto the drawing pack.
        </p>
        {viewSched.dampers.map((d) => (
          <div key={d.id}>
            <div
              onClick={() => setShowQR(showQR === d.id ? null : d.id)}
              style={{
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--border-radius-md)',
                padding: '10px 12px',
                marginBottom: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--color-background-primary)',
              }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>
                  {d.asset_number}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {d.location} · {d.damper_type}
                  {d.damper_size_w
                    ? ` · ${d.damper_size_w}×${d.damper_size_h}mm`
                    : ''}
                </p>
              </div>
              <Badge color={d.log_id ? 'green' : 'blue'}>
                {d.log_id ? 'Logged' : 'Scheduled'}
              </Badge>
              <i
                className={`ti ti-chevron-${showQR === d.id ? 'up' : 'down'}`}
                style={{ fontSize: 16, color: 'var(--color-text-tertiary)' }}
                aria-hidden="true"
              />
            </div>
            {showQR === d.id && (
              <div
                style={{
                  padding: '14px 16px',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--border-radius-md)',
                  marginBottom: 8,
                  background: 'var(--color-background-secondary)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <QRDisplay
                  value={`FIREDAMPER:${d.asset_number}:${viewSched.site_name}`}
                  size={110}
                />
                <div style={{ flex: 1 }}>
                  <p
                    style={{ margin: '0 0 2px', fontWeight: 500, fontSize: 14 }}
                  >
                    {d.asset_number}
                  </p>
                  <p
                    style={{
                      margin: '0 0 8px',
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {viewSched.site_name}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      lineHeight: 1.5,
                    }}
                  >
                    Print and attach to drawing. Fitter scans to open pre-filled
                    log form.
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );

  if (mode === 'create')
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <NavBtn onClick={() => setMode('list')} label="Cancel" icon="ti-x" />
          <span style={{ fontWeight: 500, fontSize: 15 }}>New schedule</span>
        </div>
        <Card style={{ marginBottom: 10 }}>
          <SecHead icon="ti-building" title="Site & drawing" />
          <div
            style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}
          >
            <Field label="Site name" required>
              <Inp
                value={site.site_name}
                onChange={(e) => ss('site_name', e.target.value)}
                placeholder="e.g. Birmingham City Hospital"
              />
            </Field>
            <Field label="Postcode">
              <Inp
                value={site.site_postcode}
                onChange={(e) => ss('site_postcode', e.target.value)}
                placeholder="B1 1AA"
              />
            </Field>
          </div>
          <Field label="Site address">
            <Inp
              value={site.site_address}
              onChange={(e) => ss('site_address', e.target.value)}
              placeholder="Street address"
            />
          </Field>
          <Field label="Client">
            <Inp
              value={site.client_name}
              onChange={(e) => ss('client_name', e.target.value)}
              placeholder="Company name"
            />
          </Field>
          <div
            style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}
          >
            <Field label="Drawing number" required>
              <Inp
                value={site.drawing_number}
                onChange={(e) => ss('drawing_number', e.target.value)}
                placeholder="M-01-L02-VEN-001"
              />
            </Field>
            <Field label="Revision">
              <Inp
                value={site.drawing_revision}
                onChange={(e) => ss('drawing_revision', e.target.value)}
                placeholder="P3"
              />
            </Field>
          </div>
        </Card>
        <Card style={{ marginBottom: 10 }}>
          <SecHead
            icon="ti-list-details"
            title={`Add dampers — ${dampers.length} added`}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Field label="Asset / tag number" required>
              <Inp
                value={nd.asset_number}
                onChange={(e) => nd_('asset_number', e.target.value)}
                placeholder="FD-L02-047"
              />
            </Field>
            <Field label="Location">
              <Inp
                value={nd.location}
                onChange={(e) => nd_('location', e.target.value)}
                placeholder="Level 02, Plant Room"
              />
            </Field>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Field label="Type">
              <Sel
                value={nd.damper_type}
                onChange={(e) => nd_('damper_type', e.target.value)}
              >
                <option value="">Type</option>
                {DAMPER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Width mm">
              <Inp
                type="number"
                value={nd.damper_size_w}
                onChange={(e) => nd_('damper_size_w', e.target.value)}
                placeholder="400"
              />
            </Field>
            <Field label="Height mm">
              <Inp
                type="number"
                value={nd.damper_size_h}
                onChange={(e) => nd_('damper_size_h', e.target.value)}
                placeholder="200"
              />
            </Field>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Field label="Manufacturer">
              <Sel
                value={nd.manufacturer}
                onChange={(e) => nd_('manufacturer', e.target.value)}
              >
                <option value="">Manufacturer</option>
                {MANUFACTURERS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Plate type">
              <Sel
                value={nd.plate_type}
                onChange={(e) => nd_('plate_type', e.target.value)}
              >
                <option value="">Plate type</option>
                {PLATE_TYPES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Sel>
            </Field>
          </div>
          <button
            onClick={addDamper}
            disabled={!nd.asset_number}
            style={{
              width: '100%',
              padding: '9px',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px dashed var(--color-border-secondary)',
              background: nd.asset_number
                ? 'var(--color-background-secondary)'
                : 'transparent',
              cursor: nd.asset_number ? 'pointer' : 'not-allowed',
              fontSize: 13,
              color: nd.asset_number ? AMBER : 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <i
              className="ti ti-plus"
              style={{ fontSize: 14 }}
              aria-hidden="true"
            />{' '}
            Add damper
          </button>
          {dampers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {dampers.map((d, i) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 'var(--border-radius-md)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    marginBottom: 4,
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 80 }}>
                    {d.asset_number}
                  </span>
                  <span
                    style={{
                      color: 'var(--color-text-secondary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.location}
                    {d.damper_size_w
                      ? ` · ${d.damper_size_w}×${d.damper_size_h}mm`
                      : ''}
                  </span>
                  <button
                    onClick={() =>
                      setDampers((prev) => prev.filter((_, j) => j !== i))
                    }
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#E24B4A',
                      padding: 4,
                      display: 'flex',
                    }}
                  >
                    <i
                      className="ti ti-x"
                      style={{ fontSize: 14 }}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
        <button
          onClick={save}
          disabled={!site.site_name || dampers.length === 0}
          style={{
            width: '100%',
            padding: '11px',
            borderRadius: 'var(--border-radius-md)',
            border: 'none',
            background:
              site.site_name && dampers.length > 0
                ? GREEN
                : 'var(--color-border-tertiary)',
            color:
              site.site_name && dampers.length > 0
                ? '#fff'
                : 'var(--color-text-tertiary)',
            cursor:
              site.site_name && dampers.length > 0 ? 'pointer' : 'not-allowed',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <i
            className="ti ti-circle-check"
            style={{ fontSize: 16 }}
            aria-hidden="true"
          />{' '}
          Save schedule ({dampers.length} damper
          {dampers.length !== 1 ? 's' : ''})
        </button>
      </div>
    );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 14,
        }}
      >
        <NavBtn
          onClick={() => setMode('create')}
          label="Create schedule"
          icon="ti-plus"
          color={AMBER}
        />
      </div>
      {schedules.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <i
            className="ti ti-clipboard-list"
            style={{ fontSize: 40, display: 'block', marginBottom: 10 }}
            aria-hidden="true"
          />
          <p
            style={{
              fontSize: 14,
              margin: '0 0 4px',
              color: 'var(--color-text-secondary)',
              fontWeight: 500,
            }}
          >
            No schedules yet
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Create a schedule from the Construction Issue Drawing before fitters
            go to site.
          </p>
        </div>
      ) : (
        schedules.map((s) => (
          <div
            key={s.id}
            style={{
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '14px 16px',
              marginBottom: 10,
              background: 'var(--color-background-primary)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8,
              }}
            >
              <div>
                <p style={{ margin: '0 0 2px', fontWeight: 500, fontSize: 14 }}>
                  {s.site_name}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {s.drawing_number} Rev {s.drawing_revision} ·{' '}
                  {s.dampers.length} dampers
                </p>
              </div>
              <button
                onClick={() => {
                  setViewSched(s);
                  setMode('view');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  background: 'var(--color-background-secondary)',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <i
                  className="ti ti-qrcode"
                  style={{ fontSize: 13 }}
                  aria-hidden="true"
                />{' '}
                View / QR
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Badge
                color={
                  s.dampers.filter((d) => d.log_id).length === s.dampers.length
                    ? 'green'
                    : 'amber'
                }
              >
                {s.dampers.filter((d) => d.log_id).length}/{s.dampers.length}{' '}
                logged
              </Badge>
              <Badge color="gray">
                {new Date(s.created_at).toLocaleDateString('en-GB')}
              </Badge>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Central Dashboard ─────────────────────────────────────────────────────
function Dashboard({
  logs,
  schedules,
  syncStatus,
  online,
  liveUpdate,
  onViewLog,
}) {
  const [filter, setFilter] = useState({
    site: 'all',
    fitter: 'all',
    status: 'all',
    search: '',
  });

  const sites = [
    ...new Set(logs.map((l) => l.site_name).filter(Boolean)),
  ].sort();
  const fitters = [
    ...new Set(logs.map((l) => l.fitter_name).filter(Boolean)),
  ].sort();

  const filtered = logs.filter((l) => {
    const pc = l.photo_count ?? l.photoCount ?? 0;
    if (filter.site !== 'all' && l.site_name !== filter.site) return false;
    if (filter.fitter !== 'all' && l.fitter_name !== filter.fitter)
      return false;
    if (filter.status === 'complete' && pc < 6) return false;
    if (filter.status === 'incomplete' && pc >= 6) return false;
    if (filter.status === 'pending' && l.synced !== false) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      if (
        !(l.asset_number || '').toLowerCase().includes(s) &&
        !(l.site_name || '').toLowerCase().includes(s) &&
        !(l.fitter_name || '').toLowerCase().includes(s) &&
        !(l.report_number || '').toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  const complete = logs.filter(
    (l) => (l.photo_count ?? l.photoCount ?? 0) === 6
  ).length;
  const incomplete = logs.filter((l) => {
    const pc = l.photo_count ?? l.photoCount ?? 0;
    return pc > 0 && pc < 6;
  }).length;
  const pending = logs.filter((l) => l.synced === false).length;
  
  const notLogged = schedules.flatMap((s) =>
    s.dampers.filter((d) => !d.log_id)
  ).length;

  return (
    <div>
      {/* Connection + live update bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: online ? '#3B6D11' : 'var(--color-text-tertiary)',
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: online ? '#639922' : 'var(--color-border-secondary)',
            }}
          />
          {online
            ? db
              ? 'Connected to cloud'
              : 'Local only — Supabase not configured'
            : 'Offline — records saved locally'}
        </div>
        {liveUpdate && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              color: '#185FA5',
              padding: '3px 8px',
              background: '#E6F1FB',
              borderRadius: 'var(--border-radius-md)',
            }}
          >
            <i
              className="ti ti-bell-ringing"
              style={{ fontSize: 13 }}
              aria-hidden="true"
            />{' '}
            New record received
          </div>
        )}
        {pending > 0 && (
          <div
            style={{
              fontSize: 12,
              color: '#854F0B',
              padding: '3px 8px',
              background: '#FAEEDA',
              borderRadius: 'var(--border-radius-md)',
            }}
          >
            {pending} record{pending > 1 ? 's' : ''} pending sync
          </div>
        )}
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: 'Total logged',
            value: logs.length,
            color: 'var(--color-text-primary)',
          },
          { label: 'Complete', value: complete, color: GREEN },
          { label: 'Incomplete', value: incomplete, color: '#854F0B' },
          { label: 'Not logged', value: notLogged, color: '#185FA5' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--color-background-secondary)',
              borderRadius: 'var(--border-radius-md)',
              padding: '10px 8px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 500,
                color: s.color,
              }}
            >
              {s.value}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 10,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.3,
              }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      {logs.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 2fr',
              gap: 8,
            }}
          >
            <Field label="Site">
              <Sel
                value={filter.site}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, site: e.target.value }))
                }
              >
                <option value="all">All sites</option>
                {sites.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Fitter">
              <Sel
                value={filter.fitter}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, fitter: e.target.value }))
                }
              >
                <option value="all">All fitters</option>
                {fitters.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Status">
              <Sel
                value={filter.status}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="all">All</option>
                <option value="complete">Complete</option>
                <option value="incomplete">Incomplete</option>
                <option value="pending">Pending sync</option>
              </Sel>
            </Field>
            <Field label="Search">
              <div style={{ position: 'relative' }}>
                <Inp
                  value={filter.search}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, search: e.target.value }))
                  }
                  placeholder="Asset no., site, fitter, report…"
                />
                {filter.search && (
                  <button
                    onClick={() => setFilter((f) => ({ ...f, search: '' }))}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-tertiary)',
                      padding: 0,
                    }}
                  >
                    <i
                      className="ti ti-x"
                      style={{ fontSize: 14 }}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
            </Field>
          </div>
          {(filter.site !== 'all' ||
            filter.fitter !== 'all' ||
            filter.status !== 'all' ||
            filter.search) && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              Showing {filtered.length} of {logs.length} records
              <button
                onClick={() =>
                  setFilter({
                    site: 'all',
                    fitter: 'all',
                    status: 'all',
                    search: '',
                  })
                }
                style={{
                  marginLeft: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: AMBER,
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Clear filters
              </button>
            </p>
          )}
        </Card>
      )}

      {/* Log list */}
      {filtered.length > 0 ? (
        <Card>
          <p style={{ margin: '0 0 12px', fontWeight: 500, fontSize: 14 }}>
            <i
              className="ti ti-history"
              style={{
                fontSize: 16,
                verticalAlign: -2,
                marginRight: 6,
                color: AMBER,
              }}
              aria-hidden="true"
            />
            Installation logs — {filtered.length}
          </p>
          {filtered.map((log) => {
            const pc = log.photo_count ?? log.photoCount ?? 0;
            const ss =
              syncStatus[log.id] ||
              (log.synced === false ? 'pending' : 'synced');
            return (
              <div
                key={log.id}
                onClick={() => onViewLog(log)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  marginBottom: 4,
                  border: '0.5px solid var(--color-border-tertiary)',
                  background: 'var(--color-background-primary)',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {log.asset_number || 'No asset'} —{' '}
                    {log.site_name || 'No site'}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {log.fitter_name || '—'} · {log.date_completed} ·{' '}
                    {log.report_number || 'No report no.'}
                  </p>
                </div>
                <SyncIcon status={ss} />
                <Badge color={pc === 6 ? 'green' : pc > 0 ? 'amber' : 'red'}>
                  {pc}/6
                </Badge>
                <i
                  className="ti ti-chevron-right"
                  style={{
                    fontSize: 15,
                    color: 'var(--color-text-tertiary)',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </Card>
      ) : logs.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <i
            className="ti ti-flame"
            style={{
              fontSize: 44,
              color: AMBER,
              display: 'block',
              marginBottom: 12,
            }}
            aria-hidden="true"
          />
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
            }}
          >
            No installation logs yet
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Supervisors: create a schedule.
            <br />
            Fitters: tap Log Damper to start a record.
          </p>
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '30px 20px',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          <i
            className="ti ti-filter-off"
            style={{ fontSize: 28, display: 'block', marginBottom: 8 }}
            aria-hidden="true"
          />
          No records match the current filters.
        </div>
      )}

      {/* Unlogged scheduled dampers */}
      {sites.length > 0 && (
  <Card style={{ marginBottom: 12 }}>
    <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 14 }}>
      <i className="ti ti-file-export" style={{ fontSize: 16, verticalAlign: -2, marginRight: 6, color: AMBER }} />
      Export project to PDF
    </p>
    {sites.map(site => (
      <div key={site} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", marginBottom: 6, background: "var(--color-background-primary)" }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{site}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>
            {logs.filter(l => l.site_name === site).length} dampers · {logs.filter(l => l.site_name === site && (l.photo_count ?? l.photoCount ?? 0) === 6).length} complete
          </p>
        </div>
        <button
          onClick={() => handleExport(site)}
          disabled={exporting === site}
          style={{ padding: "7px 14px", borderRadius: "var(--border-radius-md)", border: "none", background: exporting === site ? "var(--color-border-tertiary)" : AMBER, color: "#fff", cursor: exporting === site ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
          {exporting === site
            ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} /> Generating…</>
            : <><i className="ti ti-download" style={{ fontSize: 13 }} /> Export PDF</>}
        </button>
      </div>
    ))}
  </Card>
)}
      {sites.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', fontWeight: 500, fontSize: 14 }}>
            <i className="ti ti-file-export" style={{ fontSize: 16, verticalAlign: -2, marginRight: 6, color: AMBER }} aria-hidden="true" />
            Export project to PDF
          </p>
          {sites.map((site) => (
            <div key={site} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', marginBottom: 6, background: 'var(--color-background-primary)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{site}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {logs.filter((l) => l.site_name === site).length} dampers &middot;{' '}
                  {logs.filter((l) => l.site_name === site && (l.photo_count ?? l.photoCount ?? 0) === 6).length} complete
                </p>
              </div>
              <button
                onClick={() => handleExport(site)}
                disabled={exporting === site}
                style={{ padding: '7px 14px', borderRadius: 'var(--border-radius-md)', border: 'none', background: exporting === site ? 'var(--color-border-tertiary)' : AMBER, color: '#fff', cursor: exporting === site ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {exporting === site ? (
                  <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: 'spin 1s linear infinite' }} aria-hidden="true" /> Generating…</>
                ) : (
                  <><i className="ti ti-download" style={{ fontSize: 13 }} aria-hidden="true" /> Export PDF</>
                )}
              </button>
            </div>
          ))}
        </Card>
      )}
      {notLogged > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: '9px 12px',
            background: '#E6F1FB',
            borderRadius: 'var(--border-radius-md)',
            border: '0.5px solid #B5D4F4',
            display: 'flex',
            gap: 8,
          }}
        >
          <i
            className="ti ti-clock"
            style={{
              fontSize: 16,
              color: '#185FA5',
              flexShrink: 0,
              marginTop: 1,
            }}
            aria-hidden="true"
          />
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#185FA5',
              lineHeight: 1.5,
            }}
          >
            <strong>
              {notLogged} scheduled damper{notLogged > 1 ? 's' : ''}
            </strong>{' '}
            not yet logged. Check the Schedule tab or follow up with fitters on
            site.
          </p>
        </div>
      )}
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [viewingLog, setViewingLog] = useState(null);
  const [syncStatus, setSyncStatus] = useState({});
  const [online, setOnline] = useState(navigator.onLine);
  const [liveUpdate, setLiveUpdate] = useState(false);

  // Online / offline detection
  useEffect(() => {
    const goOn = () => {
      setOnline(true);
      processSyncQueue();
    };
    const goOff = () => setOnline(false);
    window.addEventListener('online', goOn);
    window.addEventListener('offline', goOff);
    return () => {
      window.removeEventListener('online', goOn);
      window.removeEventListener('offline', goOff);
    };
  }, []);

  // Initial data load
  useEffect(() => {
    (async () => {
      const localLogs = local.get('fd_logs_meta') || [];
      const localScheds = local.get('fd_schedules') || [];
      setLogs(localLogs);
      setSchedules(localScheds);

      if (db) {
        try {
          const [{ data: remoteLogs }, { data: remoteScheds }] =
            await Promise.all([
              db
                .from('fire_damper_logs')
                .select('*')
                .order('submitted_at', { ascending: false }),
              db
                .from('fire_damper_schedules')
                .select('*')
                .order('created_at', { ascending: false }),
            ]);

          if (remoteLogs) {
            const localPending = localLogs.filter((l) => l.synced === false);
            const merged = [
              ...localPending,
              ...remoteLogs.filter(
                (r) => !localPending.find((l) => l.id === r.id)
              ),
            ];
            setLogs(merged);
            local.set('fd_logs_meta', merged);
          }
          if (remoteScheds) {
            const merged = [
              ...localScheds.filter(
                (s) => !remoteScheds.find((r) => r.id === s.id)
              ),
              ...remoteScheds,
            ];
            setSchedules(merged);
            local.set('fd_schedules', merged);
          }
        } catch {}

        // Real-time: new logs from other fitters appear on dashboard instantly
        const channel = db
          .channel('fd-realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'fire_damper_logs' },
            (payload) => {
              setLogs((prev) => {
                if (prev.find((l) => l.id === payload.new.id)) return prev;
                setLiveUpdate(true);
                setTimeout(() => setLiveUpdate(false), 4000);
                const updated = [payload.new, ...prev];
                local.set('fd_logs_meta', updated);
                return updated;
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'fire_damper_schedules',
            },
            (payload) => {
              setSchedules((prev) => {
                if (prev.find((s) => s.id === payload.new.id)) return prev;
                const updated = [payload.new, ...prev];
                local.set('fd_schedules', updated);
                return updated;
              });
            }
          )
          .subscribe();

        return () => db.removeChannel(channel);
      }
      setLoaded(true);
    })().then(() => setLoaded(true));
  }, []);

  // Process offline sync queue
  const processSyncQueue = useCallback(async () => {
    const queue = local.get('fd_sync_queue') || [];
    if (!queue.length || !db) return;
    const currentLogs = local.get('fd_logs_meta') || [];
    for (const logId of queue) {
      const log = currentLogs.find((l) => l.id === logId);
      if (!log) continue;
      const photos = local.get(`fd_photos_${logId}`) || {};
      setSyncStatus((s) => ({ ...s, [logId]: 'syncing' }));
      const ok = await pushLog(log, photos);
      if (ok) {
        local.set(
          'fd_sync_queue',
          (local.get('fd_sync_queue') || []).filter((id) => id !== logId)
        );
        setSyncStatus((s) => ({ ...s, [logId]: 'synced' }));
        setLogs((prev) =>
          prev.map((l) => (l.id === logId ? { ...l, synced: true } : l))
        );
      } else {
        setSyncStatus((s) => ({ ...s, [logId]: 'failed' }));
      }
    }
  }, []);

  const handleLogSubmit = async (logData) => {
    const { photos, ...meta } = logData;
    const log = {
      ...meta,
      id: Date.now().toString(),
      submitted_at: new Date().toISOString(),
      synced: false,
    };
    local.set(`fd_photos_${log.id}`, photos || {});
    const updated = [log, ...logs];
    setLogs(updated);
    local.set('fd_logs_meta', updated);

    if (db && online) {
      setSyncStatus((s) => ({ ...s, [log.id]: 'syncing' }));
      const ok = await pushLog(log, photos || {});
      if (ok) {
        setSyncStatus((s) => ({ ...s, [log.id]: 'synced' }));
        setLogs((prev) =>
          prev.map((l) => (l.id === log.id ? { ...l, synced: true } : l))
        );
      } else {
        setSyncStatus((s) => ({ ...s, [log.id]: 'pending' }));
        local.set('fd_sync_queue', [
          ...(local.get('fd_sync_queue') || []),
          log.id,
        ]);
      }
    } else {
      setSyncStatus((s) => ({ ...s, [log.id]: 'pending' }));
      local.set('fd_sync_queue', [
        ...(local.get('fd_sync_queue') || []),
        log.id,
      ]);
    }
    setShowForm(false);
  };

  const saveSchedules = async (data) => {
    setSchedules(data);
    local.set('fd_schedules', data);
    if (db) {
      const newest = data[data.length - 1];
      if (newest) await pushSchedule(newest);
    }
  };

  const openLog = async (log) => {
    // Use Storage URLs if synced, otherwise fall back to local base64
    let photos =
      log.photo_urls && Object.keys(log.photo_urls).length
        ? log.photo_urls
        : local.get(`fd_photos_${log.id}`) || {};
    setViewingLog({ ...log, photos });
  };

  const TABS = [
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { id: 'schedule', icon: 'ti-clipboard-list', label: 'Schedule' },
    { id: 'help', icon: 'ti-help-circle', label: 'Help' },
  ];

  // Add CSS for spin animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (!loaded)
    return (
      <div
        style={{
          fontFamily: 'var(--font-sans, system-ui)',
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--color-text-tertiary, #888)',
        }}
      >
        <i
          className="ti ti-loader-2"
          style={{
            fontSize: 28,
            display: 'block',
            marginBottom: 10,
            animation: 'spin 1s linear infinite',
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 13 }}>Loading records…</span>
      </div>
    );

  const content = () => {
    if (viewingLog)
      return (
        <ReportView
          log={viewingLog}
          syncStatus={
            syncStatus[viewingLog.id] ||
            (viewingLog.synced === false ? 'pending' : 'synced')
          }
          onBack={() => setViewingLog(null)}
        />
      );
    if (showForm)
      return (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i
                className="ti ti-flame"
                style={{ fontSize: 18, color: AMBER }}
                aria-hidden="true"
              />
              <span style={{ fontWeight: 500, fontSize: 16 }}>
                Log fire damper installation
              </span>
            </div>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 'var(--border-radius-md)',
                cursor: 'pointer',
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <i
                className="ti ti-x"
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />{' '}
              Cancel
            </button>
          </div>
          <FitterForm schedules={schedules} onSubmit={handleLogSubmit} />
        </div>
      );
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i
              className="ti ti-flame"
              style={{ fontSize: 20, color: AMBER }}
              aria-hidden="true"
            />
            <span style={{ fontWeight: 500, fontSize: 17 }}>
              Fire Damper Log
            </span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--border-radius-md)',
              border: 'none',
              background: AMBER,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i
              className="ti ti-plus"
              style={{ fontSize: 14 }}
              aria-hidden="true"
            />{' '}
            Log damper
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            marginBottom: 18,
            borderBottom: '0.5px solid var(--color-border-tertiary)',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: `2px solid ${
                  tab === t.id ? AMBER : 'transparent'
                }`,
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: tab === t.id ? AMBER : 'var(--color-text-secondary)',
                fontWeight: tab === t.id ? 500 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'color 0.15s',
              }}
            >
              <i
                className={`ti ${t.icon}`}
                style={{ fontSize: 15 }}
                aria-hidden="true"
              />
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'dashboard' && (
          <Dashboard
            logs={logs}
            schedules={schedules}
            syncStatus={syncStatus}
            online={online}
            liveUpdate={liveUpdate}
            onViewLog={openLog}
          />
        )}
        {tab === 'schedule' && (
          <ScheduleView schedules={schedules} onSave={saveSchedules} />
        )}
        {tab === 'help' && <HelpSection />}
      </div>
    );
  };

  return (
    <div
      style={{
        fontFamily: 'var(--font-sans, system-ui)',
        maxWidth: 640,
        margin: '0 auto',
        padding: '1rem 0',
      }}
    >
      <h2 className="sr-only">Fire Damper Installation Log</h2>
      {content()}
    </div>
  );
}

// ── Help section (condensed) ──────────────────────────────────────────────
function HelpSection() {
  const [open, setOpen] = useState('sync');
  const tabs = [
    { id: 'sync', label: 'Cloud sync' },
    { id: 'supervisor', label: 'Supervisors' },
    { id: 'fitter', label: 'Fitters' },
    { id: 'offline', label: 'Offline' },
    { id: 'faq', label: 'FAQ' },
  ];
  const Step = ({ n, title, text }) => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#FAEEDA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 500,
          color: AMBER,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div>
        <p style={{ margin: '0 0 3px', fontWeight: 500, fontSize: 14 }}>
          {title}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
  return (
    <div>
      <div
        style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpen(t.id)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-secondary)',
              background:
                open === t.id ? AMBER : 'var(--color-background-secondary)',
              color: open === t.id ? '#fff' : 'var(--color-text-primary)',
              cursor: 'pointer',
              fontWeight: open === t.id ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {open === 'sync' && (
        <Card>
          <SecHead icon="ti-cloud" title="How cloud sync works" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 16,
            }}
          >
            {[
              {
                icon: 'ti-device-mobile',
                title: 'On site (fitter)',
                text: 'Submits a record → saves to phone instantly. Photos upload to cloud in the background.',
              },
              {
                icon: 'ti-building-skyscraper',
                title: 'In the office',
                text: "Dashboard shows every fitter's record in real time. New records appear automatically — no refresh needed.",
              },
              {
                icon: 'ti-wifi-off',
                title: 'No signal on site',
                text: 'Record saves to the phone. When signal returns, it syncs automatically. Look for the amber cloud icon.',
              },
              {
                icon: 'ti-cloud-check',
                title: 'Sync status icons',
                text: 'Green cloud = synced. Amber cloud = waiting for signal. Blue spinner = uploading now.',
              },
            ].map((c) => (
              <div
                key={c.title}
                style={{
                  padding: '12px',
                  background: 'var(--color-background-secondary)',
                  borderRadius: 'var(--border-radius-md)',
                  border: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <i
                    className={`ti ${c.icon}`}
                    style={{ fontSize: 18, color: AMBER }}
                    aria-hidden="true"
                  />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {c.title}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {c.text}
                </p>
              </div>
            ))}
          </div>
          <div
            style={{
              padding: '10px 12px',
              background: '#FAEEDA',
              borderRadius: 'var(--border-radius-md)',
              borderLeft: `2px solid ${AMBER}`,
            }}
          >
            <p
              style={{
                margin: '0 0 3px',
                fontWeight: 500,
                fontSize: 13,
                color: '#854F0B',
              }}
            >
              Office use
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: '#854F0B',
                lineHeight: 1.6,
              }}
            >
              Open the app on any computer or phone in the office. The Dashboard
              tab shows every record from every fitter across all sites. Use the
              filters to search by site, fitter, status, or asset number. Open
              any record to view the full report with photos.
            </p>
          </div>
        </Card>
      )}
      {open === 'supervisor' && (
        <Card>
          <SecHead icon="ti-clipboard-list" title="Supervisor instructions" />
          <Step
            n="1"
            title="Create a schedule before site"
            text="Go to Schedule tab. Enter site and drawing details, add every fire damper from the Construction Issue Drawing. Saves to all devices via the cloud."
          />
          <Step
            n="2"
            title="Print QR codes for the drawing pack"
            text="Each damper gets a QR code. Tap any damper in the schedule to view and print its QR code. Attach to the drawing. Fitters scan it on site to open their pre-filled form."
          />
          <Step
            n="3"
            title="Monitor from the office dashboard"
            text="The Dashboard tab is your live view. Filter by site or fitter. Green = complete with all 6 photos. Amber = incomplete. Blue clock = not yet logged."
          />
          <Step
            n="4"
            title="Export individual records to PDF"
            text="Open any log from the Dashboard, then use your browser's Print function → Save as PDF. One page per damper for the O&M file."
          />
        </Card>
      )}
      {open === 'fitter' && (
        <Card>
          <SecHead icon="ti-helmet" title="Fitter instructions" />
          <Step
            n="1"
            title="Load the app before you go to site"
            text="Open on your phone with a signal. Once loaded, it works fully offline."
          />
          <Step
            n="2"
            title="Tap Log Damper and search for your damper"
            text="Type the asset number. If it's in the schedule, the form pre-fills. Otherwise tap Start manual log."
          />
          <Step
            n="3"
            title="Take 6 photos as you install"
            text="Work through each stage. Green tick = photo saved. The app uses your camera directly."
          />
          <Step
            n="4"
            title="Enter your name and submit"
            text="Date fills in automatically. Tap Submit. Your record saves immediately and syncs to the office dashboard."
          />
          <Step
            n="5"
            title="No signal?"
            text="Submit anyway. The record saves to your phone. A amber cloud icon shows it's waiting to sync. It will sync automatically when you get signal."
          />
        </Card>
      )}
      {open === 'offline' && (
        <Card>
          <SecHead icon="ti-wifi-off" title="Offline use" />
          <div
            style={{
              padding: '10px 12px',
              background: '#EAF3DE',
              borderRadius: 'var(--border-radius-md)',
              marginBottom: 14,
              border: '0.5px solid #639922',
              display: 'flex',
              gap: 8,
            }}
          >
            <i
              className="ti ti-circle-check"
              style={{
                fontSize: 16,
                color: GREEN,
                flexShrink: 0,
                marginTop: 1,
              }}
              aria-hidden="true"
            />
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: '#3B6D11',
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              Yes — once loaded once, the app works with no internet. Records
              save locally and sync when signal returns.
            </p>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px' }}>
            Supervisor pre-site checklist:
          </p>
          {[
            "Open the app on every fitter's phone before travelling to site",
            'Create the damper schedule while connected (it syncs to all devices)',
            'Print QR code sheets before leaving — QR generation needs internet',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
              <i
                className="ti ti-checkbox"
                style={{
                  fontSize: 14,
                  color: AMBER,
                  flexShrink: 0,
                  marginTop: 1,
                }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13 }}>{t}</span>
            </div>
          ))}
          <p style={{ margin: '14px 0 8px', fontSize: 13, fontWeight: 500 }}>
            Add to home screen for best offline experience:
          </p>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            {[
              {
                icon: 'ti-brand-safari',
                title: 'iPhone (Safari)',
                steps: [
                  'Tap the Share button',
                  'Tap Add to Home Screen',
                  'Tap Add',
                ],
              },
              {
                icon: 'ti-brand-chrome',
                title: 'Android (Chrome)',
                steps: [
                  'Tap the three-dot menu',
                  'Tap Add to Home screen',
                  'Tap Add',
                ],
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  padding: '10px',
                  background: 'var(--color-background-secondary)',
                  borderRadius: 'var(--border-radius-md)',
                  border: '0.5px solid var(--color-border-tertiary)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <i
                    className={`ti ${item.icon}`}
                    style={{ fontSize: 16, color: AMBER }}
                    aria-hidden="true"
                  />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {item.title}
                  </span>
                </div>
                {item.steps.map((s, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', gap: 5, marginBottom: 3 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: AMBER,
                        fontWeight: 500,
                        minWidth: 12,
                      }}
                    >
                      {i + 1}.
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      {open === 'faq' && (
        <Card>
          <SecHead icon="ti-help-circle" title="FAQ" />
          {[
            {
              q: 'A fitter submitted with no photos — what happens?',
              a: "The record appears on the dashboard as Incomplete (amber). You can see exactly how many photos are missing. The fitter's name and date are captured. Follow up before they leave site.",
            },
            {
              q: "How do I see just one site's records in the office?",
              a: 'Use the Site filter on the Dashboard. All records for that site appear instantly. You can combine it with the Fitter or Status filter to narrow further.',
            },
            {
              q: 'How do I get records into the O&M manual?',
              a: 'Open any log from the Dashboard → browser Print → Save as PDF. One clean page per damper. For the full project, print each record in turn.',
            },
            {
              q: 'What if two fitters log the same damper?',
              a: 'Both records save separately. The dashboard shows both. The supervisor can see the duplication and mark one as the official record in the Notes field.',
            },
            {
              q: 'What happens if the Supabase free tier runs out?',
              a: "The free tier gives 500MB database and 1GB file storage. At ~2MB per log (photos included), that's 500+ complete damper records. When you need more, Supabase's Pro plan is $25/month.",
            },
            {
              q: 'Can I add login/password access control?',
              a: 'Yes — Supabase has built-in authentication. Ask your developer (or Claude) to add Supabase Auth. Takes about an hour to implement.',
            },
          ].map(({ q, a }, i) => (
            <div
              key={i}
              style={{
                marginBottom: 14,
                paddingBottom: 14,
                borderBottom:
                  i < 5 ? '0.5px solid var(--color-border-tertiary)' : 'none',
              }}
            >
              <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: 13 }}>
                {q}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                {a}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
