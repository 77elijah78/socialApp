import React from "react";
import { FlatList, View, Text, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import theme from "@/constants/theme";

const tests = [
  { title: "reza" },

];

export function GradientBorderCard() {
  return (
    <LinearGradient
      colors={[theme.COLORS.accentLightPurple, theme.COLORS.accentBlue]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{
        padding: theme.SPACING.xs,
        borderRadius: theme.BORDER_RADIUS.xxxxxxxxl,
        position: "absolute",
        width: theme.SIZING.storyItem,
        height: theme.SIZING.storyItem,
      }}
    ></LinearGradient>
  );
}

export default function StoriesBar() {
  return (
    <View
      style={{
        width: "100%",
        height: theme.SIZING.storiesBar,
        backgroundColor: theme.COLORS.bgLight,
        borderRadius: theme.BORDER_RADIUS.xl,
        justifyContent: "center",
        marginVertical: 10,
      }}
    >
      <FlatList
        data={tests}
        horizontal={true}
        ListHeaderComponent={
          <View style={{ 
            justifyContent: "center",
            alignItems: "center",
          }} >
        <Image
              source={{
                uri: "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
              }}
              style={{
                width: theme.SIZING.storyImage,
                height: theme.SIZING.storyImage,
                borderRadius: theme.BORDER_RADIUS.xxxxxxxxl,
                backgroundColor: theme.COLORS.white,
                borderWidth: theme.BORDER.width.xs,
                borderColor: theme.COLORS.white,
                marginRight: 5,
                top: 3
              }}
            />
          <Text style={{ color: theme.COLORS.textBlack, fontSize: theme.TYPOGRAPHY.fontSize.xxxl, fontWeight: theme.TYPOGRAPHY.fontWeight.light,top:3 }}>Me</Text>
          </View>
          }
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: theme.COLORS.transparent,
              padding: 5,
              borderRadius: theme.BORDER_RADIUS.xxxxxxxxl,
              width: theme.SIZING.storyItem,
              height: theme.SIZING.storyItem,
              marginRight: 5,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GradientBorderCard></GradientBorderCard>
            <Image
              source={{
                uri: "https://images.pexels.com/photos/2341350/pexels-photo-2341350.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
              }}
              style={{
                width: theme.SIZING.storyImage,
                height: theme.SIZING.storyImage,
                borderRadius: theme.BORDER_RADIUS.xxxxxxxxl,
                backgroundColor: theme.COLORS.white,
                borderWidth: theme.BORDER.width.xs,
                borderColor: theme.COLORS.white,
              }}
            />
            <Text
              style={{
                fontSize: theme.TYPOGRAPHY.fontSize.xl,
                fontWeight: theme.TYPOGRAPHY.fontWeight.light,
                marginLeft: 10,
                color: theme.COLORS.textBlack,
                position: "absolute",
                top: 75,
                left: 15,
                
              }}
            >
              {"Alex"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
