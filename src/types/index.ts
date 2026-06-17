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
  type:string;
  url:string;
  width:number;
  height:number;
  suports_streaming:boolean;
}


export interface Media { 
  type:string
  file_id:string;
  url:string;
  width:number;
  height:number;
  mime_type:string;
  file_size:number;
  duaration:string;
  thumbnail:thumbnail;
}

export interface Message {
  type: "Text" | "Image" | "Video" |  "Voice";
  chat_id: string;
  media:Media;
  timestamp: number;
  caption: string;
  replay_to?: | string;
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
  time: string;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  isBookmarked?: boolean;
  onPress?: () => void;
  onBookmarkPress?: () => void;
  avatar: ImageSourcePropType;
  type:string;
  duaration?:string;
  newMessages?:boolean;
}


export interface messagesCardProps { 
  message: string | null;
  time: string;
  sender: string;
  isRead: boolean;
  isSent: boolean;
  onPress?: () => void;
  type:string;
}