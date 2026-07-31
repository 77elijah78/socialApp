import {
  ButtonProps,
  ImageSourcePropType,
  ImageStyle,
  TextStyle,
  ViewStyle,
} from "react-native";

// ─── UI Components ────────────────────────────────────────────────────────────

export interface PrimaryButtonProps extends ButtonProps {
  style?: ViewStyle;
  textStyle?: TextStyle;
  title: string;
  onPress: () => void;
  rightIcon?: ImageSourcePropType;
  leftIcon?: ImageSourcePropType;
  iconStyle?: ImageStyle;
}

// ─── Feed / Posts ─────────────────────────────────────────────────────────────

export interface PostAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isVerified?: boolean;
}

export interface PostCounts {
  likes: number;
  comments: number;
}

export interface PostResponse {
  id: string;
  content: string;
  imageUrls: string[];
  createdAt: Date;
  updatedAt: Date;
  author: PostAuthor;
  _count: PostCounts;
}

export interface SocialPost extends PostResponse {
  timestamp: string;
  imageUrl?: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  createdAt: Date;
  expiresAt: Date;
  isViewed: boolean;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface MessageAuthor {
  id: string;
  username: string;
  avatarUrl: string;
}

export interface MessageResponse {
  id: string;
  content: string;
  mediaUrl: string | null;
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  sender: MessageAuthor;
  receiver?: MessageAuthor | null;
  isRead: boolean;
  createdAt: Date;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
      displayName: string | null;
      createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
  };
}

// ─── UI Props ─────────────────────────────────────────────────────────────────

export interface PrivateMessageCardProps {
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
  duration?: string;
  newMessages?: boolean;
}

export interface MessageCardProps {
  message: string | null;
  time: string;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  onPress?: () => void;
  type: string;
  uri: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE / DOMAIN MODELS
// ─────────────────────────────────────────────────────────────────────────────

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
  sentMessages?: MessageResponse[];
  receivedMessages?: MessageResponse[];
  conversations?: ConversationParticipant[];
  notifications?: Notification[];
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export interface RefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  user?: User;
}

export type CreateRefreshTokenInput = Pick<RefreshToken, "token" | "userId" | "expiresAt">;

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL GRAPH
// ─────────────────────────────────────────────────────────────────────────────

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: Date;
  follower?: User;
  following?: User;
}

export type CreateFollowInput = Pick<Follow, "followerId" | "followingId">;

// ─────────────────────────────────────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────────────────────────────────────

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

export type CreateCommentInput = Pick<Comment, "content" | "authorId" | "postId">;

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants?: ConversationParticipant[];
  messages?: MessageResponse[];
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt: Date | null;
  conversation?: Conversation;
  user?: User;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "LIKE"
  | "COMMENT"
  | "FOLLOW"
  | "MESSAGE"
  | "MENTION";

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

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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
