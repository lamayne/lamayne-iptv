import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

// Zone principale de l'application, avec :
//  - défilement à la souris : clic maintenu sur le fond de la page + glisser ;
//  - défilement au clavier : flèches haut/bas, Page haut/bas, Début/Fin,
//    Espace (y compris quand aucun élément n'a le focus) ;
//  - mémoire de la position : en revenant du lecteur, on retrouve la page
//    là où on l'avait quittée (par exemple au milieu d'une recherche).

const DRAG_THRESHOLD = 5;
const FRICTION = 0.94;
const MIN_SPEED = 0.03; // px par ms

// Éléments sur lesquels un clic ne doit jamais déclencher le défilement.
const IGNORED =
  'a, button, input, textarea, select, label, video, summary, ' +
  '[role="slider"], [contenteditable="true"], [data-no-pan]';

// Éléments qui gèrent eux-mêmes les touches fléchées.
const OWN_KEYS =
  'input, textarea, select, [contenteditable="true"], [role="slider"], ' +
  '[role="listbox"], [role="menu"], video, [data-keys]';

type Props = {
  scrollKey: string;
  restore: boolean;
  keyboard: boolean;
  className?: string;
  children: ReactNode;
};

type Press = {
  pointerId: number;
  startY: number;
  startTop: number;
  dragging: boolean;
  lastY: number;
  lastTime: number;
  speed: number;
};

export default function PanScrollArea({
  scrollKey,
  restore,
  keyboard,
  className = '',
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const keyRef = useRef(scrollKey);
  const pressRef = useRef<Press | null>(null);
  const suppressClickRef = useRef(false);
  const frameRef = useRef(0);

  /* Mémoire de la position de défilement */
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) return;

    keyRef.current = scrollKey;

    const saved = restore ? positions.current.get(scrollKey) ?? 0 : 0;

    element.scrollTop = saved;

    // Le contenu arrive parfois après le premier rendu : on réessaie un
    // court instant tant que la page n'est pas assez haute.
    let frame = 0;

    if (saved > 0) {
      let tries = 0;

      const retry = () => {
        const target = ref.current;

        if (!target || tries >= 12) return;

        tries += 1;

        if (target.scrollTop < saved - 2) {
          target.scrollTop = saved;
          frame = requestAnimationFrame(retry);
        }
      };

      frame = requestAnimationFrame(retry);
    }

    // Sans focus ailleurs, la zone le prend : les touches de défilement
    // fonctionnent alors directement.
    if (!document.activeElement || document.activeElement === document.body) {
      element.focus({ preventScroll: true });
    }

    return () => cancelAnimationFrame(frame);
    // `restore` ne vaut vrai que pendant le rendu qui suit le changement de page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  /* Clavier : seulement quand le focus est hors de la zone (sinon le
     navigateur défile déjà tout seul) */
  useEffect(() => {
    if (!keyboard) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const element = ref.current;
      const target = event.target as HTMLElement | null;

      if (!element || (target && element.contains(target))) return;
      if (target?.closest(OWN_KEYS)) return;

      const page = element.clientHeight * 0.9;
      const onButton = Boolean(target?.closest('button, a, summary'));
      let top: number | null = null;

      switch (event.key) {
        case 'ArrowDown':
          top = 64;
          break;
        case 'ArrowUp':
          top = -64;
          break;
        case 'PageDown':
          top = page;
          break;
        case 'PageUp':
          top = -page;
          break;
        case ' ':
          // Espace sur un bouton doit rester un clic.
          if (!onButton) top = event.shiftKey ? -page : page;
          break;
        case 'Home':
          element.scrollTo({ top: 0 });
          event.preventDefault();
          return;
        case 'End':
          element.scrollTo({ top: element.scrollHeight });
          event.preventDefault();
          return;
        default:
          return;
      }

      if (top === null) return;

      element.scrollBy({ top });
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboard]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
    },
    []
  );

  /* Souris : attraper le fond de la page */
  function startMomentum(initialSpeed: number) {
    const element = ref.current;

    if (!element) return;

    let speed = initialSpeed;
    let last = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min(48, now - last);

      last = now;

      element.scrollTop -= speed * elapsed;
      speed *= Math.pow(FRICTION, elapsed / 16);

      if (Math.abs(speed) > MIN_SPEED) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const element = ref.current;
    const target = event.target as HTMLElement;

    if (!element || target.closest(IGNORED)) return;

    // Un clic sur la barre de défilement garde son comportement natif.
    const box = element.getBoundingClientRect();

    if (event.clientX > box.left + element.clientWidth) return;

    cancelAnimationFrame(frameRef.current);

    pressRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: element.scrollTop,
      dragging: false,
      lastY: event.clientY,
      lastTime: performance.now(),
      speed: 0,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const press = pressRef.current;
    const element = ref.current;

    if (!press || !element) return;

    const delta = event.clientY - press.startY;

    if (!press.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;

      press.dragging = true;

      try {
        element.setPointerCapture(press.pointerId);
      } catch {
        // Sans capture, le défilement suit tant que le pointeur reste dessus.
      }

      // Évite de sélectionner du texte pendant le glissement.
      window.getSelection()?.removeAllRanges();
      element.style.userSelect = 'none';
      element.style.cursor = 'grabbing';
    }

    element.scrollTop = press.startTop - delta;

    const now = performance.now();
    const elapsed = now - press.lastTime;

    if (elapsed > 0) {
      const instant = (event.clientY - press.lastY) / elapsed;

      press.speed = press.speed * 0.6 + instant * 0.4;
    }

    press.lastY = event.clientY;
    press.lastTime = now;
  }

  function finish() {
    const press = pressRef.current;
    const element = ref.current;

    pressRef.current = null;

    if (!press || !element || !press.dragging) return;

    try {
      element.releasePointerCapture(press.pointerId);
    } catch {
      // Déjà relâché.
    }

    element.style.userSelect = '';
    element.style.cursor = '';

    // Le clic synthétique qui suit un glissement ne doit rien déclencher.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const idle = performance.now() - press.lastTime > 80;

    if (!idle && Math.abs(press.speed) > MIN_SPEED * 3) {
      startMomentum(press.speed);
    }
  }

  return (
    <main
      ref={ref}
      tabIndex={-1}
      className={`outline-none ${className}`}
      onScroll={(event) => {
        positions.current.set(keyRef.current, event.currentTarget.scrollTop);
      }}
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
    >
      {children}
    </main>
  );
}
