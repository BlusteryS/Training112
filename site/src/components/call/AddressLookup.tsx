import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import styles from './AddressLookup.module.css';

export type FiasAddress = {
  id: string;
  label: string;
  district: string;
  street: string;
  house: string;
};

export function AddressLookup({ value, onChange, onSelect }: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: FiasAddress) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [matches, setMatches] = useState<FiasAddress[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!focused || value.trim().length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<FiasAddress[]>(`training/addresses?q=${encodeURIComponent(value.trim())}`, undefined,
        controller.signal).then((rows) => { setMatches(rows); setError(''); })
        .catch(() => { if (!controller.signal.aborted) setError('Не удалось найти адрес.'); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [focused, value]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setFocused(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  function choose(address: FiasAddress) {
    onSelect(address);
    setFocused(false);
    setMatches([]);
  }

  return <div className={styles.root} ref={root}>
    <input id="card-address" required value={value} onFocus={() => setFocused(true)}
      onChange={(event) => { onChange(event.target.value); setMatches([]); setError(''); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setFocused(false);
        const first = matches[0];
        if (event.key === 'Enter' && focused && first) {
          event.preventDefault();
          choose(first);
        }
      }} placeholder="Адрес с номером дома" autoComplete="off" aria-label="Адрес происшествия" />
    {focused && value.trim().length >= 3 && (matches.length > 0 || error) &&
      <div className={styles.results}>
        {matches.map((address) => <button type="button" key={address.id}
          onClick={() => choose(address)}>{address.label}</button>)}
        {error && <div className={styles.error}>{error}</div>}
      </div>}
  </div>;
}
