import * as THREE from 'three';

export interface GridStyle {
  base: string;
  minor: string;
  major: string;
  divisions: number;
  noise?: number;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Procedural "dev grid" texture — readable scale for blockout maps. */
export function gridTexture(style: GridStyle, size = 256): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  g.fillStyle = style.base;
  g.fillRect(0, 0, size, size);
  const n = style.noise ?? 0.05;
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${n})` : `rgba(0,0,0,${n})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const step = size / style.divisions;
  g.strokeStyle = style.minor;
  g.lineWidth = 2;
  for (let i = 1; i < style.divisions; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, size);
    g.moveTo(0, i * step);
    g.lineTo(size, i * step);
    g.stroke();
  }
  g.strokeStyle = style.major;
  g.lineWidth = 6;
  g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function flashTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.25, 'rgba(255,220,120,0.9)');
  grd.addColorStop(0.6, 'rgba(255,140,40,0.25)');
  grd.addColorStop(1, 'rgba(255,100,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,230,160,0.7)';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i / 6) * Math.PI * 2);
    g.beginPath();
    g.moveTo(0, -5);
    g.lineTo(62, 0);
    g.lineTo(0, 5);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function decalTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(10,10,10,0.95)');
  grd.addColorStop(0.35, 'rgba(20,20,20,0.8)');
  grd.addColorStop(0.7, 'rgba(30,30,30,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function nameTagTexture(name: string, color: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  c.height = 64;
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(name, 128, 32);
  g.fillStyle = color;
  g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
