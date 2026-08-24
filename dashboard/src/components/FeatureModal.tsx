import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface FeatureModalProps {
  featureId: string;
  onClose: () => void;
}

const flashcardsData = {
  'TTL Expiration': [
    { front: 'What is active expiration?', back: 'A background sweeper periodically samples keys and removes expired ones.' },
    { front: 'What is lazy expiration?', back: 'When a key is accessed, the store checks its TTL and deletes it immediately if it has expired.' }
  ],
  'LRU Eviction': [
    { front: 'How is recency tracked?', back: 'An O(1) doubly-linked list moves a key to the head every time it\'s accessed.' },
    { front: 'When does eviction happen?', back: 'When the number of keys exceeds the configured maxKeys limit.' }
  ],
  'Pub/Sub': [
    { front: 'Are messages persisted?', back: 'No, Pub/Sub messages are fire-and-forget and not saved in memory or AOF.' },
    { front: 'How do clients receive messages?', back: 'Through long-lived TCP or WebSocket connections that listen for push events.' }
  ],
  'Snapshot & AOF': [
    { front: 'What is AOF?', back: 'Append-Only File. It logs every write command to disk for durability.' },
    { front: 'What is an AOF rewrite?', back: 'It compacts the log by generating the shortest sequence of commands needed to recreate the current state.' }
  ],
  'CLI Client': [
    { front: 'How does the CLI communicate?', back: 'It opens a raw TCP socket and sends standard RESP-like protocol strings.' },
    { front: 'Does the CLI support history?', back: 'Yes, it functions as a REPL (Read-Eval-Print Loop) for interactive querying.' }
  ],
  'Live Dashboard': [
    { front: 'How is telemetry delivered?', back: 'The server pushes live stats every second over a WebSocket connection.' },
    { front: 'Can the dashboard execute commands?', back: 'Yes, the playground uses a separate WebSocket message type to send live commands.' }
  ]
};

const Flashcard = ({ front, back }: { front: string, back: string }) => {
  const [flipped, setFlipped] = useState(false);
  
  return (
    <div 
      onClick={() => setFlipped(!flipped)}
      style={{
        background: 'rgba(30, 41, 59, 0.9)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        cursor: 'pointer',
        minHeight: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        position: 'relative',
        transition: 'all 0.3s'
      }}
    >
      <div style={{ color: flipped ? 'var(--text-main)' : 'var(--accent)', fontWeight: flipped ? 400 : 600 }}>
        {flipped ? back : front}
      </div>
      <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Click to flip
      </div>
    </div>
  );
};

const DiagramBox = ({ children, style }: any) => (
  <div style={{
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '1rem',
    textAlign: 'center',
    color: 'var(--text-main)',
    ...style
  }}>
    {children}
  </div>
);

const Arrow = () => (
  <div style={{ color: 'var(--accent)', margin: '0 1rem', fontSize: '1.5rem', display: 'flex', alignItems: 'center' }}>&rarr;</div>
);

const DownArrow = () => (
  <div style={{ color: 'var(--accent)', margin: '0.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>&darr;</div>
);

export default function FeatureModal({ featureId, onClose }: FeatureModalProps) {
  useEffect(() => {
    // Prevent background scrolling while modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const renderDiagram = () => {
    switch (featureId) {
      case 'TTL Expiration':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <DiagramBox>Key SET with EX</DiagramBox>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active Sweep</div>
                <DiagramBox>Background Sweeper</DiagramBox>
                <DownArrow />
                <DiagramBox>Finds Expired</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--error)' }}>Deletes Key</DiagramBox>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Lazy Check</div>
                <DiagramBox>Client GETs Key</DiagramBox>
                <DownArrow />
                <DiagramBox>Checks TTL</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--error)' }}>Returns Null & Deletes Key</DiagramBox>
              </div>
            </div>
          </div>
        );
      case 'LRU Eviction':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <DiagramBox>SET New Key</DiagramBox>
            <DownArrow />
            <DiagramBox>Memory at Max Capacity?</DiagramBox>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ color: 'var(--error)', marginBottom: '0.5rem', fontWeight: 600 }}>Yes</div>
                <DiagramBox>evictLRU()</DiagramBox>
                <DownArrow />
                <DiagramBox>Removes Tail (LRU)</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--success)' }}>Insert New Key at Head</DiagramBox>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ color: 'var(--success)', marginBottom: '0.5rem', fontWeight: 600 }}>No</div>
                <DiagramBox style={{ borderColor: 'var(--success)' }}>Insert New Key at Head</DiagramBox>
              </div>
            </div>
          </div>
        );
      case 'Pub/Sub':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <DiagramBox>Publisher</DiagramBox>
              <Arrow />
              <DiagramBox style={{ borderColor: 'var(--accent)' }}>PUBLISH channel msg</DiagramBox>
              <Arrow />
              <DiagramBox>Store Engine</DiagramBox>
            </div>
            <DownArrow />
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <DiagramBox style={{ borderColor: 'var(--success)' }}>msg</DiagramBox>
                <DownArrow />
                <DiagramBox>Subscriber 1</DiagramBox>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <DiagramBox style={{ borderColor: 'var(--success)' }}>msg</DiagramBox>
                <DownArrow />
                <DiagramBox>Subscriber 2</DiagramBox>
              </div>
            </div>
          </div>
        );
      case 'Snapshot & AOF':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <DiagramBox>Write Command</DiagramBox>
            <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <DownArrow />
                <DiagramBox>InMemoryStore</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--accent)' }}>Data in RAM</DiagramBox>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <DownArrow />
                <DiagramBox>AofWriter</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--accent)' }}>Appends to AOF file</DiagramBox>
                <DownArrow />
                <DiagramBox>Periodic Snapshot / Rewrite</DiagramBox>
                <DownArrow />
                <DiagramBox style={{ borderColor: 'var(--success)' }}>Compacts AOF to bare minimum</DiagramBox>
              </div>
            </div>
          </div>
        );
      case 'CLI Client':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <DiagramBox>User Types</DiagramBox>
            <Arrow />
            <DiagramBox>CLI parses</DiagramBox>
            <Arrow />
            <DiagramBox style={{ borderColor: 'var(--accent)' }}>TCP Socket</DiagramBox>
            <Arrow />
            <DiagramBox>Store Engine</DiagramBox>
            <Arrow />
            <DiagramBox style={{ borderColor: 'var(--success)' }}>+OK Reply</DiagramBox>
          </div>
        );
      case 'Live Dashboard':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
            <DiagramBox>StatsServer</DiagramBox>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--accent)' }}>
              <div>1s broadcast</div>
              <Arrow />
            </div>
            <DiagramBox style={{ borderColor: 'var(--accent)' }}>WebSocket</DiagramBox>
            <Arrow />
            <DiagramBox>React App</DiagramBox>
            <Arrow />
            <DiagramBox style={{ borderColor: 'var(--success)' }}>Updates UI</DiagramBox>
          </div>
        );
      default:
        return <div>Diagram not found.</div>;
    }
  };

  const cards = flashcardsData[featureId as keyof typeof flashcardsData] || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          padding: '2.5rem',
          maxWidth: '800px',
          width: '100%',
          position: 'relative',
          zIndex: 101,
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '2rem',
            lineHeight: 1,
            cursor: 'pointer'
          }}
        >
          &times;
        </button>
        
        <h2 style={{ fontSize: '2rem', marginBottom: '2rem', color: 'var(--text-main)', textAlign: 'center' }}>
          {featureId} Flow
        </h2>
        
        <div style={{ marginBottom: '3rem', padding: '2rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '1rem', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
          {renderDiagram()}
        </div>
        
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--text-main)', textAlign: 'center' }}>
          Quick Concepts
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          {cards.map((c, i) => (
            <Flashcard key={i} front={c.front} back={c.back} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
