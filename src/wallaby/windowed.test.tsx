Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryTab } from 'types/libraryTab';
import { ViewMode, type LibraryViewSettings } from 'types/library';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import { useWindowedLibrary, type WindowedLibrary } from './useWindowedLibrary';
const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    api: { basePath: 'https://example.invalid' },
    user: { Id: 'user' }
}));
vi.mock('hooks/useFetchItems', () => ({
    fetchGetItemsViewByType: (...args: unknown[]) => mocks.fetch(...args)
}));
vi.mock('hooks/useApi', () => ({
    useApi: () => ({ api: mocks.api, user: mocks.user })
}));
let root: Root;
let host: HTMLDivElement;
let model: WindowedLibrary;
const settings: LibraryViewSettings = {
    ViewMode: ViewMode.GridView,
    ImageType: ImageType.Primary,
    ShowTitle: true,
    CardLayout: false,
    SortBy: [ItemSortBy.SortName],
    SortOrder: SortOrder.Ascending,
    StartIndex: 500,
    Filters: { Years: [2024] }
};
function Fixture({
    mode = ViewMode.GridView,
    mobile = false,
    query = settings
}: {
    mode?: ViewMode;
    mobile?: boolean;
    query?: LibraryViewSettings;
}) {
    model = useWindowedLibrary(!mobile, LibraryTab.Movies, 'library', [], {
        ...query,
        ViewMode: mode
    });
    return null;
}
beforeEach(() => {
    mocks.fetch
        .mockReset()
        .mockImplementation(
            async (_api, _view, _id, _types, _settings, _options, page) => ({
                Items: Array.from(
                    { length: Math.min(page.limit, 1171 - page.startIndex) },
                    (_, i) => ({
                        Id: String(page.startIndex + i),
                        Name: `Movie ${page.startIndex + i}`
                    })
                ),
                TotalRecordCount: 1171
            })
        );
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    host.remove();
});
it('browses all 1171 titles with bounded pages, preserves filters and avoids resets on view changes', async () => {
    await act(async () => {
        root.render(<Fixture />);
    });
    expect(model.total).toBe(1171);
    expect(model.itemAt(0)?.Name).toBe('Movie 0');
    expect(mocks.fetch.mock.calls[0][6]).toEqual({ startIndex: 0, limit: 100 });
    expect(mocks.fetch.mock.calls[0][4].Filters).toEqual({ Years: [2024] });
    for (let start = 100; start < 1171; start += 100) {
        await act(async () => {
            model.ensureRange(start, Math.min(start + 20, 1171));
        });
    }
    expect(model.itemAt(1170)?.Name).toBe('Movie 1170');
    expect(model.itemAt(0)).toBeUndefined();
    const calls = mocks.fetch.mock.calls.length;
    await act(async () => {
        root.render(<Fixture mode={ViewMode.StandardView} />);
    });
    expect(mocks.fetch.mock.calls.length).toBe(calls);
    expect(model.itemAt(1170)?.Id).toBe('1170');
    await act(async () => {
        root.render(
            <Fixture query={{ ...settings, Filters: { Years: [2025] } }} />
        );
    });
    expect(mocks.fetch.mock.calls.at(-1)?.[4].Filters).toEqual({
        Years: [2025]
    });
    expect(model.itemAt(1170)).toBeUndefined();
});
it('leaves mobile on its native paged queries', async () => {
    await act(async () => {
        root.render(<Fixture mobile />);
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
});

it('prepares a complete filtered playback queue only on explicit request', async () => {
    await act(async () => {
        root.render(<Fixture />);
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const items = await model.itemsForAction();
    expect(items).toHaveLength(1171);
    expect(mocks.fetch.mock.calls.at(-1)?.[4].Filters).toEqual({
        Years: [2024]
    });
    expect(model.itemAt(1170)).toBeUndefined();
});
