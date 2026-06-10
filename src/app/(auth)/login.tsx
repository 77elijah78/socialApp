import PrimaryButton from "@/components/common/PrimaryButton";
import { icons } from "@/constants";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const [blinded, setBlinded] = useState(true);
  const [blindedIcon, setBlindedIcon] = useState(icons.blind);
  const toggleBlinded = () => {
    setBlinded(!blinded);
    setBlindedIcon(blinded ? icons.eye : icons.blind);
  };
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Social App</Text>
        <Text style={styles.subtitle}>Welcome Back</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email or Username</Text>
          <View style={styles.inputContainer}>
            <Image source={icons.email} style={styles.icon} />
            <TextInput style={styles.input} placeholder="Enter Your email" />
          </View>
        </View>
        <View style={styles.inputWrapper}>
          <View style={styles.labelContiner}>
            <Text style={styles.label}>Password</Text>
            <Text
              style={styles.forgotPassword}
              onPress={() => {
                router.replace("(auth)/register");
              }}
            >
              Forgot Password?
            </Text>
          </View>
          <View style={styles.inputContainer}>
            <Image source={icons.password} style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Enter Your password"
              secureTextEntry={blinded}
            />
            <TouchableOpacity
              style={{
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => {
                toggleBlinded();
              }}
            >
              <Image
                source={blindedIcon}
                style={[styles.icon, { width: 20, height: 20 }]}
              />
            </TouchableOpacity>
          </View>
        </View>
        <PrimaryButton
          title="Log In"
          onPress={() => {}}
          style={{ marginTop: 10 }}
          rightIcon={icons.rightArrow}
        />
        <Text
          style={{
            textAlign: "center",
            color: "gray",
            fontSize: 15,
            marginVertical: 20,
          }}
        >
          --------------or continue with--------------
        </Text>
        <PrimaryButton
          title="continue with google"
          onPress={() => {}}
          leftIcon={icons.google}
          style={{
            marginVertical: 15,
            backgroundColor: "#fafafa",
            elevation: 5,
            borderWidth: 1,
            borderColor: "gray",
          }}
          iconStyle={{
            marginHorizontal: 20,
          }}
          textStyle={{
            fontSize: 18,
            color: "gray",
          }}
        />
        <PrimaryButton
          title="continue with apple"
          onPress={() => {}}
          leftIcon={icons.apple}
          style={{
            marginVertical: 0,
            backgroundColor: "#fafafa",
            elevation: 5,
            borderWidth: 1,
            borderColor: "gray",
          }}
          iconStyle={{
            marginHorizontal: 20,
          }}
          textStyle={{
            fontSize: 18,
            color: "gray",
          }}
        />
      </View>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Text>Don't have an account?</Text>
        <Text
          style={{
            color: "#6366f1",
          }}
          onPress={() => {
            router.replace("(auth)/register");
          }}
        >
          {" "}
          Sign up{" "}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 50,
    paddingHorizontal: 20,
    backgroundColor: "#f5f5f5",
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    marginVertical: 10,
    color: "#4F46E5",
  },
  subtitle: {
    fontSize: 25,
  },
  card: {
    width: "100%",
    height: 530,
    marginVertical: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    paddingHorizontal: 25,
    paddingVertical: 25,

    // Android
    elevation: 5,

    // iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  inputContainer: {
    height: 55,
    width: "100%",
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#f5f2ff",
    flexDirection: "row",
    elevation: 1,
  },
  icon: {
    width: 25,
    height: 25,
    alignSelf: "center",
    marginRight: 10,
  },
  label: {
    marginBottom: 5,
    fontSize: 14,
    fontWeight: "100",
    marginHorizontal: 5,
  },
  inputWrapper: {
    marginVertical: 10,
  },
  button: {
    backgroundColor: "#f0ecf9",
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
  },
  labelContiner: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  forgotPassword: {
    color: "#6366f1",
  },
  input: {
    flex: 1,
    height: "100%",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    fontSize: 16,
  },
});
