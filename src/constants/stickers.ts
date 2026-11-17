import type { ImageSourcePropType } from "react-native";

import cool from "@/assets/stickers/circle/cool.webp";
import fire from "@/assets/stickers/circle/fire.webp";
import happy from "@/assets/stickers/circle/happy.webp";
import laugh from "@/assets/stickers/circle/laugh.webp";
import love from "@/assets/stickers/circle/love.webp";
import party from "@/assets/stickers/circle/party.webp";
import sad from "@/assets/stickers/circle/sad.webp";
import wow from "@/assets/stickers/circle/wow.webp";

export interface Sticker {
  id: string;
  packId: string;
  name: string;
  tags: string[];
  /** Bundled artwork; preferred over a network URL when present. */
  asset?: ImageSourcePropType;
  /** Remote pack artwork. WebP/GIF/APNG are rendered by expo-image. */
  url?: string;
  width: number;
  height: number;
  animated?: boolean;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string;
  cover?: ImageSourcePropType;
  coverUrl?: string;
  stickers: Sticker[];
  source: "builtin" | "remote";
}

const size = 256;

export const BUILTIN_PACKS: StickerPack[] = [
  {
    id: "circle",
    name: "Circle",
    description: "Hand-drawn reactions for everyday chats.",
    cover: happy,
    source: "builtin",
    stickers: [
      { id: "happy", packId: "circle", name: "Happy", tags: ["smile", "yes", "hello"], asset: happy, width: size, height: size },
      { id: "love", packId: "circle", name: "Love", tags: ["heart", "like", "thanks"], asset: love, width: size, height: size },
      { id: "laugh", packId: "circle", name: "Laugh", tags: ["lol", "funny", "haha"], asset: laugh, width: size, height: size },
      { id: "party", packId: "circle", name: "Party", tags: ["celebrate", "yay", "birthday"], asset: party, width: size, height: size },
    ],
  },
  {
    id: "moods",
    name: "Moods",
    description: "A little drama, a little cool.",
    cover: wow,
    source: "builtin",
    stickers: [
      { id: "sad", packId: "moods", name: "Sad", tags: ["sorry", "tears", "blue"], asset: sad, width: size, height: size },
      { id: "wow", packId: "moods", name: "Wow", tags: ["surprised", "omg", "shock"], asset: wow, width: size, height: size },
      { id: "cool", packId: "moods", name: "Cool", tags: ["sunglasses", "nice", "chill"], asset: cool, width: size, height: size },
      { id: "fire", packId: "moods", name: "Fire", tags: ["hot", "lit", "great"], asset: fire, width: size, height: size },
    ],
  },
];

export function findBuiltinSticker(packId: string, stickerId: string): Sticker | undefined {
  return BUILTIN_PACKS.find((pack) => pack.id === packId)?.stickers.find(
    (sticker) => sticker.id === stickerId,
  );
}

const MARKER = /^\[\[sticker:([a-zA-Z0-9_-]{1,64}):([a-zA-Z0-9_-]{1,64})\]\]$/;

export function encodeStickerMarker(packId: string, stickerId: string): string {
  return `[[sticker:${packId}:${stickerId}]]`;
}

export function parseStickerMarker(content: string | null | undefined): {
  packId: string;
  stickerId: string;
} | null {
  const match = content?.trim().match(MARKER);
  return match ? { packId: match[1], stickerId: match[2] } : null;
}
