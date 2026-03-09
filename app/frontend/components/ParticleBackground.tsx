"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: { x: number; y: number }[];
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const PARTICLE_COUNT = 80;
    const CONNECT_DISTANCE = 100;

    let particles: Particle[] = [];
    let comet: Comet | null = null;

    let isDark = document.documentElement.classList.contains("dark");

    const getColors = () => {
      if (isDark) {
        return {
          particle: "rgba(67,229,160,0.6)",
          line: (o: number) => `rgba(67,229,160,${o * 0.25})`,
          comet: "rgba(120,255,200,1)"
        };
      }

      return {
        particle: "rgba(20,180,110,0.7)",
        line: (o: number) => `rgba(20,180,110,${o * 0.3})`,
        comet: "rgba(40,220,160,1)"
      };
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    /* ---------------- PARTICLES ---------------- */

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,

        // very slow drifting particles
        vx: (Math.random() - 0.5) * 0.04,
        vy: (Math.random() - 0.5) * 0.04,

        r: Math.random() * 1.5 + 0.6,
      });
    }

    /* ---------------- COMET SPAWN ---------------- */

    function spawnComet() {

      const startY = canvas.height * (0.1 + Math.random() * 0.3);

      comet = {
        x: canvas.width + 150, // start outside right screen
        y: startY,

        // diagonal movement right → left
        vx: -(2 + Math.random() * 0.6),
        vy: 1.8 + Math.random() * 0.5,

        trail: []
      };
    }

    /* ---------------- DRAW LOOP ---------------- */

    const draw = () => {

      const colors = getColors();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      /* -------- PARTICLE MOVEMENT -------- */

      particles.forEach((p) => {

        const dx = p.x - cx;
        const dy = p.y - cy;

        const rotX = -dy * 0.00008;
        const rotY = dx * 0.00008;

        p.vx += rotX;
        p.vy += rotY;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = 0.12;

        if (speed > maxSpeed) {
          p.vx *= 0.95;
          p.vy *= 0.95;
        }

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

      });

      /* -------- PARTICLE CONNECTIONS -------- */

      for (let i = 0; i < particles.length; i++) {

        for (let j = i + 1; j < particles.length; j++) {

          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;

          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECT_DISTANCE) {

            const opacity = 1 - dist / CONNECT_DISTANCE;

            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);

            ctx.strokeStyle = colors.line(opacity);
            ctx.lineWidth = 0.6;

            ctx.stroke();
          }
        }
      }

      /* -------- PARTICLE DRAW -------- */

      particles.forEach((p) => {

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);

        ctx.fillStyle = colors.particle;

        ctx.fill();
      });

      /* -------- SPAWN COMET OCCASIONALLY -------- */

      if (!comet && Math.random() < 0.002) {
        spawnComet();
      }

      /* -------- COMET LOGIC -------- */

      if (comet) {

        comet.x += comet.vx;
        comet.y += comet.vy;

        comet.trail.push({ x: comet.x, y: comet.y });

        if (comet.trail.length > 90) {
          comet.trail.shift();
        }

        /* ----- aurora trail ----- */

        for (let i = 0; i < comet.trail.length - 1; i++) {

          const p1 = comet.trail[i];
          const p2 = comet.trail[i + 1];

          const opacity = i / comet.trail.length;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);

          ctx.strokeStyle = `rgba(67,229,160,${opacity})`;
          ctx.lineWidth = 4 * opacity;

          ctx.shadowBlur = 14;
          ctx.shadowColor = "rgba(67,229,160,0.9)";

          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        /* comet head */

        ctx.beginPath();
        ctx.arc(comet.x, comet.y, 3, 0, Math.PI * 2);

        ctx.fillStyle = colors.comet;

        ctx.fill();

        /* remove when leaving screen */

        if (comet.x < -200 || comet.y > canvas.height + 200) {
          comet = null;
        }

      }

      requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
    };

  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}