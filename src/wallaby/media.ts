import type { ItemDto } from "types/base/models/item-dto";

export const language = (value?: string | null) => {
    if (!value || /^(und|zxx)$/i.test(value)) {
        return { code: "?", name: "Unspecified" };
    }
    try {
        const code = new Intl.Locale(value).language;
        return {
            code: code.length === 2 ? code[0].toUpperCase() + code[1] : "?",
            name:
                new Intl.DisplayNames(["en"], { type: "language" }).of(code) ||
                value,
        };
    } catch {
        return { code: "?", name: value };
    }
};
export const mediaDetails = (item: ItemDto) => {
    const source = item.MediaSources?.[0];
    const streams = source?.MediaStreams || item.MediaStreams || [];
    const video = streams.find(
        (s) =>
            s.Type === "Video" &&
            !(s as { IsAttachedPic?: boolean }).IsAttachedPic,
    );
    const audioTracks = streams.filter((s) => s.Type === "Audio");
    const audio =
        audioTracks.find((s) => s.Index === source?.DefaultAudioStreamIndex) ||
        audioTracks.find((s) => s.IsDefault) ||
        audioTracks[0];
    const width = video?.Width || 0;
    const height = video?.Height || 0;
    const resolution = videoResolution(width, height);
    const codecs: Record<string, string> = {
        h264: "H.264",
        hevc: "HEVC",
        av1: "AV1",
        ac3: "Dolby Digital",
        eac3: "Dolby Digital Plus",
        truehd: "Dolby TrueHD",
        dts: "DTS",
        aac: "AAC",
        flac: "FLAC",
    };
    const channels = audioChannels(audio?.Channels, audio?.ChannelLayout);
    const subs = streams
        .filter((s) => s.Type === "Subtitle")
        .map((s) => language(s.Language));
    return {
        video: [
            resolution,
            codecs[video?.Codec || ""] || video?.Codec?.toUpperCase(),
        ]
            .filter(Boolean)
            .join(" · "),
        audio: [
            codecs[audio?.Codec || ""] || audio?.Codec?.toUpperCase(),
            channels,
        ]
            .filter(Boolean)
            .join(" · "),
        quality: [
            audio?.BitRate ? `${Math.round(audio.BitRate / 1000)} kb/s` : "",
            audio?.SampleRate ? `${audio.SampleRate / 1000} kHz` : "",
        ]
            .filter(Boolean)
            .join(" · "),
        subtitles: [...new Map(subs.map((s) => [s.name, s])).values()],
        // Never substitute file audio language for scraped original-language metadata.
        originalLanguage: item.OriginalLanguage
            ? language(item.OriginalLanguage).name
            : "Not provided by server",
    };
};

function videoResolution(width: number, height: number) {
    if (!width && !height) return "";
    if (width >= 3840 || height >= 2160) return "4K UHD";
    if (width >= 2560 || height > 1080) return "1440p";
    if (width >= 1920 || height > 720) return "1080p";
    if (width >= 1280 || height > 576) return "720p";
    return `${height}p`;
}
function audioChannels(count?: number | null, layout?: string | null) {
    if (count === 1) return "Mono";
    if (count === 2) return "Stereo";
    const surround = layout?.match(/^\d+\.\d+/)?.[0];
    if (surround) return `${surround} Surround`;
    return count ? `${count} channels` : "";
}
