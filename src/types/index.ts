import {
  ButtonProps,
  ImageSourcePropType,
  ImageStyle,
  TextStyle,
  ViewStyle,
} from "react-native";

export interface PostUser {
  name: string;
  username: string;
  avatarUrl: string;
  isVerified?: boolean;
}

export interface SocialPost {
  id: string;
  user: PostUser;
  timestamp: string;
  content: string;
  imageUrl?: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

export interface thumbnail {
  type: string;
  url: string;
  width: number;
  height: number;
  suports_streaming: boolean;
}

export interface Media {
  type: string;
  file_id: string;
  url: string;
  width: number;
  height: number;
  mime_type: string;
  file_size: number;
  duaration: string;
  thumbnail: thumbnail;
}

export interface Message {
  type: "Text" | "Image" | "Video" | "Voice";
  chat_id: string;
  media: Media;
  timestamp: number;
  caption: string;
  replay_to?: string;
}
export default interface primaryButtonProps extends ButtonProps {
  style?: ViewStyle;
  textStyle?: TextStyle;
  title: string;
  onPress: () => void;
  rightIcon?: ImageSourcePropType;
  leftIcon?: ImageSourcePropType;
  iconStyle?: ImageStyle;
}

export interface privateMessagesCardProps {
  message: string;
  time: number;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  isBookmarked?: boolean;
  onPress?: () => void;
  onBookmarkPress?: () => void;
  avatar: ImageSourcePropType;
  type: string;
  duaration?: string;
  newMessages?: boolean;
}

export interface messagesCardProps {
  message: string | null;
  time: string;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  onPress?: () => void;
  type: string;
}

export interface LoginResponse {
  secces: boolean;
  message: string;
  data: {
    accesstoken: string;
    refreshToken: string;

    user: {
      id: string;
      userName: string;
      email: string;
      displayName: string;
      bio: string;
      avatarUri: string;
      isVerified: boolean;
      createdAt: string;
      updatedAt: string;
    };
  };
}

export interface receivedMessage {
  id: string;
  content: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    userName: string;
    avatarUri: string;
  };
}

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export type NotificationType =
  | "LIKE"
  | "COMMENT"
  | "FOLLOW"
  | "MESSAGE"
  | "MENTION";

// ─────────────────────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicUser = Omit<User, "passwordHash">;

export type CreateUserInput = Pick<
  User,
  "username" | "email" | "passwordHash"
> &
  Partial<Pick<User, "displayName" | "bio" | "avatarUrl">>;

export interface UserWithRelations extends User {
  refreshTokens?: RefreshToken[];
  followers?: Follow[];
  following?: Follow[];
  posts?: Post[];
  likes?: Like[];
  comments?: Comment[];
  sentMessages?: Message[];
  receivedMessages?: Message[];
  conversations?: ConversationParticipant[];
  notifications?: Notification[];
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

export interface RefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  user?: User;
}

export type CreateRefreshTokenInput = Pick<
  RefreshToken,
  "token" | "userId" | "expiresAt"
>;

// ─────────────────────────────────────────────────────────────
// SOCIAL GRAPH
// ─────────────────────────────────────────────────────────────

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: Date;
  follower?: User;
  following?: User;
}

export type CreateFollowInput = Pick<Follow, "followerId" | "followingId">;

// ─────────────────────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  content: string;
  imageUrls: string[];
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author?: User;
  likes?: Like[];
  comments?: Comment[];
}

export type CreatePostInput = Pick<Post, "content" | "authorId"> &
  Partial<Pick<Post, "imageUrls">>;

export type UpdatePostInput = Partial<Pick<Post, "content" | "imageUrls">>;

export interface Like {
  userId: string;
  postId: string;
  createdAt: Date;
  user?: User;
  post?: Post;
}

export type CreateLikeInput = Pick<Like, "userId" | "postId">;

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  postId: string;
  createdAt: Date;
  author?: User;
  post?: Post;
}

export type CreateCommentInput = Pick<
  Comment,
  "content" | "authorId" | "postId"
>;

// ─────────────────────────────────────────────────────────────
// MESSAGING
// ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants?: ConversationParticipant[];
  messages?: Message[];
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt: Date | null;
  conversation?: Conversation;
  user?: User;
}

export interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  isRead: boolean;
  createdAt: Date;
  sender?: User;
  receiver?: User | null;
  conversation?: Conversation;
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: NotificationType;
  content: string;
  isRead: boolean;
  userId: string;
  actorId: string | null;
  resourceId: string | null;
  createdAt: Date;
  user?: User;
}

// ─────────────────────────────────────────────────────────────
// API RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}
