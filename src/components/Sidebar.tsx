import AppBrand from '@/components/AppBrand';
import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { clearHomeSearch } from '@/utils/homeSearchMemory';
import type { Page, SubPage } from '@/types';
import {
  Home,
  Tv,
  Film,
  Clapperboard,
  Heart,
  Settings,
  User,
  ChevronDown,
  Palette,
  Users,
  Eye,
  Info,
} from 'lucide-react';

type SubItem = {
  sub: SubPage;
  label: string;
  icon: typeof Home;
};

type NavSection = {
  page: Page;
  label: string;
  icon: typeof Home;
  categories?: boolean;
  subItems?: SubItem[];
};

type CategoryItem = {
  id: string;
  name: string;
};

export default function Sidebar() {
  const {
    currentPage,
    setCurrentPage,
    activeSubPage,
    navigate,
    activeProfile,
    t,

    visibleLiveCategories,
    activeLiveCategory,
    setActiveLiveCategory,

    visibleMovieCategories,
    activeMovieCategory,
    setActiveMovieCategory,

    visibleSeriesCategories,
    activeSeriesCategory,
    setActiveSeriesCategory,

    setRequestedSeriesId,
  } = useApp();

  const [expanded, setExpanded] = useState<Page | null>(currentPage);

  useEffect(() => {
    setExpanded(currentPage);
  }, [currentPage]);

  const sections: NavSection[] = [
    {
      page: 'home',
      label: t('nav.home'),
      icon: Home,
    },
    {
      page: 'live',
      label: t('nav.live'),
      icon: Tv,
      categories: true,
    },
    {
      page: 'movies',
      label: t('nav.movies'),
      icon: Film,
      categories: true,
    },
    {
      page: 'series',
      label: t('nav.series'),
      icon: Clapperboard,
      categories: true,
    },
    {
      page: 'favorites',
      label: t('nav.favorites'),
      icon: Heart,
      subItems: [
        {
          sub: 'channels',
          label: t('favorites.channels'),
          icon: Tv,
        },
        {
          sub: 'movies',
          label: t('favorites.movies'),
          icon: Film,
        },
        {
          sub: 'series',
          label: t('favorites.series'),
          icon: Clapperboard,
        },
      ],
    },
    {
      page: 'settings',
      label: t('nav.settings'),
      icon: Settings,
      subItems: [
        {
          sub: 'profiles',
          label: t('nav.profils_et_sources'),
          icon: Users,
        },
        {
          sub: 'appearance',
          label: t('nav.apparence_et_langue'),
          icon: Palette,
        },
        {
          sub: 'content-visibility',
          label: t('nav.contenu_visible'),
          icon: Eye,
        },
        {
          sub: 'about',
          label: t('nav.a_propos'),
          icon: Info,
        },
      ],
    },
  ];

  function getCategories(page: Page): CategoryItem[] {
    if (page === 'live') {
      return visibleLiveCategories;
    }

    if (page === 'movies') {
      return visibleMovieCategories;
    }

    if (page === 'series') {
      return visibleSeriesCategories;
    }

    return [];
  }

  function getActiveCategory(page: Page): string {
    if (page === 'live') {
      return activeLiveCategory;
    }

    if (page === 'movies') {
      return activeMovieCategory;
    }

    if (page === 'series') {
      return activeSeriesCategory;
    }

    return '';
  }

  function getAllLabel(page: Page): string {
    if (page === 'live') {
      return t('nav.allChannels');
    }

    if (page === 'movies') {
      return t('nav.allMovies');
    }

    return t('nav.allSeries');
  }

  function selectCategory(page: Page, categoryId: string) {
    if (page === 'live') {
      setActiveLiveCategory(categoryId);
    } else if (page === 'movies') {
      setActiveMovieCategory(categoryId);
    } else if (page === 'series') {
      setActiveSeriesCategory(categoryId);
      setRequestedSeriesId(null);
    }

    navigate(page, 'all');
  }

  function handleSectionClick(section: NavSection) {
    const hasSubmenu = section.categories || Boolean(section.subItems);

    if (!hasSubmenu) {
      setExpanded(null);

      if (section.page === 'home') clearHomeSearch();

      setCurrentPage(section.page);
      return;
    }

    setExpanded((previous) =>
      previous === section.page ? null : section.page
    );

    if (section.categories) {
      selectCategory(section.page, '');
      return;
    }

    navigate(section.page, section.subItems?.[0]?.sub ?? 'all');
  }

  function categoryClass(active: boolean): string {
    return [
      'block w-full truncate rounded-lg',
      'px-3 py-2 text-left text-xs font-medium',
      'transition-colors',
      'focus-visible:outline focus-visible:outline-2',
      'focus-visible:outline-accent-400',
      active
        ? 'bg-accent-600/10 text-accent-300'
        : 'text-zinc-400 hover:bg-surface-700/40 hover:text-white',
    ].join(' ');
  }

  function isSettingsSubActive(sub: SubPage): boolean {
    if (sub === 'profiles') {
      return (
        activeSubPage === 'profiles' ||
        activeSubPage === 'import-playlist' ||
        activeSubPage === 'all'
      );
    }

    if (sub === 'appearance') {
      return (
        activeSubPage === 'appearance' ||
        activeSubPage === 'player-settings'
      );
    }

    return activeSubPage === sub;
  }

  const profileName = activeProfile
    ? t(activeProfile.name)
    : t('sidebar.noProfile');

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-full w-64 flex-col border-r border-surface-700 bg-surface-850">
      <AppBrand />

      <nav
        aria-label={t('nav.browse')}
        className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-2"
      >
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          {t('nav.browse')}
        </p>

        <ul className="space-y-0.5">
          {sections.map((section) => {
            const isActive = currentPage === section.page;
            const isOpen = expanded === section.page;
            const hasSubmenu = section.categories || Boolean(section.subItems);
            const Icon = section.icon;

            const categories = section.categories
              ? getCategories(section.page)
              : [];

            const activeCategory = getActiveCategory(section.page);

            return (
              <li key={section.page}>
                <button
                  type="button"
                  onClick={() => handleSectionClick(section)}
                  aria-expanded={hasSubmenu ? isOpen : undefined}
                  aria-current={isActive && !hasSubmenu ? 'page' : undefined}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
                    isActive
                      ? 'bg-accent-600/15 text-accent-400'
                      : 'text-zinc-400 hover:bg-surface-700/60 hover:text-zinc-200'
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      isActive
                        ? 'text-accent-400'
                        : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />

                  <span className="flex-1 text-left">{section.label}</span>

                  {hasSubmenu ? (
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      } ${isActive ? 'text-accent-400' : 'text-zinc-600'}`}
                    />
                  ) : isActive ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                  ) : null}
                </button>

                {section.categories && isOpen && (
                  <ul className="mb-1 mt-0.5 space-y-0.5 pl-7">
                    <li>
                      <button
                        type="button"
                        onClick={() => selectCategory(section.page, '')}
                        className={categoryClass(
                          isActive &&
                            activeSubPage === 'all' &&
                            activeCategory === ''
                        )}
                      >
                        {getAllLabel(section.page)}
                      </button>
                    </li>

                    {categories.map((category) => (
                      <li key={`${section.page}-${category.id}`}>
                        <button
                          type="button"
                          onClick={() =>
                            selectCategory(section.page, category.id)
                          }
                          title={category.name}
                          className={categoryClass(
                            isActive &&
                              activeSubPage === 'all' &&
                              activeCategory === category.id
                          )}
                        >
                          {category.name}
                        </button>
                      </li>
                    ))}

                    <li className="pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate('settings', 'content-visibility')
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-zinc-500 transition-colors hover:bg-surface-700/40 hover:text-accent-300"
                      >
                        <Eye className="h-3.5 w-3.5 shrink-0" />

                        {t('nav.gerer_les_categories')}
                      </button>
                    </li>
                  </ul>
                )}

                {section.subItems && isOpen && (
                  <ul className="mb-1 mt-0.5 space-y-0.5 pl-7">
                    {section.subItems.map((item) => {
                      const subActive =
                        isActive &&
                        (section.page === 'settings'
                          ? isSettingsSubActive(item.sub)
                          : activeSubPage === item.sub);

                      const SubIcon = item.icon;

                      return (
                        <li key={item.sub}>
                          <button
                            type="button"
                            onClick={() => navigate(section.page, item.sub)}
                            aria-current={subActive ? 'page' : undefined}
                            className={`group/sub flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
                              subActive
                                ? 'bg-accent-600/10 text-accent-300'
                                : 'text-zinc-500 hover:bg-surface-700/40 hover:text-zinc-300'
                            }`}
                          >
                            <SubIcon
                              className={`h-3.5 w-3.5 shrink-0 ${
                                subActive
                                  ? 'text-accent-400'
                                  : 'text-zinc-600 group-hover/sub:text-zinc-400'
                              }`}
                            />

                            <span title={item.label} className="truncate">
                              {item.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-surface-700 px-3 py-4">
        <button
          type="button"
          onClick={() => navigate('settings', 'profiles')}
          className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{
              backgroundColor: activeProfile?.avatarColor ?? '#8B5CF6',
            }}
          >
            {activeProfile ? (
              profileName.charAt(0).toUpperCase()
            ) : (
              <User className="h-4 w-4" />
            )}
          </span>

          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-zinc-200">
              {profileName}
            </span>

            <span className="block text-xs text-zinc-500">
              {t('sidebar.manageProfiles')}
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
