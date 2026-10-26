Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLocalStorage } from 'usehooks-ts';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ViewSettingsButton from 'apps/modern/features/libraries/components/ViewSettingsButton';
import { getDefaultLibraryViewSettings } from 'apps/modern/features/libraries/utils/settings';
import { LibraryTab } from 'types/libraryTab';
import { ViewMode } from 'types/library';

const device = vi.hoisted(() => ({ wide: true }));
vi.mock('./useWallaby', () => ({ useWallaby: () => device.wide }));
vi.mock('lib/globalize', () => ({
    default: { translate: (key: string) => key }
}));
let root: Root;
let host: HTMLDivElement;
const preference = 'movies - movie-library - Wallaby - user';
function Fixture() {
    const [settings, setSettings] = useLocalStorage(
        preference,
        getDefaultLibraryViewSettings(LibraryTab.Movies)
    );
    return (
        <ThemeProvider theme={createTheme()}>
            <ViewSettingsButton
                viewType={LibraryTab.Movies}
                libraryViewSettings={settings}
                setLibraryViewSettings={setSettings}
            />
        </ThemeProvider>
    );
}
async function click(node?: Element | null) {
    expect(node).toBeTruthy();
    await act(async () => {
        node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}
const option = (text: string) =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
        (node) => node.textContent?.trim() === text
    );
beforeEach(async () => {
    localStorage.clear();
    device.wide = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
        root.render(<Fixture />);
    });
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    host.remove();
});
it('renders Standard in the real MUI menu and persists it through recreation with Grid/List', async () => {
    await click(host.querySelector('button'));
    expect(host.getAttribute('aria-hidden')).toBe('true');
    await click(option('Standard View'));
    expect(JSON.parse(localStorage.getItem(preference)!).ViewMode).toBe(
        ViewMode.StandardView
    );
    expect(option('Standard View')?.classList.contains('Mui-selected')).toBe(
        true
    );
    await click(option('ListView'));
    expect(JSON.parse(localStorage.getItem(preference)!).ViewMode).toBe(
        ViewMode.ListView
    );
    await click(option('GridView'));
    expect(JSON.parse(localStorage.getItem(preference)!).ViewMode).toBe(
        ViewMode.GridView
    );
    await click(option('Standard View'));
    await act(async () => {
        root.unmount();
    });
    root = createRoot(host);
    await act(async () => {
        root.render(<Fixture />);
    });
    await click(host.querySelector('button'));
    expect(option('Standard View')?.classList.contains('Mui-selected')).toBe(
        true
    );
});
it('preserves the original two choices for mobile', async () => {
    device.wide = false;
    await act(async () => {
        root.render(<Fixture />);
    });
    await click(host.querySelector('button'));
    expect(option('Standard View')).toBeUndefined();
    expect(option('GridView')).toBeTruthy();
    expect(option('ListView')).toBeTruthy();
});
