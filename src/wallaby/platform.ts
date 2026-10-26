/** Respect Jellyfin's chosen layout, rather than guessing from viewport width. */
export const isWallabyDisplay = () =>
    typeof document !== 'undefined'
    && !document.documentElement.classList.contains('layout-mobile')
    && (document.documentElement.classList.contains('layout-desktop')
        || document.documentElement.classList.contains('layout-tv'));

export const brandText = (text: string) =>
    text
        .split(/(<[^<>]*>)/g)
        .map((part, index) =>
            index % 2 ?
                part :
                part
                    .replace(/\bJellyfin Server\b/g, 'Wallaby Popcorn Server')
                    .replace(/\bJellyfin\b/g, 'Wallaby Popcorn')
        )
        .join('');
