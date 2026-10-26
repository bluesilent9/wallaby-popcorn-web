import React, { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ViewMode } from 'types/library';
import type { CardOptions } from 'types/cardOptions';
import type { ListOptions } from 'types/listOptions';
import type { ItemDto } from 'types/base/models/item-dto';
import { LibraryViews } from './LibraryViews';
import type { WindowedLibrary } from './useWindowedLibrary';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const mocks = vi.hoisted(() => ({
    ensureRange: vi.fn(),
    memory: new Map(),
    select: vi.fn()
}));
vi.mock('./WallabySurface', () => ({
    libraryMemory: mocks.memory,
    useWallabyArtwork: () => ({ select: mocks.select })
}));
vi.mock('hooks/useApi', () => ({ useApi: () => ({ user: { Id: 'user' } }) }));
vi.mock('hooks/useItem', () => ({ useItem: () => ({}) }));
vi.mock('resize-observer-polyfill', () => ({
    default: class {
        observe() {
            /* no resize events in this DOM test */
        }
        disconnect() {
            /* no resources allocated */
        }
    }
}));
vi.mock('elements/emby-itemscontainer/ItemsContainer', () => ({
    default: ({
        children,
        className
    }: PropsWithChildren<{ className?: string }>) => (
        <div className={`itemsContainer ${className || ''}`}>{children}</div>
    )
}));
vi.mock('components/cardbuilder/Card/Cards', () => ({
    default: ({ items }: { items: ItemDto[] }) => (
        <a href='#/details'>{items[0].Name}</a>
    )
}));
vi.mock('components/listview/List/Lists', () => ({
    default: ({ items }: { items: ItemDto[] }) => (
        <a href='#/details'>{items[0].Name}</a>
    )
}));
let root: Root;
let host: HTMLDivElement;
const data: WindowedLibrary = {
    total: 1171,
    itemAt: (index) => ({
        Id: String(index),
        Name: `Movie ${index}`,
        ProductionYear: 2024
    }),
    ensureRange: mocks.ensureRange,
    refresh: vi.fn(),
    retry: vi.fn(),
    itemsForAction: vi.fn(),
    queryKey: 'films'
};
async function render(mode: ViewMode) {
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={['/movies?topParentId=films']}>
                <LibraryViews
                    data={data}
                    mode={mode}
                    cardOptions={{} as CardOptions}
                    listOptions={{} as ListOptions}
                />
            </MemoryRouter>
        );
    });
}
beforeEach(() => {
    mocks.memory.clear();
    mocks.ensureRange.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
        callback();
        return 1;
    });
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
});
for (const mode of [
    ViewMode.GridView,
    ViewMode.ListView,
    ViewMode.StandardView
]) {
    it(`scrolls beyond item 100 in ${mode} with bounded DOM and restores its scroll position`, async () => {
        await render(mode);
        const viewport = host.querySelector<HTMLElement>(
            '.wallaby-library-scroll'
        )!;
        const rowHeight = mode === ViewMode.ListView ? 104 : 64;
        const targetTop = mode === ViewMode.GridView ? 51625 : 500 * rowHeight;
        await act(async () => {
            viewport.scrollTop = targetTop;
            viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        const ranges = mocks.ensureRange.mock.calls;
        expect(ranges.at(-1)?.[0]).toBeGreaterThan(100);
        expect(
            host.querySelectorAll('[data-wallaby-index]').length
        ).toBeLessThan(100);
        expect(host.querySelector('[data-wallaby-index="500"]')).toBeTruthy();
        expect(host.textContent).not.toMatch(/1-100|Loading title/);
        expect(viewport.style.overflow).not.toBe('hidden');
        await act(async () => {
            root.unmount();
        });
        root = createRoot(host);
        await render(mode);
        expect(host.querySelector('.wallaby-library-scroll')!.scrollTop).toBe(
            targetTop
        );
    });
}
it('hover selects and focuses titles while a click retains the native detail route', async () => {
    await render(ViewMode.StandardView);
    const row = host.querySelector<HTMLElement>('[data-wallaby-index="1"]')!;
    await act(async () => {
        row.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });
    // Pointer entry focuses the actual title link without opening it.
    expect(row.querySelector('a')!.getAttribute('href')).toContain(
        '/details?id=1'
    );
    await act(async () => {
        row.querySelector<HTMLElement>('a')!.focus();
        row.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                bubbles: true,
                cancelable: true
            })
        );
    });
    expect(
        host.querySelector('.selected')?.getAttribute('data-wallaby-index')
    ).toBe('2');
});

it('uses a single native action container as the grid with cells as direct children', async () => {
    await render(ViewMode.StandardView);
    const native = host.querySelector('.itemsContainer.wallaby-library-cells')!;
    expect(native).toBeTruthy();
    expect(native.parentElement?.className).toBe('wallaby-library-window');
    expect(
        native.parentElement?.style.getPropertyValue(
            '--wallaby-library-columns'
        )
    ).toBe('1');
    expect(native.querySelector('.itemsContainer')).toBeNull();
    expect(native.children[0].hasAttribute('data-wallaby-index')).toBe(true);
    expect(host.querySelectorAll('.itemsContainer')).toHaveLength(1);
});
