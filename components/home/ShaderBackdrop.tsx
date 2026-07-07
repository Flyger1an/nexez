'use client'

import { useEffect, useRef } from 'react'

// Raw-WebGL animated periwinkle field that sits behind the hero. No dependencies.
// Domain-warped fbm noise → soft drifting "aurora" blooms in the brand signal color.
// Safety rails:
//   • paused when offscreen (IntersectionObserver) and when the tab is hidden
//   • reduced-motion → draws a single static frame, no rAF loop
//   • no WebGL / context-loss → renders nothing, the section's CSS gradient shows through
//   • DPR capped at 2 and canvas downscaled (0.6×) - the blur hides the lower res, keeps it cheap

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i+vec2(0.,0.)), hash(i+vec2(1.,0.)), u.x),
             mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * 2.3;
  p.x *= u_res.x / u_res.y;
  float t = u_time * 0.045;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 1.7 * q + t * 0.5);
  f = smoothstep(0.28, 0.98, f);
  // fade toward the top-centre so the bloom reads as a light source, not a flat wash
  float vignette = smoothstep(1.15, 0.15, distance(uv, vec2(0.5, 0.18)));
  f *= vignette;
  vec3 peri = vec3(1.000, 0.416, 0.200); // persimmon ~#FF6A33
  gl_FragColor = vec4(peri * f, f * 0.6);
}`

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`

export function ShaderBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    if (!gl) return // graceful: CSS gradient remains

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')

    const SCALE = 0.6
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * SCALE))
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr * SCALE))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let visible = true
    const draw = (ms: number) => {
      resize()
      gl.uniform1f(uTime, ms / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const loop = (ms: number) => {
      draw(ms)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (raf || !visible || document.hidden) return
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    if (reduce) {
      draw(0) // single static frame
    } else {
      const io = new IntersectionObserver(
        (e) => {
          visible = !!e[0]?.isIntersecting
          visible ? start() : stop()
        },
        { threshold: 0 },
      )
      io.observe(canvas)
      const onVis = () => (document.hidden ? stop() : start())
      document.addEventListener('visibilitychange', onVis)
      window.addEventListener('resize', resize)
      start()
      return () => {
        stop()
        io.disconnect()
        document.removeEventListener('visibilitychange', onVis)
        window.removeEventListener('resize', resize)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
    />
  )
}
