import React, {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi } from 'hooks/useApi';
import { appHost } from 'components/apphost';
import screenfull from 'screenfull';
import inputManager from 'scripts/inputManager';
import type { ItemDto } from 'types/base/models/item-dto';
import { useWallaby } from './useWallaby';
import cinema from './assets/cinema.png';
import { isLibraryPath } from 'apps/modern/features/libraries/utils/path';
import './wallaby.scss';

interface ArtworkContext {
    select: (item?: ItemDto) => void;
    setToolbarHeight: (height: number) => void;
}
const Context = createContext<ArtworkContext>({
    select: () => undefined,
    setToolbarHeight: () => undefined
});
export const useWallabyArtwork = () => useContext(Context);
export const libraryPath = isLibraryPath;
export const detailPath = (path: string) =>
    /^\/(details|item)(\/|$)/.test(path);
export const libraryMemory = new Map<
    string,
    { index: number; scrollTop: number }
>();

export function WallabySurface({ children }: Readonly<PropsWithChildren>) {
    const enabled = useWallaby();
    const location = useLocation();
    const navigate = useNavigate();
    const { api, user, __legacyApiClient__: client } = useApi();
    const home = location.pathname === '/' || location.pathname === '/home';
    const library = libraryPath(location.pathname);
    const video = location.pathname === '/video';
    const dashboard =
        /^\/(dashboard|metadata|configuration|networking|users|library)/.test(
            location.pathname
        ) && !library;
    const [toolbarHeight, setToolbarHeight] = useState(64);
    const [requested, setRequested] = useState<string>(cinema);
    const [images, setImages] = useState([{ url: cinema, visible: true }]);
    const activeImage = useRef(cinema);
    const generation = useRef(0);
    const previous = useRef(location.pathname + location.search);
    const origin = useRef<string>();
    const playbackOrigin = useRef<string>();
    const select = useCallback(
        (item?: ItemDto) => {
            const folder =
                !item
                || ['CollectionFolder', 'UserView', 'Folder'].includes(
                    item.Type || ''
                )
                || !!item.CollectionType;
            const id = item?.BackdropImageTags?.length ?
                item.Id :
                item?.ParentBackdropItemId;
            const tag =
                item?.BackdropImageTags?.[0]
                || item?.ParentBackdropImageTags?.[0];
            setRequested(
                !folder && id && tag && client ?
                    client.getImageUrl(id, {
                        type: 'Backdrop',
                        tag,
                        maxWidth: 2560
                    }) :
                    cinema
            );
        },
        [client]
    );
    useEffect(() => {
        const ticket = ++generation.current;
        if (!enabled || requested === activeImage.current) return;
        const timer = window.setTimeout(() => {
            const image = new Image();
            image.onload = async () => {
                try {
                    await image.decode?.();
                } catch {
                    /* onload is enough on older TV engines */
                }
                if (ticket !== generation.current) return;
                const old = activeImage.current;
                activeImage.current = requested;
                setImages([
                    { url: old, visible: true },
                    { url: requested, visible: false }
                ]);
                const reveal = () => {
                    if (ticket === generation.current) {
                        setImages([
                            { url: old, visible: false },
                            { url: requested, visible: true }
                        ]);
                    }
                };
                requestAnimationFrame(() => requestAnimationFrame(reveal));
            };
            image.src = requested;
        }, 1000);
        return () => {
            generation.current = ticket + 1;
            clearTimeout(timer);
        };
    }, [enabled, requested]);
    useEffect(() => {
        if (images.length < 2) return;
        const timer = setTimeout(
            () =>
                setImages((current) =>
                    current.length > 1 && current[1].visible ?
                        [current[1]] :
                        current
                ),
            750
        );
        return () => clearTimeout(timer);
    }, [images]);
    useEffect(() => {
        const old = previous.current;
        if (video && old.split('?')[0] !== '/video') {
            playbackOrigin.current = old;
        }
        if (home) origin.current = undefined;
        if (libraryPath(old.split('?')[0]) && detailPath(location.pathname)) {
            origin.current = old;
        }
        previous.current = location.pathname + location.search;
        if (home || !library) select();
    }, [location.pathname, location.search, home, library, video, select]);
    useEffect(() => {
        if (!enabled || !home || !api || !user?.Id) return;
        let active: Element | null = null;
        let ticket = 0;
        const choose = (target: EventTarget | null) => {
            const card =
                target instanceof Element ?
                    target.closest('.card[data-id], .listItem[data-id]') :
                    null;
            if (card === active) return;
            active = card;
            const current = ++ticket;
            if (
                !card
                || ['CollectionFolder', 'UserView', 'Folder'].includes(
                    (card as HTMLElement).dataset.type || ''
                )
            ) {
                select();
                return;
            }
            const id = (card as HTMLElement).dataset.id;
            if (id) {
                client
                    ?.getItem(user.Id!, id)
                    .then((item) => {
                        if (current === ticket) select(item as ItemDto);
                    })
                    .catch(() => undefined);
            }
        };
        const over = (event: Event) => choose(event.target);
        const out = (event: PointerEvent) => choose(event.relatedTarget);
        document.addEventListener('pointerover', over);
        document.addEventListener('focusin', over);
        document.addEventListener('pointerout', out);
        return () => {
            ticket++;
            document.removeEventListener('pointerover', over);
            document.removeEventListener('focusin', over);
            document.removeEventListener('pointerout', out);
        };
    }, [enabled, home, api, user?.Id, client, select]);
    useEffect(() => {
        if (!enabled) return;
        const blocked = () =>
            [
                ...document.querySelectorAll(
                    '[role="dialog"], [role="menu"], .dialog.opened'
                )
            ].some((node) => {
                const style = getComputedStyle(node);
                return (
                    node.getClientRects().length > 0
                    && !node.closest('[hidden], [aria-hidden="true"], .hide')
                    && style.visibility !== 'hidden'
                    && style.display !== 'none'
                );
            });
        const back = () => {
            if (blocked()) return false;
            if (video) {
                // Leaving the player runs its existing viewbeforehide handler:
                // stop local playback, release the player and leave fullscreen.
                navigate(playbackOrigin.current || '/home', { replace: true });
            } else if (detailPath(location.pathname)) {
                navigate(origin.current || '/home');
            } else if (library) {
                navigate('/home');
            } else if (home && (window.NativeShell || 'tizen' in window)) {
                appHost.exit();
            } else {
                return false;
            }
            return true;
        };
        const key = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented
                || event.altKey
                || event.ctrlKey
                || event.metaKey
                || blocked()
            ) { return; }
            const escape =
                event.key === 'Escape'
                || event.key === 'Esc'
                || event.keyCode === 27;
            if (escape && (video || library || detailPath(location.pathname) || home)) {
                if (!event.repeat && !back()) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            } else if (
                event.key === '\\'
                && !(event.target as HTMLElement).matches('input,textarea,select')
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!event.repeat && screenfull.isEnabled) {
                    screenfull.toggle().catch(() => undefined);
                }
            }
        };
        // Qt/TV input plugins can send Jellyfin Back commands instead of DOM keys.
        // Register through inputManager so it dispatches its cancellable command event.
        const command = (event: CustomEvent<{ command: string }>) => {
            if (
                !event.defaultPrevented
                && event.detail?.command === 'back'
                && back()
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };
        window.addEventListener('keydown', key, true);
        inputManager.on(window, command);
        return () => {
            window.removeEventListener('keydown', key, true);
            inputManager.off(window, command);
        };
    }, [enabled, home, library, video, location.pathname, navigate]);
    const value = useMemo(() => ({ select, setToolbarHeight }), [select]);
    const artwork = (
        <>
            {images.map((image) => (
                <img
                    key={image.url}
                    src={image.url}
                    alt=''
                    className={image.visible ? 'visible' : ''}
                />
            ))}
            <div className='wallaby-art-shade' />
        </>
    );
    // Video is mounted separately at the start of document.body. An opaque,
    // isolated themed wrapper above it would cover both HTML and native video.
    const screenClass = enabled && !video ?
        [
            'wallaby-screen',
            home && 'wallaby-home',
            library && 'wallaby-library',
            dashboard && 'wallaby-dashboard'
        ]
            .filter(Boolean)
            .join(' ') :
        undefined;
    if (!enabled) {
        return <Context.Provider value={value}>{children}</Context.Provider>;
    }
    return (
        <Context.Provider value={value}>
            <div
                style={
                    enabled ?
                        ({
                            '--wallaby-appbar-height': `${toolbarHeight}px`
                        } as React.CSSProperties) :
                        undefined
                }
                className={screenClass}
            >
                {enabled && !dashboard && !video && (
                    <div className='wallaby-backdrop' aria-hidden>
                        {artwork}
                    </div>
                )}
                {children}
                {enabled && home && (
                    <div className='wallaby-header-fade' aria-hidden>
                        <div>{artwork}</div>
                    </div>
                )}
            </div>
        </Context.Provider>
    );
}
