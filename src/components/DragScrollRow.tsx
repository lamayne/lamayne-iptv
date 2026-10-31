import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

// Rangée horizontale que l'on fait défiler en « attrapant » le fond avec la
// souris (clic maintenu + glisser), comme sur une tablette. Un simple clic
// reste un clic : le défilement ne démarre qu'après quelques pixels de
// déplacement, et le clic qui suit un glissement est ignoré.
//
// Basé sur les « pointer events » (et non le glisser-déposer HTML5) : dans
// Tauri sous Windows, celui-ci peut être bloqué par la gestion des fichiers
// déposés dans la fenêtre.

const DRAG_THRESHOLD = 5;
const FRICTION = 0.94;
const MIN_SPEED = 0.03; // px par ms

type Props = {
  className?: string;
  children: ReactNode;
};

type Press = {
  pointerId: number;
  startX: number;
  startScroll: number;
  dragging: boolean;
  lastX: number;
  lastTime: number;
  speed: number;
};

export default function DragScrollRow({ className = '', children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<Press | null>(null);
  const suppressClickRef = useRef(false);
  const frameRef = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
    },
    []
  );

  // Flèches gauche / droite : la rangée défile quand le focus est dedans.
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const container = containerRef.current;

    if (!container) return;

    const direction =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

    if (direction === 0) return;

    stopMomentum();
    container.scrollBy({
      left: direction * container.clientWidth * 0.8,
      behavior: 'smooth',
    });
    event.preventDefault();
  }

  function stopMomentum() {
    cancelAnimationFrame(frameRef.current);
  }

  function startMomentum(initialSpeed: number) {
    const container = containerRef.current;

    if (!container) return;

    let speed = initialSpeed;
    let last = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(48, now - last);

      last = now;

      container.scrollLeft -= speed * elapsed;
      speed *= Math.pow(FRICTION, elapsed / 16);

      if (Math.abs(speed) > MIN_SPEED) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Souris uniquement : au doigt, le défilement natif fait déjà le travail.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const container = containerRef.current;

    if (!container) return;

    stopMomentum();

    pressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: container.scrollLeft,
      dragging: false,
      lastX: event.clientX,
      lastTime: performance.now(),
      speed: 0,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    const container = containerRef.current;

    if (!press || !container) return;

    const delta = event.clientX - press.startX;

    if (!press.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;

      press.dragging = true;

      try {
        container.setPointerCapture(press.pointerId);
      } catch {
        // Sans capture, le défilement suit tant que le pointeur reste dessus.
      }

      container.dataset.dragging = 'true';
    }

    container.scrollLeft = press.startScroll - delta;

    const now = performance.now();
    const elapsed = now - press.lastTime;

    if (elapsed > 0) {
      // Vitesse lissée, pour une inertie naturelle au relâchement.
      const instant = (event.clientX - press.lastX) / elapsed;

      press.speed = press.speed * 0.6 + instant * 0.4;
    }

    press.lastX = event.clientX;
    press.lastTime = now;
  }

  function finish() {
    const press = pressRef.current;
    const container = containerRef.current;

    pressRef.current = null;

    if (!press || !container || !press.dragging) return;

    try {
      container.releasePointerCapture(press.pointerId);
    } catch {
      // Déjà relâché.
    }

    delete container.dataset.dragging;

    // Le clic synthétique qui suit un glissement ne doit rien déclencher.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    // Si le pointeur s'est arrêté avant le relâchement, pas d'inertie.
    const idle = performance.now() - press.lastTime > 80;

    if (!idle && Math.abs(press.speed) > MIN_SPEED * 3) {
      startMomentum(press.speed);
    }

  }

  return (
    <div
      ref={containerRef}
      // Le défilement vertical de la page ignore cette zone : ici on défile à l'horizontale.
      data-no-pan
      className={`cursor-grab select-none data-[dragging=true]:cursor-grabbing ${className}`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
      // Empêche le glisser natif des images et des liens.
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
