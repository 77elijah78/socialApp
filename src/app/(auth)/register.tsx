import PrimaryButton from "@/components/common/PrimaryButton";
import { icons, images } from "@/constants";
import theme from "@/constants/theme";
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
          style={styles.orText}
        >
          ----------------or continue with----------------
        </Text>
        <View style={styles.socialRow}>
          <PrimaryButton
            title="Google"
            style={styles.socialButton}
            leftIcon={icons.google}
            iconStyle={{
              marginRight: 10,
            }}
            textStyle={styles.socialButtonText}
            onPress={() => {}}
          />
          <PrimaryButton
            title="Apple"
            style={styles.socialButton}
            leftIcon={icons.apple}
            iconStyle={{
              marginRight: 10,
            }}
            textStyle={styles.socialButtonText}
            onPress={() => {}}
          />
        </View>
        <View style={styles.accountRow}>
        <Text>Already have an account?</Text>
        <Text onPress={()=>{
          router.replace("(auth)/login")
        }} style={styles.loginText}> Log In </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    padding: theme.SPACING.xxl,
    backgroundColor: theme.COLORS.bgWhite,
  },
  icon: {
    width: 35,
    height: 35,
    marginRight: 10,
    position: "absolute",
    right: 310,
  },
  title: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.indigo,
  },
  image: {
    width: "100%",
    height: theme.SIZING.signUpImage,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    marginTop: theme.SPACING.xxxxl,
    marginBottom: theme.SPACING.xxl,
  },
  subtitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl9,
    color: theme.COLORS.indigo,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  description: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
    color: theme.COLORS.textBlack,
    marginBottom: theme.SPACING.xxl,
  },
  inputContainer: {
    height: theme.SIZING.inputHeight,
    width: "100%",
    borderColor: theme.COLORS.borderLight,
    borderRadius: theme.BORDER_RADIUS.xl,
    padding: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgAuthInput,
    flexDirection: "row",
    elevation: 1,
  },
  input: {
    flex: 1,
    height: "100%",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
  },
  inputIcon: {
    width: 25,
    height: 25,
    alignSelf: "center",
    marginRight: 10,
  },
  label: {
    marginBottom: 5,
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.light,
    marginHorizontal: 5,
    color: theme.COLORS.textBlack,
    marginTop: 15,
  },
  button: {
    marginTop: theme.SPACING.xxl,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
  },
  orText: {
    textAlign: "center",
    color: theme.COLORS.gray,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    marginVertical: theme.SPACING.xxl,
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  socialButton: {
    width: theme.SIZING.oauthButtonWidth,
    backgroundColor: theme.COLORS.bgLight,
    borderWidth: theme.BORDER.width.xs,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    elevation: 1,
  },
  socialButtonText: {
    color: theme.COLORS.textBlack,
    fontWeight: theme.TYPOGRAPHY.fontWeight.light,
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
  },
  accountRow: {
    flexDirection: "row",
    marginTop: theme.SPACING.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  loginText: {
    color: theme.COLORS.indigo,
  },
});
