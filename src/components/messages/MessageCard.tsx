import { images } from "@/constants";
import { messagesCardProps } from "@/types";
import { View, Text, StyleSheet, useWindowDimensions,Image } from "react-native";
import VoiceMessageBubble from "./VoiceMessage";

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
    <View >
      <VoiceMessageBubble audioUri={"https://dl.rozmusic.com/Music/1402/11/16/Mehdi%20Jahani%20-%20Gole%20Poonam.mp3"} duration={30} isOwn={isSent} waveform={[10, 20, 30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200,210,220,230,240,250,260,270,280,290,300,310,320,330,340,350,360,370,380,390,400,410,420,430,440,450,460,470,480,490,500,510,520,530,540,550,560]} />
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
    marginTop: 10,
    alignItems: "flex-start",
  },
  imageContainer: {
    alignItems: "flex-start",
    flexGrow: 1,
    flex:1,
    backgroundColor: "#f0ecf9",
    width: "80%",
    borderRadius: 15,
    justifyContent: "flex-start",
  },
});
