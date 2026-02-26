"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const PARTICLE_COUNT = 80;
    const CONNECT_DISTANCE = 100;

    let particles: Particle[] = [];
    let isDark = document.documentElement.classList.contains("dark");

    // Theme colors
    const getColors = () => {
      if (isDark) {
        // KEEP YOUR CURRENT DARK COLORS
        return {
          particle: "rgba(220,220,220,0.4)",
          line: (opacity: number) => `rgba(200,200,200,${opacity * 0.15})`,
        };
      }

      // LIGHT THEME COLORS (new)
      return {
        particle: "rgba(60,60,60,0.55)", // darker + visible
        line: (opacity: number) => `rgba(80,80,80,${opacity * 0.25})`, // stronger connections
      };
    };

    const resize = () => {
      const oldWidth = canvas.width;
      const oldHeight = canvas.height;

      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      canvas.width = newWidth;
      canvas.height = newHeight;

      // scale existing particle positions
      particles.forEach((p) => {
        p.x = (p.x / oldWidth) * newWidth;
        p.y = (p.y / oldHeight) * newHeight;
      });
    };

    resize();
    window.addEventListener("resize", resize);

    // create particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        r: Math.random() * 1.5 + 0.5,
      });
    }

    const draw = () => {
      const colors = getColors();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // move particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      // draw connections
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
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // draw particles
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colors.particle;
        ctx.fill();
      });

      requestAnimationFrame(draw);
    };

    // Watch for theme changes (next-themes / tailwind)
    const observer = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains("dark");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
  );
}
