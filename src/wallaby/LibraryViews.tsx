import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import ResizeObserver from 'resize-observer-polyfill';
import Tv from '@mui/icons-material/Tv';
import SvgIcon from '@mui/material/SvgIcon';
import VolumeUp from '@mui/icons-material/VolumeUp';
import ItemsContainer from 'elements/emby-itemscontainer/ItemsContainer';
import Cards from 'components/cardbuilder/Card/Cards';
import Lists from 'components/listview/List/Lists';
import { useApi } from 'hooks/useApi';
import { useItem } from 'hooks/useItem';
import type { CardOptions } from 'types/cardOptions';
import type { ListOptions } from 'types/listOptions';
import type { ItemDto } from 'types/base/models/item-dto';
import { ViewMode } from 'types/library';
import type { WindowedLibrary } from './useWindowedLibrary';
import { libraryMemory, useWallabyArtwork } from './WallabySurface';
import { mediaDetails } from './media';

interface Props {
    data: WindowedLibrary;
    mode: ViewMode;
    cardOptions: CardOptions;
    listOptions: ListOptions;
}
const detailLink = (item?: ItemDto, serverId?: string) =>
    `/details?${new URLSearchParams({ id: item?.Id || '', serverId: serverId || '' })}`;

export function LibraryViews({
    data,
    mode,
    cardOptions,
    listOptions
}: Readonly<Props>) {
    const location = useLocation();
    const { user, __legacyApiClient__: client } = useApi();
    const memoryKey = `${client?.serverAddress()}|${user?.Id}|${location.pathname}${location.search}|${data.queryKey}`;
    const saved = libraryMemory.get(memoryKey);
    const [selected, setSelected] = useState(saved?.index || 0);
    const [top, setTop] = useState(saved?.scrollTop || 0);
    const [size, setSize] = useState({ width: 900, height: 600 });
    const viewport = useRef<HTMLDivElement>(null);
    const { ensureRange } = data;
    const { select: selectArtwork } = useWallabyArtwork();
    const standard = mode === ViewMode.StandardView;
    const columns =
        mode === ViewMode.GridView ?
            Math.min(12, Math.max(1, Math.floor(size.width / 190))) :
            1;
    let rowHeight = Math.round((size.width / columns) * 1.5 + 75);
    if (standard) rowHeight = 64;
    else if (mode === ViewMode.ListView) rowHeight = 104;
    const total = data.total || 0;
    const start = Math.max(0, Math.floor(top / rowHeight) - 3) * columns;
    const end = Math.min(
        total,
        (Math.ceil((top + size.height) / rowHeight) + 3) * columns
    );
    const selectedItem = data.itemAt(selected);
    const { data: detail } = useItem(
        standard ? selectedItem?.Id || undefined : undefined
    );
    const movie = detail || selectedItem;
    useLayoutEffect(() => {
        const node = viewport.current;
        if (!node) return;
        const update = () =>
            setSize({
                width: node.clientWidth || 900,
                height: node.clientHeight || 600
            });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [standard]);
    useEffect(() => {
        const value = libraryMemory.get(memoryKey);
        setSelected(value?.index || 0);
        setTop(value?.scrollTop || 0);
        if (viewport.current) {
            viewport.current.scrollTop = value?.scrollTop || 0;
        }
    }, [memoryKey]);
    useLayoutEffect(() => {
        if (
            viewport.current
            && top > 0
            && viewport.current.scrollTop === 0
            && total
        ) {
            viewport.current.scrollTop = top;
        }
    }, [total, top]);
    useEffect(() => {
        if (total) ensureRange(start, end);
    }, [start, end, total, ensureRange]);
    useEffect(() => {
        if (standard && movie) selectArtwork(movie);
    }, [standard, movie, selectArtwork]);
    useEffect(() => {
        libraryMemory.set(memoryKey, { index: selected, scrollTop: top });
        // Keep only a small navigation history, not one entry per filter ever used.
        if (libraryMemory.size > 30) {
            libraryMemory.delete(libraryMemory.keys().next().value!);
        }
    }, [memoryKey, selected, top]);
    const focusIndex = useCallback(
        (index: number) => {
            const next = Math.max(0, Math.min(total - 1, index));
            setSelected(next);
            const node = viewport.current;
            if (!node) return;
            const y = Math.floor(next / columns) * rowHeight;
            if (y < node.scrollTop) {
                node.scrollTop = y;
            } else if (y + rowHeight > node.scrollTop + node.clientHeight) {
                node.scrollTop = y + rowHeight - node.clientHeight;
            }
            setTop(node.scrollTop);
            ensureRange(next, Math.min(total, next + 1));
            requestAnimationFrame(() =>
                node
                    .querySelector<HTMLElement>(
                        `[data-wallaby-index="${next}"] a, [data-wallaby-index="${next}"]`
                    )
                    ?.focus({ preventScroll: true })
            );
        },
        [columns, rowHeight, total, ensureRange]
    );
    useEffect(() => {
        if (!standard) return;
        const onKey = (event: KeyboardEvent) => {
            if (
                event.defaultPrevented
                || !/^Arrow(Up|Down|Left|Right)$/.test(event.key)
                || !total
            ) {
                return;
            }
            if (document.querySelector('[role="dialog"], [role="menu"]')) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.matches('input,textarea,select')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const row = target.closest('[data-wallaby-index]');
            const vertical =
                event.key === 'ArrowUp' || event.key === 'ArrowDown';
            if (row && vertical) {
                focusIndex(selected + (event.key === 'ArrowDown' ? 1 : -1));
                return;
            }
            const controls = [
                ...document.querySelectorAll<HTMLElement>(
                    '.wallaby-library-toolbar button:not([disabled]), .wallaby-open-details'
                )
            ].filter((node) => node.getClientRects().length > 0);
            const index = controls.indexOf(
                target.closest<HTMLElement>('button,a') || target
            );
            if (!row && index < 0) {
                focusIndex(selected);
                return;
            }
            const direction =
                event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
            const rowDestination = direction > 0 ? 0 : controls.length - 1;
            const next = row ? rowDestination : index + direction;
            if (next < 0 || next >= controls.length) focusIndex(selected);
            else controls[next]?.focus({ preventScroll: true });
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [standard, total, focusIndex, selected]);
    const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        setTop(event.currentTarget.scrollTop);
    }, []);
    const selectCell = useCallback(
        (event: React.SyntheticEvent<HTMLDivElement>) => {
            const index = Number(event.currentTarget.dataset.wallabyIndex);
            setSelected(index);
            const item = data.itemAt(index);
            if (!standard && item) selectArtwork(item);
        },
        [data, standard, selectArtwork]
    );
    const hoverCell = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            selectCell(event);
            event.currentTarget
                .querySelector<HTMLElement>('a,button')
                ?.focus({ preventScroll: true });
        },
        [selectCell]
    );
    const hoverDetails = useCallback(
        (event: React.PointerEvent<HTMLAnchorElement>) => {
            event.currentTarget.focus({ preventScroll: true });
        },
        []
    );
    const renderItem = (item: ItemDto | undefined) => {
        if (!item) return <span role='status'>Loading title…</span>;
        if (standard) {
            return (
                <Link
                    to={detailLink(item, client?.serverId())}
                    className='wallaby-title-row'
                    data-id={item.Id}
                    data-serverid={client?.serverId()}
                    data-type={item.Type}
                    data-context={cardOptions.context}
                >
                    <strong>{item.Name || 'Untitled'}</strong>
                    <span>{item.ProductionYear}</span>
                </Link>
            );
        }
        if (mode === ViewMode.ListView) {
            return <Lists items={[item]} listOptions={listOptions} />;
        }
        return <Cards items={[item]} cardOptions={cardOptions} />;
    };
    const cells = useMemo(
        () =>
            Array.from(
                { length: Math.max(0, end - start) },
                (_, offset) => start + offset
            ),
        [start, end]
    );
    const technical = movie ? mediaDetails(movie) : undefined;
    const image =
        movie?.ImageTags?.Primary && client && movie.Id ?
            client.getImageUrl(movie.Id, {
                type: 'Primary',
                tag: movie.ImageTags.Primary,
                maxWidth: 700
            }) :
            undefined;
    return (
        <div
            className={`wallaby-library-workspace${standard ? ' standard' : ''}`}
        >
            <div
                ref={viewport}
                className='wallaby-library-scroll'
                tabIndex={0}
                aria-label='Library titles'
                role='grid'
                onScroll={onScroll}
            >
                {data.error && (
                    <div role='alert'>
                        {data.error} <button onClick={data.retry}>Retry</button>
                    </div>
                )}
                {data.total === undefined && !data.error && (
                    <p role='status'>Loading library…</p>
                )}
                {data.total === 0 && <p>No titles match these filters.</p>}
                <div
                    className='wallaby-library-range'
                    style={{ height: Math.ceil(total / columns) * rowHeight }}
                >
                    <div
                        className='itemsContainer wallaby-library-cells'
                        style={{
                            top: Math.floor(start / columns) * rowHeight,
                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
                        }}
                    >
                        <ItemsContainer
                            className='wallaby-native-items'
                            queryKey={['User', user?.Id, 'Items']}
                            reloadItems={data.refresh}
                        >
                            {cells.map((index) => {
                                const item = data.itemAt(index);
                                return (
                                    <div
                                        key={item?.Id || index}
                                        data-wallaby-index={index}
                                        style={{ height: rowHeight }}
                                        className={`wallaby-library-cell${standard && index === selected ? ' selected' : ''}`}
                                        role='row'
                                        onFocus={selectCell}
                                        onPointerEnter={hoverCell}
                                    >
                                        {renderItem(item)}
                                    </div>
                                );
                            })}
                        </ItemsContainer>
                    </div>
                </div>
            </div>
            {standard && (
                <aside
                    className='wallaby-detail-panel'
                    aria-label='Selected title details'
                >
                    {image && (
                        <img
                            className='wallaby-poster'
                            src={image}
                            alt={`${movie?.Name || 'Selected title'} poster`}
                        />
                    )}
                    <h1>{movie?.Name || 'Select a title'}</h1>
                    <p className='wallaby-meta'>
                        {[
                            movie?.ProductionYear,
                            movie?.OfficialRating,
                            movie?.RunTimeTicks ?
                                `${Math.round(movie.RunTimeTicks / 600000000)} min` :
                                '',
                            movie?.CommunityRating ?
                                `★ ${movie.CommunityRating.toFixed(1)}` :
                                ''
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                    <p>{movie?.Genres?.join(' · ')}</p>
                    <p>{movie?.Overview || 'No description available.'}</p>
                    {technical && (
                        <section className='wallaby-technical'>
                            <div className='wallaby-badges'>
                                {technical.video && (
                                    <div>
                                        <Tv />
                                        <strong>{technical.video}</strong>
                                    </div>
                                )}
                                {technical.audio && (
                                    <div>
                                        {technical.audio.startsWith('Dolby') ? (
                                            <SvgIcon
                                                viewBox='0 0 32 24'
                                                titleAccess='Dolby'
                                            >
                                                <path
                                                    d='M2 3h12v18H2z M18 3h12v18H18z M4 5v14c10 0 10-14 0-14 M28 5v14c-10 0-10-14 0-14'
                                                    fill='none'
                                                    stroke='currentColor'
                                                />
                                            </SvgIcon>
                                        ) : (
                                            <VolumeUp />
                                        )}
                                        <span>
                                            <strong>{technical.audio}</strong>
                                            <small>{technical.quality}</small>
                                        </span>
                                    </div>
                                )}
                            </div>
                            <p>
                                Subtitles:{' '}
                                {technical.subtitles.length ?
                                    technical.subtitles.map((lang) => (
                                        <span
                                            key={lang.name}
                                            className='wallaby-language'
                                            title={lang.name}
                                            style={{
                                                backgroundColor: `hsl(${[...lang.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 30% 25%)`
                                            }}
                                        >
                                            {lang.code}
                                        </span>
                                    )) :
                                    'None listed'}
                            </p>
                            <p>
                                Original language: {technical.originalLanguage}
                            </p>
                        </section>
                    )}
                    {movie && (
                        <Link
                            className='wallaby-open-details'
                            to={detailLink(movie, client?.serverId())}
                            onPointerEnter={hoverDetails}
                        >
                            Open details &amp; playback
                        </Link>
                    )}
                </aside>
            )}
        </div>
    );
}
