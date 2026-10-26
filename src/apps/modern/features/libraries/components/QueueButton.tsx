import React, { FC, useCallback } from 'react';
import Button from '@mui/material/Button';
import Queue from '@mui/icons-material/Queue';

import { useLibrary } from '../hooks/useLibrary';
import { playbackManager } from 'components/playback/playbackmanager';
import globalize from 'lib/globalize';
import type { ItemDto } from 'types/base/models/item-dto';

interface QueueButtonProps {
    item: ItemDto | undefined
    items: ItemDto[]
    hasFilters: boolean
    isTextVisible: boolean
}

const QueueButton: FC<QueueButtonProps> = ({
    item,
    items,
    hasFilters,
    isTextVisible
}) => {
    const { windowed } = useLibrary();
    const queue = useCallback(async () => {
        if (item && !hasFilters) {
            playbackManager.queue({
                items: [item]
            }).catch(err => {
                console.error('[QueueButton] failed to add to queue', err);
            });
        } else {
            const actionItems = windowed ? await windowed.itemsForAction() : items;
            if (!actionItems.length) return;
            playbackManager.queue({
                items: actionItems
            }).catch(err => {
                console.error('[QueueButton] failed to add to queue', err);
            });
        }
    }, [hasFilters, item, items, windowed]);

    return (
        <Button
            title={globalize.translate('AddToPlayQueue')}
            startIcon={isTextVisible ? <Queue /> : undefined}
            onClick={queue}
        >
            {isTextVisible ? (
                globalize.translate('AddToPlayQueue')
            ) : (
                <Queue />
            )}
        </Button>
    );
};

export default QueueButton;
