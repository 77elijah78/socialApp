import {
  ButtonProps,
  ImageSourcePropType,
  ImageStyle,
  TextStyle,
  ViewStyle,
} from "react-native";

// ─────────────────────────────────────────────────────────────────────
// SHARED DOMAIN TYPES (mirrors backend src/types/index.ts)
// ─────────────────────────────────────────────────────────────────────

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'SHARED_POST' | 'SHARED_STORY';
export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ';
export type NotificationType = 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MESSAGE' | 'MENTION' | 'SYSTEM';

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

export type PublicUser = Omit<User, 'passwordHash'>;

export interface RefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  user?: User;
}

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: Date;
  follower?: User;
  following?: User;
}

export interface Post {
  id: string;
  content: string;
  imageUrls: string[];
  videoUrl: string | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author?: User;
  likes?: Like[];
  comments?: Comment[];
  savedBy?: SavedPost[];
}

export interface Like {
  userId: string;
  postId: string;
  createdAt: Date;
  user?: User;
  post?: Post;
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  postId: string;
  createdAt: Date;
  repliedToId: string | null;
  author?: User;
  post?: Post;
}

export interface SavedPost {
  userId: string;
  postId: string;
  createdAt: Date;
  user?: User;
  post?: Post;
}

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
  deletedAt: Date | null;
  conversation?: Conversation;
  user?: User;
}

export interface Message {
  id: string;
  content: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  type: MessageType;
  status: MessageStatus;
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  sender?: PublicUser;
  receiver?: PublicUser | null;
  conversation?: Conversation;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  duration: number | null;
  repliedToId: string | null;
  repliedTo?: Message | null;
  replies?: Message[];
  forwardedFromId: string | null;
  forwardedFrom?: Message | null;
  forwards?: Message[];
}

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  createdAt: Date;
  expiresAt: Date;
  user?: User;
  views?: StoryView[];
}

export interface StoryView {
  id: string;
  storyId: string;
  story?: Story;
  viewerId: string;
  viewer?: User;
  createdAt: Date;
}

export interface Notification {
  id: string;
  type: NotificationType;
  content: string;
  isRead: boolean;
  userId: string;
  actorId: string | null;
  resourceId: string | null;
  user?: User;
  createdAt: Date;
}

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
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
}

export interface PostCounts {
  likes: number;
  comments: number;
}

export interface PostResponse {
  id: string;
  content: string;
  imageUrls: string[];
  videoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: PostAuthor;
  _count: PostCounts;
  isLiked: boolean;
  isSaved: boolean;
  shareCount: number;
  comments?: Comment[];
}

export interface PostOneResponse extends PostResponse {
  comments: Comment[];
}

export interface SocialPost extends PostResponse {
  timestamp: string;
  imageUrl?: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  isBookmarked?: boolean;
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export interface StoryItem {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption: string | null;
  createdAt: Date;
  expiresAt: Date;
  isViewed: boolean;
  viewsCount?: number;
}

// ─── Messages ─�───────────────────────────────────────────────────────────────

export interface MessageAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface MessageResponse {
  id: string;
  content: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  type: MessageType;
  status: MessageStatus;
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  sender: MessageAuthor;
  receiver?: MessageAuthor | null;
  isRead: boolean;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  duration: number | null;
  repliedToId: string | null;
  repliedTo?: MessageResponse | null;
  forwardedFromId: string | null;
  sharedPostId?: string | null;
  sharedStoryId?: string | null;
  sharedPost?: {
    id: string;
    content: string;
    imageUrls: string[];
    author: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  } | null;
  sharedStory?: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    caption: string | null;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  } | null;
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
      bio: string | null;
      avatarUrl: string | null;
      createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
  };
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
      displayName: string | null;
      bio: string | null;
      avatarUrl: string | null;
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
  onLongPress?: () => void;
  avatar: ImageSourcePropType;
  type: string;
  duration?: string;
  newMessages?: boolean;
  unreadCount?: number;
  status?: string;
  lastMessageStatus?: string;
}

export interface MessageCardProps {
  message: string | null;
  time: string;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  status: string;
  onPress?: () => void;
  onLongPress?: () => void;
  type: string;
  uri: string;
  repliedTo?: {
    id: string;
    content: string;
    senderId: string;
    type: string;
    sender?: {
      username: string;
      avatarUrl: string;
    };
  };
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
