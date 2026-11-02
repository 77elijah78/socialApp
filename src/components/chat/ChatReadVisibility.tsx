import { createContext } from "react";
/** Conversation-owned read occlusion, not message/socket state. A native media
 * modal/picker/share sheet covers the chat without changing Router focus. */
export const ChatReadVisibility = createContext<() => () => void>(
  () => () => {},
);

/** A real play tap confirms media visibility immediately. Read eligibility still
 * comes exclusively from FlatList; this does not acknowledge any message. */
export const ChatMediaInteraction = createContext<(id?: string) => void>(
  () => {},
);
