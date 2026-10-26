import { useWallaby } from 'wallaby/useWallaby';
import wallabyIcon from 'wallaby/assets/mark.png';
import icon from '@jellyfin/ux-web/icon-transparent.png';
import Button from '@mui/material/Button/Button';
import React, { FC } from 'react';
import { Link } from 'react-router-dom';

import { useSystemInfo } from 'hooks/useSystemInfo';

const ServerButton: FC = () => {
    const wide = useWallaby();
    const {
        data: systemInfo,
        isPending
    } = useSystemInfo();

    const fallbackName = wide ? 'Wallaby Popcorn' : 'Jellyfin';
    const serverName = systemInfo?.ServerName || fallbackName;
    return (
        <Button
            variant='text'
            size='large'
            color='inherit'
            startIcon={
                <img
                    src={wide ? wallabyIcon : icon}
                    alt=''
                    aria-hidden
                    style={{
                        maxHeight: '1.25em',
                        maxWidth: '1.25em'
                    }}
                />
            }
            component={Link}
            to='/'
        >
            {isPending ? '' : serverName}
        </Button>
    );
};

export default ServerButton;
