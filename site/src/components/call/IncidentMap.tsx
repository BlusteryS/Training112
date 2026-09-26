import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { ModalForm } from '../ModalForm';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './IncidentMap.module.css';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const style: StyleSpecification = {
  version: 8,
  glyphs: '/maps/fonts/{fontstack}/{range}.pbf',
  sources: { moscow: { type: 'vector', url: `pmtiles://${location.origin}/maps/moscow.pmtiles` } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f0f1ed' } },
    { id: 'landcover', type: 'fill', source: 'moscow', 'source-layer': 'landcover',
      paint: { 'fill-color': '#dcebd6' } },
    { id: 'parks', type: 'fill', source: 'moscow', 'source-layer': 'landuse',
      filter: ['in', 'kind', 'park', 'forest', 'wood', 'garden'],
      paint: { 'fill-color': '#d4e9d1' } },
    { id: 'water', type: 'fill', source: 'moscow', 'source-layer': 'water',
      paint: { 'fill-color': '#bddde9' } },
    { id: 'water-lines', type: 'line', source: 'moscow', 'source-layer': 'water',
      paint: { 'line-color': '#bddde9', 'line-width': 2 } },
    { id: 'road-casing', type: 'line', source: 'moscow', 'source-layer': 'roads',
      paint: { 'line-color': '#d6d9d5', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 5] } },
    { id: 'roads', type: 'line', source: 'moscow', 'source-layer': 'roads',
      paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 14, 4] } },
    { id: 'buildings', type: 'fill', source: 'moscow', 'source-layer': 'buildings',
      paint: { 'fill-color': '#dadcd5', 'fill-outline-color': '#c7c9c2' } },
    { id: 'places', type: 'symbol', source: 'moscow', 'source-layer': 'places',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
        'text-size': 13, 'text-max-width': 8 },
      paint: { 'text-color': '#45505a', 'text-halo-color': '#fff', 'text-halo-width': 1 } },
    { id: 'street-names', type: 'symbol', source: 'moscow', 'source-layer': 'roads',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
        'text-size': 12, 'symbol-placement': 'line' },
      paint: { 'text-color': '#59646a', 'text-halo-color': '#fff', 'text-halo-width': 1 } },
    { id: 'house-numbers', type: 'symbol', source: 'moscow', 'source-layer': 'buildings',
      minzoom: 16, layout: { 'text-field': ['get', 'addr_housenumber'],
        'text-font': ['Noto Sans Regular'], 'text-size': 10 },
      paint: { 'text-color': '#647078' } },
  ],
};

export function IncidentMap({ latitude, longitude, onClose, onSelect }: {
  latitude: string;
  longitude: string;
  onClose: () => void;
  onSelect: (latitude: string, longitude: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<[number, number] | null>(() => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    return latitude && longitude && Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
  });

  useEffect(() => {
    if (!container.current) return;
    const initial: [number, number] = point ?? [37.6176, 55.7558];
    const map = new maplibregl.Map({ container: container.current, style,
      center: initial, zoom: point ? 16 : 10, minZoom: 7, maxZoom: 19,
      attributionControl: false });
    map.addControl(new maplibregl.AttributionControl({ compact: true,
      customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">Protomaps</a>' }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const marker = new maplibregl.Marker({ color: '#be3a32' });
    if (point) marker.setLngLat(point).addTo(map);
    map.on('click', (event) => {
      const position: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      marker.setLngLat(position).addTo(map);
      setPoint(position);
    });
    return () => map.remove();
  }, []);

  return <ModalForm label="Карта происшествия" onClose={onClose}>
    <div className={styles.dialog}>
      <div className={styles.header}>
        <div>Карта происшествия</div>
        <button type="button" onClick={onClose} aria-label="Закрыть карту">×</button>
      </div>
      <div ref={container} className={styles.map} />
      <div className={styles.footer}>
        <span>{point ? `${point[1].toFixed(6)}, ${point[0].toFixed(6)}` : 'Нажмите на карте, чтобы отметить место происшествия'}</span>
        <button type="button" disabled={!point} onClick={() => {
          if (point) onSelect(point[1].toFixed(6), point[0].toFixed(6));
        }}>Указать точку</button>
      </div>
    </div>
  </ModalForm>;
}
