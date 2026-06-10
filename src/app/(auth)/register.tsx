import PrimaryButton from "@/components/common/PrimaryButton";
import { icons, images } from "@/constants";
import { router } from "expo-router";
import React from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RegisterScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TouchableOpacity style={styles.icon} onPress={()=>{
            router.replace("(auth)/login")
          }}>
          <Image source={icons.leftArrow} />
          </TouchableOpacity>
          <Text style={styles.title}>Social App</Text>
        </View>
        <Image source={images.signUpImage} style={styles.image} />
        <Text style={styles.subtitle}>Create Account</Text>
        <Text style={styles.description}>
          Join the community and start sharing.
        </Text>
        <Text style={styles.label}>Full Name</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Jhon Doe"
            secureTextEntry={true}
          />
        </View>
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="hello@vivisocial.com"
            secureTextEntry={true}
          />
        </View>
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="*********"
            secureTextEntry={true}
          />
        </View>
        <PrimaryButton
          style={styles.button}
          title="Sign Up"
          onPress={() => {
            router.replace("(auth)/verify-otp");
          }}
        />
        <Text
          style={{
            textAlign: "center",
            color: "gray",
            fontSize: 15,
            marginVertical: 20,
          }}
        >
          ----------------or continue with----------------
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <PrimaryButton
            title="Google"
            style={{
              width: "48%",
              backgroundColor: "#f5f5f5",
              borderWidth: 1,
              elevation: 1,
              borderRadius: 15,
            }}
            leftIcon={icons.google}
            iconStyle={{
              marginRight: 10,
            }}
            textStyle={{ color: "black", fontWeight: "light", fontSize: 16 }}
            onPress={() => {}}
          />
          <PrimaryButton
            title="Apple"
            style={{
              width: "48%",
              backgroundColor: "#f5f5f5",
              borderWidth: 1,
              elevation: 1,
              borderRadius: 15,
            }}
            leftIcon={icons.apple}
            iconStyle={{
              marginRight: 10,
            }}
            textStyle={{ color: "black", fontWeight: "light", fontSize: 16 }}
            onPress={() => {}}
          />
        </View>
        <View style={{ flexDirection: "row", marginTop: 20,alignItems:"center", justifyContent:"center" }}>
        <Text>Already have an account?</Text>
        <Text onPress={()=>{
          router.replace("(auth)/login")
        }} style={{
          color: "#6366f1",
        }}> Log In </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    padding: 20,
    backgroundColor: "#fff",
  },
  icon: {
    width: 35,
    height: 35,
    marginRight: 10,
    position: "absolute",
    right: 310,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#6366f1",
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 15,
    marginTop: 40,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 30,
    color: "#6366f1",
    fontWeight: "bold",
  },
  description: {
    fontSize: 16,
    color: "black",
    marginBottom: 20,
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
  input: {
    flex: 1,
    height: "100%",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    fontSize: 16,
  },
  inputIcon: {
    width: 25,
    height: 25,
    alignSelf: "center",
    marginRight: 10,
  },
  label: {
    marginBottom: 5,
    fontSize: 16,
    fontWeight: "light",
    marginHorizontal: 5,
    color: "black",
    marginTop: 15,
  },
  button: {
    marginTop: 20,
    borderRadius: 15,
  },
});
