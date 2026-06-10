// Feed Screen
import PostCard from "@/components/feed/PostCard";
import PostScreen from "@/components/feed/PostCard";
import { icons } from "@/constants";
import React from "react";
import { View, Text, FlatList, ScrollView } from "react-native";
import { SocialPost } from "@/types";
import { SafeAreaView } from "react-native-safe-area-context";
import StoriesBar from "@/components/feed/StoriesBar";

const POSTS: SocialPost[] = [
  {
    id: "1",
    user: {
      name: "Sarah Chen",
      username: "sarahchen",
      avatarUrl:
        "https://wallsanddreams.com/wp-content/uploads/2025/01/IMG_1778-1024x576.jpg",
      isVerified: true,
    },
    timestamp: "2m ago",
    content:
      "Just wrapped up an incredible weekend adventure in the mountains 🏔️ There's something magical about being completely disconnected from the world up there. Highly recommend everyone takes a trip like this at least once.",
    imageUrl:
      "https://wallsanddreams.com/wp-content/uploads/2025/01/IMG_1778-1024x576.jpg",
    likeCount: 1243,
    commentCount: 87,
    shareCount: 34,
    isLiked: true,
    isBookmarked: false,
    tags: ["travel", "mountains", "adventure"],
  },
  {
    id: "2",
    user: {
      name: "Marcus Webb",
      username: "marcuswebb",
      avatarUrl:
        "https://wallsanddreams.com/wp-content/uploads/2025/01/IMG_1778-1024x576.jpg",
      isVerified: false,
    },
    timestamp: "18m ago",
    content:
      "Hot take: the best coffee shops are the ones where nobody knows your name ☕ Found this hidden gem today and I'm never leaving.",
    likeCount: 562,
    commentCount: 43,
    shareCount: 12,
    isLiked: false,
    isBookmarked: true,
    tags: ["coffee", "vibes"],
  },
  {
    id: "3",
    user: {
      name: "Leila Moradi",
      username: "leilamoradi",
      avatarUrl:
        "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
      isVerified: true,
    },
    timestamp: "1h ago",
    content:
      "Winter selfies hit different when you're surrounded by your best people 🤍 Grateful for every single moment with this crew.",
    imageUrl:
      "https://images.pexels.com/photos/8905350/pexels-photo-8905350.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    likeCount: 3891,
    commentCount: 214,
    shareCount: 98,
    isLiked: false,
    isBookmarked: false,
    tags: ["friends", "winter", "grateful"],
  },
  {
    id: "4",
    user: {
      name: "James Okafor",
      username: "jamesokafor",
      avatarUrl:
        "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
      isVerified: false,
    },
    timestamp: "3h ago",
    content:
      "Reminder that the ocean doesn't care about your deadlines 🌊 Take the trip. Watch the sunrise. Everything else can wait.",
    imageUrl:
      "https://images.pexels.com/photos/19841535/pexels-photo-19841535.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    likeCount: 2104,
    commentCount: 130,
    shareCount: 77,
    isLiked: true,
    isBookmarked: true,
    tags: ["ocean", "mindfulness", "travel"],
  },
  {
    id: "5",
    user: {
      name: "Anya Petrov",
      username: "anyapetrov",
      avatarUrl: "",
      isVerified: true,
    },
    timestamp: "5h ago",
    content:
      "Forest trails with someone you love make every step worth it 🌲 We covered 12km today and I'd do it all over again.",
    imageUrl: "",
    likeCount: 889,
    commentCount: 61,
    shareCount: 22,
    isLiked: false,
    isBookmarked: false,
    tags: ["hiking", "nature", "love"],
  },
];

const tests = [{ title: "reza" }, { title: "ali" }, { title: "ali" }, { title: "ali" }, { title: "ali" }, { title: "ali" }, { title: "ali" }, { title: "ali" }];

export default function FeedScreen() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#fff",
      }}
    >
      <View> 
            <View style={{paddingVertical:10,paddingHorizontal:15,borderBottomWidth:1,borderBottomColor:"#e0e0e0"}}>
              <Text style={{fontSize:22, fontWeight:"bold",color:"#6366f1"}}>
                Feed
              </Text>
            </View>
            </View>
            
      <FlatList
      style={{
        flex: 1,
        paddingHorizontal:15,
        backgroundColor: "#f5f5f5",
      }}
        data={POSTS}
        showsVerticalScrollIndicator={false}
        numColumns={1}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          
      <StoriesBar />
      
      }
        ListFooterComponent={<View style={{ height: 150 }} />}
        renderItem={({ item, index }) => {
          return <PostCard post={POSTS[index]} />;
        }}
      />
      </SafeAreaView>
    
  );
}
