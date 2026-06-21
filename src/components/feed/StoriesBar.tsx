import React from "react";
import { FlatList, View, Text, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const tests = [
  { title: "reza" },

];

export function GradientBorderCard() {
  return (
    <LinearGradient
      colors={["#a855f7", "#3b82f6"]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{
        padding: 2, // border thickness
        borderRadius: 100,
        position: "absolute",
        width: 75,
        height: 75,
      }}
    ></LinearGradient>
  );
}

export default function StoriesBar() {
  return (
    <View
      style={{
        width: "100%",
        height: 100,
        backgroundColor: "#f5f5f5",
        borderRadius: 10,
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
                width: 70,
                height: 70,
                borderRadius: 100,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "white",
                marginRight: 5,
                top: 3
              }}
            />
          <Text style={{ color: "black", fontSize: 16, fontWeight: "light",top:3 }}>Me</Text>
          </View>
          }
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: "transparent",
              padding: 5,
              borderRadius: 100,
              width: 75,
              height: 75,
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
                width: 70,
                height: 70,
                borderRadius: 100,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "white",
              }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "light",
                marginLeft: 10,
                color: "black",
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
