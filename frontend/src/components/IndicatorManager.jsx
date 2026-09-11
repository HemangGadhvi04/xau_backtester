import { Search, Settings, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const defaultsFor = (schema) => Object.fromEntries(
  Object.entries(schema.inputs || {}).map(([key, value]) => [key, value.default])
);

const IndicatorManager = ({ library, instances, onChange, onClose }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const filtered = useMemo(() => library.filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())
  ), [library, search]);

  const updateSettings = (instanceId, key, value) => onChange(instances.map(instance =>
    instance.instance_id === instanceId
      ? { ...instance, settings: { ...instance.settings, [key]: value } }
      : instance
  ));

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={event => event.stopPropagation()}>
        <div style={styles.header}>
          <strong>Indicators</strong>
          <button style={styles.iconButton} onClick={onClose} aria-label="Close indicator manager"><X size={18} /></button>
        </div>
        <div style={styles.search}><Search size={16} /><input autoFocus placeholder="Search indicators" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div style={styles.body}>
          <div style={styles.library}>
            {filtered.map(schema => (
              <button key={schema.id} style={styles.indicatorRow} onClick={() => onChange([...instances, {
                instance_id: `${schema.id}-${Date.now()}`, indicator_id: schema.id,
                name: schema.name, visible: true, settings: defaultsFor(schema),
              }])}>
                <span><strong>{schema.name}</strong><small>{schema.category}</small></span><span style={{ color: '#ffd700' }}>Add</span>
              </button>
            ))}
          </div>
          <div style={styles.active}>
            <strong>On chart</strong>
            {instances.length === 0 && <p style={{ color: '#787b86' }}>No Python indicators added.</p>}
            {instances.map(instance => {
              const schema = library.find(item => item.id === instance.indicator_id);
              return <div key={instance.instance_id} style={styles.activeCard}>
                <div style={styles.activeHeader}>
                  <label><input type="checkbox" checked={instance.visible} onChange={() => onChange(instances.map(item => item.instance_id === instance.instance_id ? { ...item, visible: !item.visible } : item))} /> {instance.name}</label>
                  <span><button style={styles.iconButton} onClick={() => setEditing(editing === instance.instance_id ? null : instance.instance_id)} aria-label="Indicator settings"><Settings size={15} /></button><button style={styles.iconButton} onClick={() => onChange(instances.filter(item => item.instance_id !== instance.instance_id))} aria-label="Remove indicator"><Trash2 size={15} /></button></span>
                </div>
                {editing === instance.instance_id && schema && <div style={styles.settings}>
                  {Object.entries(schema.inputs || {}).map(([key, input]) => <label key={key}>{input.label || key}
                    {input.type === 'select'
                      ? <select value={instance.settings[key]} onChange={event => updateSettings(instance.instance_id, key, event.target.value)}>{input.options.map(option => <option key={option}>{option}</option>)}</select>
                      : input.type === 'boolean'
                        ? <input type="checkbox" checked={Boolean(instance.settings[key])} onChange={event => updateSettings(instance.instance_id, key, event.target.checked)} />
                        : <input type={input.type === 'color' ? 'color' : 'number'} min={input.min} max={input.max} step={input.step} value={instance.settings[key]} onChange={event => updateSettings(instance.instance_id, key, ['integer', 'decimal'].includes(input.type) ? Number(event.target.value) : event.target.value)} />}
                  </label>)}
                </div>}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.65)', display: 'grid', placeItems: 'center' },
  modal: { width: 'min(820px, 92vw)', height: 'min(620px, 85vh)', background: '#131722', border: '1px solid #2b3139', borderRadius: '10px', color: '#d1d4dc', display: 'flex', flexDirection: 'column', boxShadow: '0 18px 50px rgba(0,0,0,.5)' },
  header: { padding: '14px 16px', borderBottom: '1px solid #2b3139', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  search: { margin: '12px 16px', padding: '9px 12px', background: '#0b0d10', border: '1px solid #2b3139', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center' },
  body: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '0 16px 16px', minHeight: 0, flex: 1 },
  library: { overflowY: 'auto', border: '1px solid #2b3139', borderRadius: '6px' }, active: { overflowY: 'auto', border: '1px solid #2b3139', borderRadius: '6px', padding: '12px' },
  indicatorRow: { width: '100%', padding: '12px', color: '#d1d4dc', background: 'transparent', border: 0, borderBottom: '1px solid #20252f', display: 'flex', justifyContent: 'space-between', textAlign: 'left', cursor: 'pointer' },
  activeCard: { marginTop: '10px', padding: '10px', background: '#0b0d10', borderRadius: '6px' }, activeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  settings: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }, iconButton: { color: '#d1d4dc', background: 'transparent', border: 0, cursor: 'pointer', padding: '4px' },
};

export default IndicatorManager;
