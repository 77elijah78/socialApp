import { icons } from "@/constants";
import { router } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  TextInput,
  useWindowDimensions,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";

export default function PrivateRoom() {
  const { width, height } = useWindowDimensions();
  const [inputMarginBottom, setInputMarginBottom] = useState(0);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e) => {
        setInputMarginBottom(e.endCoordinates.height);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setInputMarginBottom(0);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            router.back();
          }}
        >
          <Image source={icons.leftArrow} style={styles.backIcon} />
        </TouchableOpacity>
        <TouchableOpacity>
          <Image
            source={{
              uri: "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
            }}
            style={styles.avatar}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.userNameContainer}>
          <Text style={styles.userName}>Leila Moradi</Text>
          <Text style={styles.lastSeen}>Online</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ position: "absolute", right: 10, width: 30, height: 30 }}
        >
          <Image source={icons.dots} />
        </TouchableOpacity>
      </View>

      <FlatList
        style={{ flex: 1, paddingHorizontal: 15 }}
        data={[]}
        renderItem={() => {
          return <View></View>;
        }}
        keyboardShouldPersistTaps="handled"
      />

      <View
        style={[
          styles.inputContainer,
          {
            marginBottom: inputMarginBottom,
          },
        ]}
      >
        <TouchableOpacity>
          <Image
            source={icons.add}
            style={{ width: 25, height: 25, borderRadius: 20 }}
          />
        </TouchableOpacity>
        <View style={styles.textInputWrapper}>
          <TouchableOpacity>
            <Image
              source={icons.emoji}
              style={{ width: 25, height: 25, borderRadius: 20 }}
            />
          </TouchableOpacity>
          <TextInput
            placeholder="Message..."
            style={styles.textInput}
            multiline={true}
            numberOfLines={5}
          />
          <TouchableOpacity>
            <Image
              source={icons.mic}
              style={{ width: 25, height: 25, borderRadius: 20 }}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.sendButton}>
          <Image
            source={icons.send}
            style={styles.sendIcon}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e0e0e0",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  backIcon: {
    width: 30,
    height: 30,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 30,
    marginLeft: 20,
  },
  userNameContainer: {
    flexDirection: "column",
    marginLeft: 10,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  lastSeen: {
    color: "#6366f1",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 15,
    borderTopColor: "#aaaaaa",
  },
  textInputWrapper: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#fcf8ff",
    borderRadius: 15,
    paddingHorizontal: 10,
    marginRight: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flexGrow: 1,
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#fcf8ff",
    borderRadius: 15,
    marginRight: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
  },
  sendIcon: {
    width: 30,
    height: 30,
    position: "absolute",
    right: 2,
  },
});