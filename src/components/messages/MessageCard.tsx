import { images } from "@/constants";
import { messagesCardProps } from "@/types";
import { View, Text, StyleSheet, useWindowDimensions,Image } from "react-native";

export default function MessageCard({ type, message,time,isSent,isRead }: messagesCardProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={isSent ? styles.container : [styles.container,{alignItems:"flex-end"}]}>
      {type === "Text" && 
      <View style={styles.contentContainer}>
      <Text>{message}</Text>
      </View>
      }
      {type === "Image" && (
        <View style={styles.imageContainer}>
            <Image
          source={images.signUpImage}
          style={{ width: "100%", height:"95%", borderTopLeftRadius: 15, borderTopRightRadius: 15 }}
          height={300}
          width={290}
        />
      <Text style={{padding:10}}>{message}</Text>
      </View>
)}
{type === "Video" && (
    <View style={styles.contentContainer}>
      <Image
        source={{ uri: message }}
        style={{ width: width - 20, height: height / 3 }}
      />
      <Text>{message}</Text>
    </View>
)}
{type === "Voice" && (
    <View style={styles.contentContainer}>
      <Image
        source={{ uri: message }}
        style={{ width: width - 20, height: height / 3 }}
      />
      <Text>{message}</Text>
    </View>
)}
<Text style={{ fontSize: 14, color: "#646464",alignSelf:isSent ? "flex-start" : "flex-end",marginHorizontal: 10 }}>{"time"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    width: "100%",
    marginVertical: 15,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  contentContainer: {
    flexGrow: 1,
    backgroundColor: "#f0ecf9",
    width: "70%",
    borderRadius: 10,
    padding: 10,
    justifyContent: "center",
  },
  imageContainer: {
    flexGrow: 1,
    height: 340,
    backgroundColor: "#f0ecf9",
    width: "80%",
    borderRadius: 10,
    justifyContent: "center",
  },
});
