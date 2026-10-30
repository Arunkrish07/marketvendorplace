import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { NavIcon } from '@/lib/navIcons';
import { computeVisibleCount } from './railOverflow';
import type { DashboardNavItem } from './DashboardShell';

// space-y-0.5 between rail items = 0.125rem ≈ 2px, folded into per-item height.
const GAP_PX = 2;

const RAIL_LINK =
  'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition';
const RAIL_LINK_IDLE = 'text-white/70 hover:bg-white/10 hover:text-white';
const RAIL_LINK_ACTIVE = 'bg-white/15 text-white';

function isItemActive(item: DashboardNavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** One rail entry's look — icon over a small label. */
function RailBody({ path, label }: { path: string; label: string }) {
  return (
    <>
      <NavIcon path={path} className="h-[20px] w-[20px] text-current" />
      <span className="dash-rail-label text-[10px] font-medium leading-tight">{label}</span>
    </>
  );
}

/**
 * A vertical icon rail that never scrolls: it renders as many tabs as fit the
 * available height and collapses the remainder into a "More" flyout. Priority is
 * the given order — items overflow from the bottom. Recomputes on resize.
 */
export function OverflowRailNav({
  navItems,
  ariaLabel,
}: {
  navItems: DashboardNavItem[];
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const measureRefs = useRef<(HTMLLIElement | null)[]>([]);
  const moreSampleRef = useRef<HTMLLIElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(navItems.length);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    function recompute() {
      if (!el) return;
      const itemHeights = navItems.map((_, i) => {
        const node = measureRefs.current[i];
        return node ? node.getBoundingClientRect().height + GAP_PX : 0;
      });
      const moreItemHeight = moreSampleRef.current
        ? moreSampleRef.current.getBoundingClientRect().height + GAP_PX
        : 0;
      setVisibleCount(
        computeVisibleCount({ availableHeight: el.clientHeight, itemHeights, moreItemHeight }),
      );
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [navItems]);

  // Close the flyout on navigation.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Outside-click and Esc close the flyout.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (moreBtnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = navItems.slice(0, visibleCount);
  const overflow = navItems.slice(visibleCount);
  const hasOverflow = overflow.length > 0;

  // If the active route lives in the overflow, highlight More and float that
  // item to the top of the flyout so the user never loses their place.
  const activeOverflow = overflow.find((item) => isItemActive(item, location.pathname));
  const overflowOrdered = activeOverflow
    ? [activeOverflow, ...overflow.filter((item) => item !== activeOverflow)]
    : overflow;

  function toggleOpen() {
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (rect) {
      // Anchor the flyout to the right of the More button, clamped on-screen.
      const estimatedHeight = Math.min(overflow.length, 8) * 44 + 16;
      const top = Math.min(rect.top, Math.max(8, window.innerHeight - estimatedHeight - 8));
      setPos({ top, left: rect.right + 8 });
    }
    setOpen((p) => !p);
  }

  return (
    <nav ref={navRef} aria-label={ariaLabel} className="min-h-0 flex-1 overflow-hidden px-1.5 py-2">
      {/* Hidden measuring copy of the full list (+ a More sample) so we can size
          each tab, including two-line labels, before deciding what fits. */}
      <ul aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-full space-y-0.5">
        {navItems.map((item, i) => (
          <li
            key={item.to}
            ref={(node) => {
              measureRefs.current[i] = node;
            }}
            className={`${RAIL_LINK} ${RAIL_LINK_IDLE}`}
          >
            <RailBody path={item.to} label={item.label} />
          </li>
        ))}
        <li ref={moreSampleRef} className={`${RAIL_LINK} ${RAIL_LINK_IDLE}`}>
          <RailBody path="__more__" label={t('nav.more')} />
        </li>
      </ul>

      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `dash-nav-link ${RAIL_LINK} ${isActive ? RAIL_LINK_ACTIVE : RAIL_LINK_IDLE}`
              }
            >
              <RailBody path={item.to} label={item.label} />
            </NavLink>
          </li>
        ))}

        {hasOverflow && (
          <li>
            <button
              ref={moreBtnRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              title={t('nav.more')}
              onClick={toggleOpen}
              className={`dash-nav-link ${RAIL_LINK} w-full ${
                activeOverflow || open ? RAIL_LINK_ACTIVE : RAIL_LINK_IDLE
              }`}
            >
              <MoreHorizontal className="h-[20px] w-[20px] text-current" strokeWidth={2} aria-hidden />
              <span className="dash-rail-label text-[10px] font-medium leading-tight">
                {t('nav.more')}
              </span>
            </button>
          </li>
        )}
      </ul>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label={t('nav.more')}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-[60] max-h-[80vh] min-w-[13rem] overflow-y-auto rounded-xl border border-line bg-surface py-1 text-ink shadow-card"
          >
            {overflowOrdered.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                role="menuitem"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-sm ${
                    isActive
                      ? 'bg-accent/15 font-semibold text-ink'
                      : 'text-ink hover:bg-surface-2'
                  }`
                }
              >
                <NavIcon path={item.to} className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>,
          document.body,
        )}
    </nav>
  );
}
