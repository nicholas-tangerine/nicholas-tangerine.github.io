const canvas = document.querySelector(".flow-canvas");
const ctx = canvas.getContext("2d");

let width = 0;
let height = 0;
let time = 0;
let particles = [];

const config = {
  particleCount: 9000,
  fade: 0.08,
  stepSize: 0.9,
  fieldScale: 0.0045,
  jetStrength: 0.6,
  vortexStrength: 2.2,
  sourceStrength: 0.0,
  vortexCount: 4,
  noiseStrength: 0.7,
  coreRadius: 50,
  coreRepel: 2.5,
  boundaryMargin: 200,
  boundaryStrength: 0.4,
  sourceCount: 80,
  sinkCount: 2,
  sourceRate: 3,
  sinkRadius: 60,
  spawnVelocity: 2.5,
  spawnSpread: 0.8,
};

const storm = {
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
};

const vortices = [];
const sources = [];
const sinks = [];

const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

const smoothNoise = (x, y, t = 0) => {
  const x0 = Math.floor(x + t);
  const y0 = Math.floor(y + t * 0.7);
  const xf = (x + t) - x0;
  const yf = (y + t * 0.7) - y0;
  const n00 = hash(x0, y0);
  const n10 = hash(x0 + 1, y0);
  const n01 = hash(x0, y0 + 1);
  const n11 = hash(x0 + 1, y0 + 1);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return nx0 * (1 - v) + nx1 * v;
};

const multiOctaveNoise = (x, y, t, octaves = 3) => {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i += 1) {
    total += smoothNoise(x * frequency, y * frequency, t * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  
  return total / maxValue;
};

const curlNoise = (x, y, t) => {
  const eps = 0.001;
  const n1 = multiOctaveNoise(x, y + eps, t);
  const n2 = multiOctaveNoise(x, y - eps, t);
  const n3 = multiOctaveNoise(x + eps, y, t);
  const n4 = multiOctaveNoise(x - eps, y, t);
  const dx = (n1 - n2) / (2 * eps);
  const dy = (n3 - n4) / (2 * eps);
  return { vx: dy, vy: -dx };
};

const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;

  vortices.length = 0;
  for (let i = 0; i < config.vortexCount; i += 1) {
    vortices.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 140 + Math.random() * 160,
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 1.2),
      source: Math.random() > 0.5 ? 1 : -1,
      speed: 0.2 + Math.random() * 0.4,
      angle: Math.random() * Math.PI * 2,
    });
  }

  sources.length = 0;
  for (let i = 0; i < config.sourceCount; i += 1) {
    sources.push({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 0.15 + Math.random() * 0.3,
      angle: Math.random() * Math.PI * 2,
    });
  }

  sinks.length = 0;
  for (let i = 0; i < config.sinkCount; i += 1) {
    sinks.push({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 0.2 + Math.random() * 0.35,
      angle: Math.random() * Math.PI * 2,
    });
  }

  particles = Array.from({ length: config.particleCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
  }));
};

const field = (x, y, t) => {
  const nx = x * config.fieldScale;
  const ny = y * config.fieldScale;
  const curl = curlNoise(nx * 3, ny * 3, t * 0.05);

  const jet = Math.sin((y / height) * Math.PI * 6 + t * 0.6);
  const jetFlow = jet * config.jetStrength;
  let vvx = 0;
  let vvy = 0;
  for (const v of vortices) {
    const dx = x - v.x;
    const dy = y - v.y;
    const r2 = dx * dx + dy * dy + 1000;
    const r = Math.sqrt(r2);
    const invR = 1 / r;
    const tx = -dy * invR;
    const ty = dx * invR;
    const strength = (config.vortexStrength * v.spin * 100) / r2;
    
    // Add soft repulsive core to prevent center convergence
    let radialPush = 0;
    if (r < config.coreRadius) {
      radialPush = config.coreRepel * (1 - r / config.coreRadius);
    }
    
    vvx += tx * strength + dx * invR * radialPush;
    vvy += ty * strength + dy * invR * radialPush;
  }

  // Add sink attraction forces
  for (const sink of sinks) {
    const dx = sink.x - x;
    const dy = sink.y - y;
    const r2 = dx * dx + dy * dy + 500;
    const r = Math.sqrt(r2);
    const invR = 1 / r;
    const pull = (80 / r2) * 2.5;
    vvx += dx * invR * pull;
    vvy += dy * invR * pull;
  }

  // Soft boundary forces to keep particles on screen
  let boundaryX = 0;
  let boundaryY = 0;
  const margin = config.boundaryMargin;
  const strength = config.boundaryStrength;
  
  if (x < margin) {
    const t = x / margin;
    boundaryX = (1 - t * t) * strength;
  } else if (x > width - margin) {
    const t = (width - x) / margin;
    boundaryX = -(1 - t * t) * strength;
  }
  
  if (y < margin) {
    const t = y / margin;
    boundaryY = (1 - t * t) * strength;
  } else if (y > height - margin) {
    const t = (height - y) / margin;
    boundaryY = -(1 - t * t) * strength;
  }

  return {
    vx: (curl.vx * config.noiseStrength + jetFlow * 0.15 + vvx + boundaryX) * 60,
    vy: (curl.vy * config.noiseStrength + vvy + boundaryY) * 60,
  };
};

const drawBackground = () => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#2b1a16");
  gradient.addColorStop(0.5, "#3b221b");
  gradient.addColorStop(1, "#24140f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

const drawParticles = () => {
  ctx.fillStyle = `rgba(18, 11, 8, ${config.fade})`;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 210, 180, 0.6)";
  ctx.beginPath();
  for (const p of particles) {
    const { vx, vy } = field(p.x, p.y, time);
    const speed = Math.hypot(vx, vy) || 1;
    const step = config.stepSize * (1 + speed * 0.015);

    const x2 = p.x + (vx / speed) * step;
    const y2 = p.y + (vy / speed) * step;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x2, y2);
    p.x = x2;
    p.y = y2;

    if (p.x < 0) p.x += width;
    if (p.x > width) p.x -= width;
    if (p.y < 0) p.y += height;
    if (p.y > height) p.y -= height;
  }
  ctx.stroke();
};

const draw = () => {
  if (time === 0) drawBackground();
  
  vortices.forEach((v, index) => {
    const drift = 40 + index * 10;
    v.angle += 0.003 * v.speed;
    v.x = width * 0.5 + Math.cos(v.angle + index) * drift * 2;
    v.y = height * 0.5 + Math.sin(v.angle + index * 1.3) * drift;
  });

  sources.forEach((s, index) => {
    const drift = 60 + index * 15;
    s.angle += 0.004 * s.speed;
    s.x = width * 0.3 + Math.cos(s.angle + index * 2) * drift;
    s.y = height * 0.3 + Math.sin(s.angle + index * 1.5) * drift;
  });

  sinks.forEach((s, index) => {
    const drift = 70 + index * 12;
    s.angle += 0.0035 * s.speed;
    s.x = width * 0.7 + Math.cos(s.angle + index * 2.5) * drift;
    s.y = height * 0.7 + Math.sin(s.angle + index * 1.8) * drift;
  });

  // Generate particles from sources
  if (Math.random() < 0.3) {
    for (const source of sources) {
      for (let i = 0; i < config.sourceRate; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 10;
        const speed = config.spawnVelocity * (0.5 + Math.random() * 1.5);
        const vAngle = angle + (Math.random() - 0.5) * config.spawnSpread * Math.PI;
        particles.push({
          x: source.x + Math.cos(angle) * dist,
          y: source.y + Math.sin(angle) * dist,
          vx: Math.cos(vAngle) * speed,
          vy: Math.sin(vAngle) * speed,
        });
      }
    }
  }

  // Remove particles near sinks
  particles = particles.filter((p) => {
    for (const sink of sinks) {
      const dx = p.x - sink.x;
      const dy = p.y - sink.y;
      const r2 = dx * dx + dy * dy;
      if (r2 < config.sinkRadius * config.sinkRadius) {
        return false;
      }
    }
    return true;
  });

  // Cap particle count
  if (particles.length > config.particleCount * 1.2) {
    particles = particles.slice(particles.length - config.particleCount);
  }
  
  drawParticles();
  time += 0.01;
  requestAnimationFrame(draw);
};

resize();
window.addEventListener("resize", resize);
draw();
