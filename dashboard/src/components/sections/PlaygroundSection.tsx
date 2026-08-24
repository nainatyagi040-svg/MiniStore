import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useScrollFade } from '../useScrollFade';

interface HistoryItem {
  id: number;
  command: string;
  reply: string | null;
}

const suggestions = [
  'SET name naina',
  'LPUSH mylist a b c',
  'LRANGE mylist 0 -1',
  'SUBSCRIBE news',
  'HSET user id 1 name mini',
  'KEYS *'
];

export default function PlaygroundSection() {
  const { ref, isVisible } = useScrollFade();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // Connect WebSocket
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    
    const connect = () => {
      const wsUrl = import.meta.env.VITE_WS_URL 
        ? `${import.meta.env.VITE_WS_URL}/playground` 
        : `ws://${window.location.hostname}:8090/playground`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Clear reconnect timeout on success
        clearTimeout(reconnectTimeout);
      };

      ws.onmessage = (event) => {
        const replyText = event.data.toString();
        
        // Find the latest pending command and attach reply
        setHistory(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].reply === null) {
              updated[i] = { ...updated[i], reply: replyText };
              break;
            }
          }
          return updated;
        });
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // Attempt to reconnect
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // Handled by close
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll to bottom of the terminal window
  useEffect(() => {
    if (endRef.current && endRef.current.parentElement) {
      endRef.current.parentElement.scrollTop = endRef.current.parentElement.scrollHeight;
    }
  }, [history]);

  const sendCommand = (cmd: string) => {
    if (!cmd.trim()) return;
    
    const id = nextId.current++;
    setHistory(prev => [...prev, { id, command: cmd, reply: null }]);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd);
    } else {
      setHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1].reply = '-ERR not connected to server\\r\\n';
        return updated;
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = input.trim();
      if (cmd) {
        sendCommand(cmd);
        setInput('');
        setHistoryIndex(-1);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const pastCommands = history.map(h => h.command);
      if (pastCommands.length > 0) {
        const newIndex = historyIndex < pastCommands.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(pastCommands[pastCommands.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const pastCommands = history.map(h => h.command);
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(pastCommands[pastCommands.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  const handleSuggestionClick = (cmd: string) => {
    setInput(cmd);
  };

  // Format the raw wire reply for the terminal display
  const formatReply = (raw: string | null) => {
    if (raw === null) return <span style={{ color: '#94a3b8' }}>...</span>;
    
    // Simple parsing for visual display of raw responses
    const lines = raw.split('\\r\\n');
    return lines.map((line, i) => {
      if (!line) return null;
      let color = '#e2e8f0'; // default text
      
      if (line.startsWith('+')) color = 'var(--success)';
      else if (line.startsWith('-')) color = 'var(--error)';
      else if (line.startsWith(':')) color = 'var(--accent)';
      else if (line.startsWith('$')) color = '#a78bfa'; // bulk string
      else if (line.startsWith('*')) color = '#fcd34d'; // array
      
      return (
        <div key={i} style={{ color, marginLeft: '1rem', fontFamily: 'monospace' }}>
          {line.replace(/\\r/g, '').replace(/\\n/g, '')}
        </div>
      );
    });
  };

  return (
    <section id="playground" style={{ padding: '6rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div 
        ref={ref}
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', textAlign: 'center', color: 'var(--text-main)' }}>
          Live Playground
        </h2>
        
        <p style={{ textAlign: 'center', color: 'var(--accent)', marginBottom: '2rem', fontWeight: 600 }}>
          Try SET/GET here — watch it appear live on the Dashboard!
        </p>

        {/* Suggestions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
          {suggestions.map((cmd, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(cmd)}
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: 'var(--accent)',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'monospace'
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)' }}
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Terminal Window */}
        <div style={{
          background: '#0f172a',
          border: '1px solid var(--border-color)',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '400px'
        }}>
          {/* Terminal Header */}
          <div style={{
            background: '#1e293b',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#eab308' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }}></div>
            
            <div style={{ marginLeft: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              ministore-cli {wsConnected ? <span style={{ color: 'var(--success)' }}>(connected)</span> : <span style={{ color: 'var(--error)' }}>(connecting...)</span>}
            </div>
          </div>

          {/* Terminal Output */}
          <div style={{
            flex: 1,
            padding: '1rem',
            overflowY: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Welcome to the MiniStore live playground. Type commands below.
            </div>

            {history.map(item => (
              <div key={item.id}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--accent)' }}>&gt;</span>
                  <span style={{ color: '#fff' }}>{item.command}</span>
                </div>
                {formatReply(item.reply)}
              </div>
            ))}
            
            {/* Input Line */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--accent)' }}>&gt;</span>
              <input 
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                spellCheck="false"
                autoComplete="off"
                disabled={!wsConnected}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  width: '100%',
                  padding: 0
                }}
                placeholder={wsConnected ? "Type a command..." : "Waiting for connection..."}
              />
            </div>
            
            <div ref={endRef} />
          </div>
        </div>

      </div>
    </section>
  );
}
