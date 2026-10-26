import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WallabySurface } from './WallabySurface';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const mocks = vi.hoisted(() => ({
    wide: true,
    exit: vi.fn(),
    client: {
        getItem: vi.fn(async (_user: string, id: string) => ({
            Id: id,
            Type: 'Movie',
            BackdropImageTags: ['tag']
        })),
        getImageUrl: (id: string) => `https://example.invalid/${id}.jpg`
    }
}));
vi.mock('./useWallaby', () => ({ useWallaby: () => mocks.wide }));
vi.mock('hooks/useApi', () => ({
    useApi: () => ({
        api: {},
        user: { Id: 'user' },
        __legacyApiClient__: mocks.client
    })
}));
vi.mock('components/apphost', () => ({ appHost: { exit: mocks.exit } }));
vi.mock('apps/modern/features/libraries/utils/path', () => ({
    isLibraryPath: (path: string) =>
        ['/movies', '/tv', '/music'].includes(path)
}));
let root: Root;
let host: HTMLDivElement;
let loads: Array<{ onload?: () => Promise<void>; src: string }>;
function Fixture() {
    const location = useLocation();
    return (
        <WallabySurface>
            <output>
                {location.pathname}
                {location.search}
            </output>
            <Link to='/details?id=movie'>Details</Link>
            <div className='card' data-id='movie' data-type='Movie'>
                <button>Movie</button>
            </div>
            <div
                className='card'
                data-id='library'
                data-type='CollectionFolder'
            >
                <button>Library</button>
            </div>
        </WallabySurface>
    );
}
const path = () => host.querySelector('output')?.textContent;
async function escape() {
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true
            })
        );
    });
}
async function mount(pathname = '/home') {
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[pathname]}>
                <Fixture />
            </MemoryRouter>
        );
    });
}
async function over(selector: string) {
    await act(async () => {
        host.querySelector(selector)!.dispatchEvent(
            new Event('pointerover', { bubbles: true })
        );
    });
}
async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}
beforeEach(() => {
    vi.useFakeTimers();
    loads = [];
    mocks.wide = true;
    mocks.exit.mockClear();
    vi.stubGlobal(
        'Image',
        class {
            src = '';
            onload?: () => Promise<void>;
            decode = async () => undefined;
            constructor() {
                loads.push(this);
            }
        }
    );
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
        callback();
        return 1;
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
it('holds old artwork for a second in both directions and waits for the next image to load', async () => {
    await mount();
    const original = host
        .querySelector('.wallaby-backdrop img')!
        .getAttribute('src');
    await over('[data-id="movie"]');
    await advance(999);
    expect(loads).toHaveLength(0);
    expect(
        host
            .querySelector('.wallaby-backdrop img.visible')!
            .getAttribute('src')
    ).toBe(original);
    await advance(1);
    expect(loads).toHaveLength(1);
    expect(
        host
            .querySelector('.wallaby-backdrop img.visible')!
            .getAttribute('src')
    ).toBe(original);
    await act(async () => {
        await loads[0].onload?.();
    });
    expect(
        host
            .querySelector('.wallaby-backdrop img.visible')!
            .getAttribute('src')
    ).toContain('movie.jpg');
    await advance(750);
    await over('[data-id="library"]');
    await advance(999);
    expect(loads).toHaveLength(1);
    await advance(1);
    await act(async () => {
        await loads[1].onload?.();
    });
    expect(
        host
            .querySelector('.wallaby-backdrop img.visible')!
            .getAttribute('src')
    ).toBe(original);
});
it('ignores late artwork from a title the pointer has already left', async () => {
    await mount();
    const original = host
        .querySelector('.wallaby-backdrop img.visible')!
        .getAttribute('src');
    await over('[data-id="movie"]');
    await advance(1000);
    await over('[data-id="library"]');
    await act(async () => {
        await loads[0].onload?.();
    });
    expect(
        host
            .querySelector('.wallaby-backdrop img.visible')!
            .getAttribute('src')
    ).toBe(original);
});
it('returns details to the precise originating library query, then Home', async () => {
    await mount('/movies?topParentId=films&view=0');
    await act(async () => {
        host.querySelector('a')!.click();
    });
    expect(path()).toBe('/details?id=movie');
    await escape();
    expect(path()).toBe('/movies?topParentId=films&view=0');
    await escape();
    expect(path()).toBe('/home');
});
it('leaves mobile navigation and artwork unchanged', async () => {
    mocks.wide = false;
    await mount('/movies');
    await escape();
    expect(path()).toBe('/movies');
    expect(host.querySelector('.wallaby-backdrop')).toBeNull();
});
