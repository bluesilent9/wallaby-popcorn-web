import { useSyncExternalStore } from 'react';
import layoutManager from 'components/layoutManager';
import Events from 'utils/events';
import { isWallabyDisplay } from './platform';

const subscribe = (callback: () => void) => {
    Events.on(layoutManager, 'modechange', callback);
    return () => Events.off(layoutManager, 'modechange', callback);
};
export const useWallaby = () =>
    useSyncExternalStore(subscribe, isWallabyDisplay, () => false);
