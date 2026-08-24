import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import opentype from 'opentype.js';

interface HandwritingSvgProps {
  text: string;
  onComplete: () => void;
}

export default function HandwritingSvg({ text, onComplete }: HandwritingSvgProps) {
  const [pathData, setPathData] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [viewBox, setViewBox] = useState('0 0 800 200');

  useEffect(() => {
    async function fetchFont() {
      try {
        const response = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/indieflower/IndieFlower-Regular.ttf');
        if (!response.ok) throw new Error('Failed to fetch font');
        const buffer = await response.arrayBuffer();
        const font = opentype.parse(buffer);
        
        const fontSize = 120;
        const x = 50;
        const y = 150;
        const path = font.getPath(text, x, y, fontSize);
        
        const boundingBox = path.getBoundingBox();
        const padding = 20;
        const width = boundingBox.x2 - boundingBox.x1 + padding * 2;
        const height = boundingBox.y2 - boundingBox.y1 + padding * 2;
        const bx = boundingBox.x1 - padding;
        const by = boundingBox.y1 - padding;
        
        setViewBox(`${bx} ${by} ${width} ${height}`);
        setPathData(path.toPathData(2));
      } catch (err) {
        console.error(err);
        setError(true);
      }
    }
    fetchFont();
  }, [text]);

  if (error) {
    return (
      <div 
        style={{ fontSize: '4rem', color: '#38bdf8', fontWeight: 'bold' }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          onAnimationComplete={() => setTimeout(onComplete, 1000)}
        >
          {text}
        </motion.div>
      </div>
    );
  }

  if (!pathData) return null;

  return (
    <svg viewBox={viewBox} style={{ width: '100%', maxWidth: '800px', height: 'auto' }}>
      <motion.path
        d={pathData}
        fill="transparent"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2.5, delay: 0.2, ease: "easeInOut" }}
        onAnimationComplete={() => setTimeout(onComplete, 200)}
        style={{ filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.4))' }}
      />
    </svg>
  );
}
