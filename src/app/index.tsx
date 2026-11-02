import { Redirect } from "expo-router";
import { useAppSelector } from "@/store/hooks";

const Home = () => {
  const isAuthenticated = useAppSelector(
    (state) =>
      state.auth.isAuthenticated &&
      Boolean(state.auth.user?.id && state.auth.token),
  );

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Redirect href="/(tabs)/home" />;
};

export default Home;
