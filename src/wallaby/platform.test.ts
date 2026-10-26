Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
import { afterEach, describe, expect, it } from 'vitest';
import { brandText, isWallabyDisplay } from './platform';
import { mediaDetails } from './media';

afterEach(() => {
    document.documentElement.className = '';
});
describe('large-screen platform boundary', () => {
    it('leaves mobile layouts alone even when a desktop class is stale', () => {
        document.documentElement.className = 'layout-mobile layout-desktop';
        expect(isWallabyDisplay()).toBe(false);
        document.documentElement.className = 'layout-tv';
        expect(isWallabyDisplay()).toBe(true);
        document.documentElement.className = 'layout-desktop';
        expect(isWallabyDisplay()).toBe(true);
    });
    it('brands display names while preserving HTML links and upstream URLs', () => {
        expect(brandText('Jellyfin Server and Jellyfin')).toBe(
            'Wallaby Popcorn Server and Wallaby Popcorn'
        );
        expect(brandText('<a href="https://jellyfin.org">Jellyfin</a>')).toBe(
            '<a href="https://jellyfin.org">Wallaby Popcorn</a>'
        );
    });
    it('uses file quality but scraped original language, with no precise video dimensions', () => {
        const result = mediaDetails({
            OriginalLanguage: 'en',
            MediaSources: [
                {
                    DefaultAudioStreamIndex: 1,
                    MediaStreams: [
                        {
                            Type: 'Video',
                            Width: 1280,
                            Height: 682,
                            Codec: 'h264'
                        },
                        {
                            Type: 'Audio',
                            Index: 1,
                            Channels: 6,
                            ChannelLayout: '5.1(side)',
                            Codec: 'eac3',
                            Language: 'jpn',
                            BitRate: 640000,
                            SampleRate: 48000
                        },
                        { Type: 'Subtitle', Language: 'eng' },
                        { Type: 'Subtitle', Language: 'rus' }
                    ]
                }
            ]
        });
        expect(result.video).toBe('720p · H.264');
        expect(result.video).not.toContain('682');
        expect(result.audio).toBe('Dolby Digital Plus · 5.1 Surround');
        expect(result.quality).toBe('640 kb/s · 48 kHz');
        expect(result.originalLanguage).toBe('English');
        expect(result.subtitles.map((s) => s.code)).toEqual(['En', 'Ru']);
        expect(
            mediaDetails({ MediaStreams: [{ Type: 'Audio', Language: 'en' }] })
                .originalLanguage
        ).toBe('Not provided by server');
    });
});
