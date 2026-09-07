import PrimaryButton from "@/components/common/PrimaryButton";
import { icons } from "@/constants";
import theme from "@/constants/theme";
import { authService } from "@/services/AuthService";
import { useAppDispatch } from "@/store/hooks";
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
import AppAlert, { appAlert } from "@/components/ui/AppAlert";

export default function LoginScreen() {
  const [blinded, setBlinded] = useState(true);
  const [blindedIcon, setBlindedIcon] = useState(icons.blind);
  const toggleBlinded = () => {
    setBlinded(!blinded);
    setBlindedIcon(blinded ? icons.eye : icons.blind);
  };

  const [form, setForm] = useState({
    email: "alice@example.com",
    password: "Password123!",
  });

  const dispatch = useAppDispatch();

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
            <TextInput
              style={styles.input}
              placeholder="Enter Your email"
              onChangeText={(value) => {
                setForm({ ...form, email: value });
              }}
            />
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
              onChangeText={(value) => {
                setForm({ ...form, password: value });
              }}
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
          onPress={async () => {
            try {
              await authService.login(form.email, form.password, dispatch);
              router.replace("/(tabs)/home");
            } catch (err: any) {
              appAlert({
                title: "Login Failed",
                message: err.message || "Please check your credentials and try again.",
                buttons: [
                  { key: "ok", label: "OK", onPress: () => {} },
                ],
              });
            }
          }}
          style={{ marginTop: theme.SPACING.lg }}
          rightIcon={icons.rightArrow}
        />
        <Text
          style={{
            textAlign: "center",
            color: theme.COLORS.gray,
            fontSize: theme.TYPOGRAPHY.fontSize.xxl,
            marginVertical: theme.SPACING.xxl,
          }}
        >
          --------------or continue with--------------
        </Text>
        <PrimaryButton
          title="continue with google"
          onPress={() => {}}
          leftIcon={icons.google}
          style={{
            marginVertical: theme.SPACING.xxl,
            backgroundColor: theme.COLORS.bgOAuth,
            elevation: 5,
            borderWidth: theme.BORDER.width.sm,
            borderColor: theme.COLORS.gray,
          }}
          iconStyle={{
            marginHorizontal: theme.SPACING.xxl,
          }}
          textStyle={{
            fontSize: theme.TYPOGRAPHY.fontSize.xl4,
            color: theme.COLORS.gray,
          }}
        />
        <PrimaryButton
          title="continue with apple"
          onPress={() => {}}
          leftIcon={icons.apple}
          style={{
            marginVertical: theme.SPACING.xs,
            backgroundColor: theme.COLORS.bgOAuth,
            elevation: 5,
            borderWidth: theme.BORDER.width.sm,
            borderColor: theme.COLORS.gray,
          }}
          iconStyle={{
            marginHorizontal: theme.SPACING.xxl,
          }}
          textStyle={{
            fontSize: theme.TYPOGRAPHY.fontSize.xl4,
            color: theme.COLORS.gray,
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
        <Text>Don&apos;t have an account?</Text>
        <Text
          style={{
            color: theme.COLORS.primaryLink,
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
    paddingVertical: theme.SPACING.xxxxxxl,
    paddingHorizontal: theme.SPACING.xxl,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginVertical: 10,
    color: theme.COLORS.indigo,
  },
  subtitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl8,
  },
  card: {
    width: "100%",
    height: theme.SIZING.loginCard,
    marginVertical: theme.SPACING.xxxxl,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    backgroundColor: theme.COLORS.bgWhite,
    paddingHorizontal: theme.SPACING.xxxxl,
    paddingVertical: theme.SPACING.xxxxl,

    // Android
    elevation: 5,

    // iOS
    shadowColor: theme.COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  inputContainer: {
    height: theme.SIZING.inputHeight,
    width: "100%",
    borderColor: theme.COLORS.borderLight,
    borderRadius: theme.BORDER_RADIUS.xl,
    padding: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgAuthInput,
    flexDirection: "row",
    elevation: 1,
  },
  icon: {
    width: theme.SIZING.iconSm,
    height: theme.SIZING.iconSm,
    alignSelf: "center",
    marginRight: theme.SPACING.lg,
  },
  label: {
    marginBottom: 5,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.light,
    marginHorizontal: 5,
  },
  inputWrapper: {
    marginVertical: theme.SPACING.xxl,
  },
  button: {
    backgroundColor: theme.COLORS.bubbleBg,
    padding: 10,
    borderRadius: theme.BORDER_RADIUS.xl,
    marginVertical: 10,
  },
  labelContiner: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  forgotPassword: {
    color: theme.COLORS.primaryLink,
  },
  input: {
    flex: 1,
    height: "100%",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    fontSize: theme.TYPOGRAPHY.fontSize.xxxl,
  },
});
