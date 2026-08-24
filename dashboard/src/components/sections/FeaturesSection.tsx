import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useScrollFade } from '../useScrollFade';
import FeatureModal from '../FeatureModal';

const features = [
  { title: 'TTL Expiration', desc: 'Active and Lazy TTL expiration for keys with precise timings.' },
  { title: 'LRU Eviction', desc: 'Strict Max-Keys limit with Least-Recently-Used (LRU) eviction policy.' },
  { title: 'Pub/Sub', desc: 'Native Pub/Sub messaging system (SUBSCRIBE / PUBLISH).' },
  { title: 'Snapshot & AOF', desc: 'RDB-style snapshots and Append-Only File durability with background compaction.' },
  { title: 'CLI Client', desc: 'Interactive REPL client to query and interact with the store.' },
  { title: 'Live Dashboard', desc: 'React web UI powered by WebSocket for live telemetry and monitoring.' }
];

export default function FeaturesSection() {
  const { ref, isVisible } = useScrollFade();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  return (
    <section id="features" style={{ padding: '6rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div 
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <h2 style={{ fontSize: '2.5rem', marginBottom: '3rem', textAlign: 'center', color: 'var(--text-main)' }}>
          Features
        </h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          {features.map((f, i) => (
            <button key={i} style={{
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid var(--border-color)',
              borderRadius: '1rem',
              padding: '1.5rem',
              transition: 'transform 0.2s',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
              display: 'block',
              width: '100%'
            }}
            onClick={() => setSelectedFeature(f.title)}
            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <h3 style={{ color: 'var(--accent)', marginBottom: '0.5rem', fontSize: '1.25rem' }}>{f.title}</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </button>
          ))}
        </div>
      </div>
      
      <AnimatePresence>
        {selectedFeature && (
          <FeatureModal 
            featureId={selectedFeature} 
            onClose={() => setSelectedFeature(null)} 
          />
        )}
      </AnimatePresence>
    </section>
  );
}
