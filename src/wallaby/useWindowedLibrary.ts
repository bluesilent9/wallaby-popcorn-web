import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { useApi } from 'hooks/useApi';
import { fetchGetItemsViewByType } from 'hooks/useFetchItems';
import type { ItemDto } from 'types/base/models/item-dto';
import type { LibraryViewSettings, ParentId } from 'types/library';
import type { LibraryTab } from 'types/libraryTab';

export const BATCH_SIZE = 100;
export const MAX_BATCHES = 8;
export interface WindowedLibrary {
    total?: number;
    error?: string;
    itemAt: (index: number) => ItemDto | undefined;
    ensureRange: (start: number, end: number) => void;
    retry: () => void;
    refresh: () => void;
    itemsForAction: () => Promise<ItemDto[]>;
    queryKey: string;
}

/** A bounded data window shared by Grid, List and Standard. No unbounded flatMap of pages. */
export function useWindowedLibrary(
    enabled: boolean,
    viewType: LibraryTab | undefined,
    parentId: ParentId,
    itemTypes: BaseItemKind[],
    settings: LibraryViewSettings
): WindowedLibrary {
    const currentApi = useApi();
    const { api, user } = currentApi;
    // Visual settings and old page offsets do not change the underlying item query.
    const queryKey = JSON.stringify([
        api?.basePath,
        user?.Id,
        parentId,
        viewType,
        itemTypes,
        settings.Filters,
        settings.Alphabet,
        settings.SortBy,
        settings.SortOrder,
        settings.ImageType
    ]);
    const pages = useRef(new Map<number, ItemDto[]>());
    const pending = useRef(new Map<number, AbortController>());
    const generation = useRef(0);
    const current = useRef({
        currentApi,
        settings,
        viewType,
        parentId,
        itemTypes
    });
    current.current = { currentApi, settings, viewType, parentId, itemTypes };
    const [total, setTotal] = useState<number>();
    const [error, setError] = useState<string>();
    const [revision, setRevision] = useState(0);
    const wanted = useRef([0, BATCH_SIZE]);
    const fetchPage = useCallback(
        (start: number) => {
            if (
                !enabled
                || pages.current.has(start)
                || pending.current.has(start)
            ) {
                return;
            }
            // Desktop/TV only; native mobile fetching remains unchanged.
            // eslint-disable-next-line compat/compat
            const controller = new AbortController();
            const ticket = generation.current;
            pending.current.set(start, controller);
            const c = current.current;
            fetchGetItemsViewByType(
                c.currentApi,
                c.viewType,
                c.parentId,
                c.itemTypes,
                c.settings,
                { signal: controller.signal },
                { startIndex: start, limit: BATCH_SIZE }
            )
                .then((result) => {
                    if (
                        ticket !== generation.current
                        || controller.signal.aborted
                    ) {
                        return;
                    }
                    const count = Number(result?.TotalRecordCount);
                    if (!Number.isSafeInteger(count) || count < 0) {
                        throw new Error('Invalid library result count');
                    }
                    pages.current.delete(start);
                    pages.current.set(start, result?.Items || []);
                    const firstWanted =
                        Math.floor(wanted.current[0] / BATCH_SIZE) * BATCH_SIZE;
                    const lastWanted =
                        Math.floor(
                            Math.max(wanted.current[0], wanted.current[1] - 1)
                                / BATCH_SIZE
                        ) * BATCH_SIZE;
                    while (pages.current.size > MAX_BATCHES) {
                        const victim = [...pages.current.keys()].find(
                            (key) => key < firstWanted || key > lastWanted
                        );
                        if (victim === undefined) break;
                        pages.current.delete(victim);
                    }
                    setTotal(count);
                    setError(undefined);
                    setRevision((value) => value + 1);
                })
                .catch(() => {
                    if (
                        ticket === generation.current
                        && !controller.signal.aborted
                    ) {
                        setError(
                            'Could not load library titles. Check the server connection and retry.'
                        );
                    }
                })
                .finally(() => {
                    if (pending.current.get(start) === controller) {
                        pending.current.delete(start);
                    }
                });
        },
        [enabled, queryKey]
    ); // Query contents, not transient settings object identity.
    useEffect(() => {
        generation.current++;
        pending.current.forEach((controller) => {
            controller.abort();
        });
        pending.current.clear();
        pages.current.clear();
        setTotal(undefined);
        setError(undefined);
        wanted.current = [0, BATCH_SIZE];
        if (enabled && api && user?.Id) fetchPage(0);
        return () => {
            generation.current++;
            pending.current.forEach((controller) => {
                controller.abort();
            });
            pending.current.clear();
        };
    }, [enabled, queryKey, fetchPage, api, user?.Id]);
    const ensureRange = useCallback(
        (start: number, end: number) => {
            // Discard requests from a previous scroll window before requesting this one.
            const boundedEnd = Math.min(
                end,
                start + (MAX_BATCHES - 1) * BATCH_SIZE
            );
            wanted.current = [start, boundedEnd];
            pending.current.forEach((controller, offset) => {
                if (offset + BATCH_SIZE <= start || offset >= boundedEnd) {
                    controller.abort();
                    pending.current.delete(offset);
                }
            });
            if (error) return;
            for (
                let offset = Math.floor(start / BATCH_SIZE) * BATCH_SIZE;
                offset < boundedEnd;
                offset += BATCH_SIZE
            ) {
                fetchPage(offset);
            }
        },
        [error, fetchPage]
    );
    const itemAt = useCallback(
        (index: number) =>
            pages.current.get(Math.floor(index / BATCH_SIZE) * BATCH_SIZE)?.[
                index % BATCH_SIZE
            ],
        [revision, queryKey]
    );
    const retry = useCallback(() => {
        setError(undefined);
        for (
            let offset =
                Math.floor(wanted.current[0] / BATCH_SIZE) * BATCH_SIZE;
            offset < wanted.current[1];
            offset += BATCH_SIZE
        ) {
            fetchPage(offset);
        }
    }, [fetchPage]);
    const refresh = useCallback(() => {
        pages.current.clear();
        setError(undefined);
        for (
            let offset =
                Math.floor(wanted.current[0] / BATCH_SIZE) * BATCH_SIZE;
            offset < wanted.current[1];
            offset += BATCH_SIZE
        ) {
            fetchPage(offset);
        }
    }, [fetchPage]);
    // A playback queue is requested explicitly, never accumulated while browsing.
    const itemsForAction = useCallback(async () => {
        const ticket = generation.current;
        const c = current.current;
        const items: ItemDto[] = [];
        try {
            for (let offset = 0; ; offset += BATCH_SIZE) {
                const result = await fetchGetItemsViewByType(
                    c.currentApi,
                    c.viewType,
                    c.parentId,
                    c.itemTypes,
                    c.settings,
                    undefined,
                    { startIndex: offset, limit: BATCH_SIZE }
                );
                if (ticket !== generation.current) return [];
                items.push(...(result?.Items || []));
                if (
                    !result?.Items?.length
                    || items.length >= (result.TotalRecordCount || 0)
                ) {
                    return items;
                }
            }
        } catch {
            setError(
                'Could not prepare the playback queue. Check the server connection and retry.'
            );
            return [];
        }
    }, []);
    return useMemo(
        () => ({
            total,
            error,
            itemAt,
            ensureRange,
            retry,
            refresh,
            itemsForAction,
            queryKey
        }),
        [
            total,
            error,
            itemAt,
            ensureRange,
            retry,
            refresh,
            itemsForAction,
            queryKey
        ]
    );
}
